/**
 * Webhook Adapter — POST compiled embodied configs to a configured URL.
 *
 * Generic HTTP push adapter for any system that can receive JSON payloads.
 * Supports configurable headers, auth, and retry with exponential backoff.
 */

import type { RuntimeAdapter } from "../core/embodiment-runtime.js";
import type { CompiledEmbodiedConfig } from "../core/embodiment-types.js";

// ─── Configuration ──────────────────────────────────────────

export interface WebhookAdapterOptions {
  /** Target URL to POST configs to */
  url: string;
  /** Custom headers (e.g., Authorization, X-API-Key) */
  headers?: Record<string, string>;
  /** HTTP method (default: POST) */
  method?: "POST" | "PUT" | "PATCH";
  /** Request timeout in ms (default: 10000) */
  timeout?: number;
  /** Max retry attempts on failure (default: 3) */
  maxRetries?: number;
  /** Base retry delay in ms, doubles each attempt (default: 1000) */
  retryDelay?: number;
  /** Bearer token (convenience — sets Authorization header) */
  bearerToken?: string;
}

// ─── Adapter ────────────────────────────────────────────────

export class WebhookAdapter implements RuntimeAdapter {
  readonly type = "webhook" as const;

  private connected = false;

  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly method: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryDelay: number;

  constructor(options: WebhookAdapterOptions) {
    this.url = options.url;
    this.method = options.method ?? "POST";
    this.timeout = options.timeout ?? 10_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;

    // Build headers
    this.headers = {
      "Content-Type": "application/json",
      "User-Agent": "holomime-embodiment/1.0",
      ...(options.headers ?? {}),
    };
    if (options.bearerToken) {
      this.headers["Authorization"] = `Bearer ${options.bearerToken}`;
    }
  }

  async connect(): Promise<void> {
    // Webhook is stateless — verify the URL is reachable with a HEAD request
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      const response = await fetch(this.url, {
        method: "HEAD",
        headers: this.headers,
        signal: controller.signal,
      });
      clearTimeout(timer);
      // Accept any non-server-error response as "reachable"
      if (response.status >= 500) {
        throw new Error(`Webhook endpoint returned ${response.status}`);
      }
    } catch (err) {
      // If HEAD is not allowed (405), that's fine — the endpoint exists
      if (err instanceof Error && err.message.includes("405")) {
        // Method not allowed is acceptable for connectivity check
      } else if (err instanceof Error && !err.message.includes("abort")) {
        // Connectivity issues — still mark as connected for fire-and-retry model
      }
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async push(config: CompiledEmbodiedConfig): Promise<void> {
    if (!this.connected) {
      throw new Error("Webhook adapter not connected");
    }

    const body = JSON.stringify({
      event: "personality-update",
      timestamp: new Date().toISOString(),
      config,
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(this.url, {
          method: this.method,
          headers: this.headers,
          body,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (response.ok) {
          return; // Success
        }

        // Non-retryable client errors (4xx except 429)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
        }

        lastError = new Error(`Webhook returned ${response.status}: ${response.statusText}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Non-retryable errors
        if (lastError.message.includes("Webhook returned 4")) {
          throw lastError;
        }
      }

      // Exponential backoff before retry
      if (attempt < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError ?? new Error("Webhook push failed after retries");
  }

  isConnected(): boolean {
    return this.connected;
  }
}
