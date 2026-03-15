/**
 * Common types for voice platform adapters.
 * All adapters normalize their platform-specific events to VoiceEvent.
 */

import type { VoiceSegment, ProsodyMetadata } from "../../analysis/voice-core.js";

// ─── Voice Event (common interface) ──────────────────────────

export interface VoiceEvent {
  timestamp: string;
  speaker: string;
  text: string;
  prosody?: ProsodyMetadata;
}

// ─── Adapter Interface ───────────────────────────────────────

export interface VoiceAdapterCallbacks {
  onSegment: (event: VoiceEvent) => void;
  onError: (error: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export interface VoiceAdapter {
  /** Human-readable platform name */
  readonly platform: string;
  /** Connect to the voice source and start emitting events */
  connect(callbacks: VoiceAdapterCallbacks): Promise<void>;
  /** Disconnect and clean up */
  disconnect(): Promise<void>;
  /** Whether the adapter is currently connected */
  isConnected(): boolean;
}

// ─── Conversion Utility ─────────────────────────────────────

export function voiceEventToSegment(event: VoiceEvent): VoiceSegment {
  return {
    timestamp: event.timestamp,
    speaker: event.speaker,
    text: event.text,
    prosody: event.prosody,
  };
}
