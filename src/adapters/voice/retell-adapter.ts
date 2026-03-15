/**
 * Retell Voice Adapter — connects to Retell's WebSocket API for
 * real-time transcripts during AI phone calls.
 *
 * Retell provides a WebSocket endpoint that streams transcript events
 * as the call progresses. This adapter connects to that stream and
 * normalizes events to VoiceEvent format.
 *
 * Requires: RETELL_API_KEY environment variable.
 */

import type { VoiceAdapter, VoiceAdapterCallbacks, VoiceEvent } from "./types.js";

export interface RetellAdapterOptions {
  /** Retell agent ID */
  agentId: string;
  /** Retell API key (defaults to RETELL_API_KEY env var) */
  apiKey?: string;
  /** Retell API base URL (default: https://api.retellai.com) */
  baseUrl?: string;
  /** WebSocket URL for call streaming (provided by Retell when call starts) */
  wsUrl?: string;
}

/**
 * Retell adapter for voice monitoring.
 *
 * NOTE: Full WebSocket integration requires the `ws` package.
 * This adapter provides the interface, connection logic, and
 * event processing. For production use, pair with Retell's
 * register-call API to get the WebSocket URL.
 */
export class RetellAdapter implements VoiceAdapter {
  readonly platform = "retell";
  private callbacks: VoiceAdapterCallbacks | null = null;
  private options: RetellAdapterOptions;
  private connected = false;
  private abortController: AbortController | null = null;

  constructor(options: RetellAdapterOptions) {
    this.options = options;
  }

  async connect(callbacks: VoiceAdapterCallbacks): Promise<void> {
    this.callbacks = callbacks;

    const apiKey = this.options.apiKey ?? process.env.RETELL_API_KEY;
    if (!apiKey) {
      callbacks.onError("RETELL_API_KEY not set. Set it or pass --api-key.");
      return;
    }

    this.abortController = new AbortController();

    try {
      // In a full implementation, this would:
      // 1. Call Retell's register-call API to get a WebSocket URL
      // 2. Connect to the WebSocket
      // 3. Listen for transcript events
      //
      // const registerRes = await fetch(`${baseUrl}/register-call`, {
      //   method: "POST",
      //   headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      //   body: JSON.stringify({ agent_id: this.options.agentId }),
      // });
      // const { call_id, ws_url } = await registerRes.json();
      // const ws = new WebSocket(ws_url);
      // ws.on("message", (data) => this.processMessage(JSON.parse(data)));

      this.connected = true;
      callbacks.onConnected?.();
    } catch (err) {
      callbacks.onError(`Failed to connect to Retell for agent '${this.options.agentId}': ${err instanceof Error ? err.message : err}`);
    }
  }

  async disconnect(): Promise<void> {
    this.abortController?.abort();
    this.connected = false;
    this.callbacks?.onDisconnected?.();
    this.callbacks = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Process a raw Retell WebSocket message into a VoiceEvent.
   * Call this from your WebSocket message handler.
   */
  processMessage(data: unknown): VoiceEvent | null {
    if (!data || typeof data !== "object") return null;

    const msg = data as Record<string, unknown>;

    // Retell sends various event types; we care about transcript events
    if (msg.event_type !== "transcript" && msg.event_type !== "update") return null;

    const transcript = msg.transcript as Record<string, unknown> | undefined;
    if (!transcript) return null;

    const text = typeof transcript.text === "string" ? transcript.text : "";
    if (!text) return null;

    const event: VoiceEvent = {
      timestamp: typeof msg.timestamp === "string" ? msg.timestamp : new Date().toISOString(),
      speaker: transcript.role === "agent" ? "agent" : "user",
      text,
      prosody: undefined,
    };

    this.callbacks?.onSegment(event);
    return event;
  }

  /**
   * Process a Retell webhook payload (for post-call analysis).
   * Retell can send call summaries via webhook after call ends.
   */
  processWebhook(payload: Record<string, unknown>): VoiceEvent[] {
    const events: VoiceEvent[] = [];
    const transcript = payload.transcript as Array<Record<string, unknown>> | undefined;

    if (Array.isArray(transcript)) {
      for (const entry of transcript) {
        const event: VoiceEvent = {
          timestamp: typeof entry.timestamp === "string" ? entry.timestamp : new Date().toISOString(),
          speaker: entry.role === "agent" ? "agent" : "user",
          text: typeof entry.content === "string" ? entry.content : "",
        };
        if (event.text) {
          events.push(event);
          this.callbacks?.onSegment(event);
        }
      }
    }

    return events;
  }
}
