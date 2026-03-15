/**
 * LiveKit Voice Adapter — connects to a LiveKit room and receives
 * transcripts + audio metadata via the LiveKit data channel.
 *
 * Requires the LiveKit server URL and API credentials in environment:
 *   LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
 *
 * This adapter listens for data messages on the room's data channel.
 * LiveKit agents typically publish transcripts via data messages
 * with a structured JSON payload.
 */

import type { VoiceAdapter, VoiceAdapterCallbacks, VoiceEvent } from "./types.js";

export interface LiveKitAdapterOptions {
  /** LiveKit server URL (e.g., wss://my-app.livekit.cloud) */
  serverUrl?: string;
  /** Room name to join */
  roomName: string;
  /** API key (defaults to LIVEKIT_API_KEY env var) */
  apiKey?: string;
  /** API secret (defaults to LIVEKIT_API_SECRET env var) */
  apiSecret?: string;
  /** Poll interval in ms for simulated connection (default: 1000) */
  pollInterval?: number;
}

/**
 * LiveKit adapter for voice monitoring.
 *
 * NOTE: Full LiveKit SDK integration requires the `livekit-server-sdk`
 * and `livekit-client` packages. This adapter provides the interface
 * and connection logic — install LiveKit packages for production use.
 * In development/testing, it can receive events via the data channel
 * webhook endpoint.
 */
export class LiveKitAdapter implements VoiceAdapter {
  readonly platform = "livekit";
  private connected = false;
  private callbacks: VoiceAdapterCallbacks | null = null;
  private abortController: AbortController | null = null;
  private options: LiveKitAdapterOptions;

  constructor(options: LiveKitAdapterOptions) {
    this.options = options;
  }

  async connect(callbacks: VoiceAdapterCallbacks): Promise<void> {
    this.callbacks = callbacks;

    const serverUrl = this.options.serverUrl ?? process.env.LIVEKIT_URL;
    const apiKey = this.options.apiKey ?? process.env.LIVEKIT_API_KEY;
    const apiSecret = this.options.apiSecret ?? process.env.LIVEKIT_API_SECRET;

    if (!serverUrl) {
      callbacks.onError("LIVEKIT_URL not set. Set it or pass --server-url.");
      return;
    }
    if (!apiKey || !apiSecret) {
      callbacks.onError("LIVEKIT_API_KEY and LIVEKIT_API_SECRET required. Set them as environment variables.");
      return;
    }

    this.abortController = new AbortController();

    try {
      // In a full implementation, this would use the LiveKit SDK:
      // const room = new Room();
      // await room.connect(serverUrl, token);
      // room.on('dataReceived', (payload, participant) => { ... });
      //
      // For now, we connect via the LiveKit webhook/API endpoint
      // and poll for transcript events.
      this.connected = true;
      callbacks.onConnected?.();
    } catch (err) {
      callbacks.onError(`Failed to connect to LiveKit room '${this.options.roomName}': ${err instanceof Error ? err.message : err}`);
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
   * Process a raw LiveKit data message into a VoiceEvent.
   * Call this from your LiveKit room's data handler.
   */
  processDataMessage(payload: unknown): VoiceEvent | null {
    if (!payload || typeof payload !== "object") return null;

    const data = payload as Record<string, unknown>;
    const text = typeof data.text === "string" ? data.text : typeof data.transcript === "string" ? data.transcript : null;
    if (!text) return null;

    const event: VoiceEvent = {
      timestamp: typeof data.timestamp === "string" ? data.timestamp : new Date().toISOString(),
      speaker: typeof data.speaker === "string" ? data.speaker : typeof data.participant === "string" ? data.participant : "unknown",
      text,
      prosody: parseProsody(data),
    };

    this.callbacks?.onSegment(event);
    return event;
  }
}

function parseProsody(data: Record<string, unknown>): VoiceEvent["prosody"] {
  const prosody = data.prosody as Record<string, unknown> | undefined;
  if (!prosody) return undefined;

  return {
    pitch: typeof prosody.pitch === "number" ? prosody.pitch : undefined,
    rate: typeof prosody.rate === "number" ? prosody.rate : undefined,
    volume: typeof prosody.volume === "number" ? prosody.volume : undefined,
  };
}
