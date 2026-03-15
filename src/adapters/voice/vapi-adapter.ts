/**
 * Vapi Voice Adapter — receives call transcripts via Vapi webhook.
 *
 * Vapi sends webhook events for call status, transcripts, and function calls.
 * This adapter starts a local HTTP server that receives these events and
 * normalizes them to VoiceEvent format.
 *
 * Configure your Vapi assistant's server URL to point to this webhook.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { VoiceAdapter, VoiceAdapterCallbacks, VoiceEvent } from "./types.js";

export interface VapiAdapterOptions {
  /** Port to listen on for webhooks (default: 3001) */
  port?: number;
  /** Host to bind to (default: 0.0.0.0) */
  host?: string;
  /** Vapi API key for validation (optional) */
  apiKey?: string;
}

/**
 * Vapi adapter for voice monitoring.
 * Starts a webhook server that receives Vapi call events.
 */
export class VapiAdapter implements VoiceAdapter {
  readonly platform = "vapi";
  private server: Server | null = null;
  private callbacks: VoiceAdapterCallbacks | null = null;
  private options: VapiAdapterOptions;
  private connected = false;

  constructor(options: VapiAdapterOptions = {}) {
    this.options = options;
  }

  async connect(callbacks: VoiceAdapterCallbacks): Promise<void> {
    this.callbacks = callbacks;
    const port = this.options.port ?? 3001;
    const host = this.options.host ?? "0.0.0.0";

    return new Promise<void>((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));

      this.server.on("error", (err) => {
        callbacks.onError(`Vapi webhook server error: ${err.message}`);
        reject(err);
      });

      this.server.listen(port, host, () => {
        this.connected = true;
        callbacks.onConnected?.();
        resolve();
      });
    });
  }

  async disconnect(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.connected = false;
          this.callbacks?.onDisconnected?.();
          this.callbacks = null;
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        this.processVapiEvent(payload);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        this.callbacks?.onError(`Failed to parse Vapi webhook: ${err instanceof Error ? err.message : err}`);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
      }
    });
  }

  private processVapiEvent(payload: Record<string, unknown>): void {
    const messageType = payload.message as Record<string, unknown> | undefined;
    if (!messageType) return;

    const type = messageType.type as string;

    // Handle transcript events
    if (type === "transcript") {
      const event: VoiceEvent = {
        timestamp: typeof messageType.timestamp === "string" ? messageType.timestamp : new Date().toISOString(),
        speaker: messageType.role === "assistant" ? "agent" : "user",
        text: typeof messageType.transcript === "string" ? messageType.transcript : "",
        prosody: undefined,
      };

      if (event.text) {
        this.callbacks?.onSegment(event);
      }
    }

    // Handle conversation-update events (contain full transcript segments)
    if (type === "conversation-update") {
      const conversation = messageType.conversation as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(conversation)) {
        for (const msg of conversation) {
          const event: VoiceEvent = {
            timestamp: new Date().toISOString(),
            speaker: msg.role === "assistant" ? "agent" : "user",
            text: typeof msg.content === "string" ? msg.content : "",
          };
          if (event.text) {
            this.callbacks?.onSegment(event);
          }
        }
      }
    }

    // Handle end-of-call
    if (type === "end-of-call-report") {
      this.callbacks?.onDisconnected?.();
    }
  }
}
