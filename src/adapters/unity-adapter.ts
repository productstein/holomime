/**
 * Unity Adapter — HTTP server that Unity clients poll or receive SSE from.
 *
 * Pushes embodied configs as structured JSON messages to connected Unity clients.
 * Supports parameter interpolation for smooth transitions between configs.
 *
 * Two modes:
 *   1. POST /config — Unity client polls for latest config
 *   2. GET  /stream — Server-Sent Events for real-time push
 *
 * Protocol (JSON payload):
 *   { type: "config", data: CompiledEmbodiedConfig, transition: TransitionOptions }
 *   { type: "parameter", channel: string, data: object, transition: TransitionOptions }
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { RuntimeAdapter } from "../core/embodiment-runtime.js";
import type { CompiledEmbodiedConfig } from "../core/embodiment-types.js";

// ─── Types ──────────────────────────────────────────────────

export interface TransitionOptions {
  /** Duration of the interpolation in ms (default: 500) */
  duration_ms: number;
  /** Easing curve (default: ease_in_out) */
  easing: "linear" | "ease_in" | "ease_out" | "ease_in_out";
}

interface UnityMessage {
  type: "config" | "parameter";
  channel?: string;
  data: Record<string, unknown>;
  transition?: TransitionOptions;
  timestamp: string;
}

export interface UnityAdapterOptions {
  /** Port for the HTTP/SSE server (default: 8765) */
  port: number;
  /** Host to bind to (default: 0.0.0.0) */
  host?: string;
  /** Default transition options for config pushes */
  defaultTransition?: TransitionOptions;
}

const DEFAULT_TRANSITION: TransitionOptions = {
  duration_ms: 500,
  easing: "ease_in_out",
};

// ─── Adapter ────────────────────────────────────────────────

export class UnityAdapter implements RuntimeAdapter {
  readonly type = "unity" as const;

  private server: Server | null = null;
  private sseClients: Set<ServerResponse> = new Set();
  private connected = false;
  private latestConfig: CompiledEmbodiedConfig | null = null;

  private readonly port: number;
  private readonly host: string;
  private readonly defaultTransition: TransitionOptions;

  constructor(options: UnityAdapterOptions) {
    this.port = options.port;
    this.host = options.host ?? "0.0.0.0";
    this.defaultTransition = options.defaultTransition ?? DEFAULT_TRANSITION;
  }

  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        this.server = createServer((req, res) => this.handleRequest(req, res));

        this.server.listen(this.port, this.host, () => {
          this.connected = true;
          resolve();
        });

        this.server.on("error", (err) => {
          if (!this.connected) {
            reject(err);
          }
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  async disconnect(): Promise<void> {
    // Close all SSE connections
    for (const res of this.sseClients) {
      res.end();
    }
    this.sseClients.clear();

    // Close the HTTP server
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    this.connected = false;
  }

  async push(config: CompiledEmbodiedConfig): Promise<void> {
    if (!this.connected) {
      throw new Error("Unity adapter not connected");
    }

    this.latestConfig = config;

    const message: UnityMessage = {
      type: "config",
      data: config as unknown as Record<string, unknown>,
      transition: this.defaultTransition,
      timestamp: new Date().toISOString(),
    };

    this.broadcastSSE(message);
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Push a single parameter channel update (e.g., just motion or just gaze)
   * with interpolation for smooth transitions.
   */
  async pushParameter(
    channel: string,
    data: Record<string, unknown>,
    transition?: TransitionOptions,
  ): Promise<void> {
    if (!this.connected) {
      throw new Error("Unity adapter not connected");
    }

    const message: UnityMessage = {
      type: "parameter",
      channel,
      data,
      transition: transition ?? this.defaultTransition,
      timestamp: new Date().toISOString(),
    };

    this.broadcastSSE(message);
  }

  /**
   * Number of currently connected SSE clients.
   */
  getClientCount(): number {
    return this.sseClients.size;
  }

  // ─── HTTP Request Handler ─────────────────────────────────

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // CORS headers for Unity WebGL builds
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url ?? "/";

    if (url === "/stream" && req.method === "GET") {
      // SSE endpoint — Unity client subscribes for real-time updates
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });

      this.sseClients.add(res);

      // Send current config immediately if available
      if (this.latestConfig) {
        const message: UnityMessage = {
          type: "config",
          data: this.latestConfig as unknown as Record<string, unknown>,
          transition: this.defaultTransition,
          timestamp: new Date().toISOString(),
        };
        res.write(`data: ${JSON.stringify(message)}\n\n`);
      }

      req.on("close", () => {
        this.sseClients.delete(res);
      });
      return;
    }

    if (url === "/config" && req.method === "GET") {
      // Polling endpoint — return latest config
      if (this.latestConfig) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          type: "config",
          data: this.latestConfig,
          transition: this.defaultTransition,
          timestamp: new Date().toISOString(),
        }));
      } else {
        res.writeHead(204);
        res.end();
      }
      return;
    }

    if (url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        clients: this.sseClients.size,
        hasConfig: this.latestConfig !== null,
      }));
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  }

  // ─── SSE Broadcasting ─────────────────────────────────────

  private broadcastSSE(message: UnityMessage): void {
    const payload = `data: ${JSON.stringify(message)}\n\n`;
    for (const client of this.sseClients) {
      client.write(payload);
    }
  }
}
