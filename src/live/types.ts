/**
 * Types for the HoloMime Live real-time behavioral monitoring system.
 */

export interface BrainRegionState {
  id: string;
  name: string;
  function: string;
  color: string;
  intensity: number; // 0-1
  patterns: string[]; // which pattern IDs activated this region
}

export interface FiredPattern {
  id: string;
  name: string;
  severity: "info" | "warning" | "concern";
  percentage: number;
  description: string;
}

export interface BrainEvent {
  type: "diagnosis";
  timestamp: string;
  health: number; // 0-100
  grade: string; // A-F
  messageCount: number;
  regions: BrainRegionState[];
  patterns: FiredPattern[];
  activity: {
    role: "user" | "assistant";
    preview: string; // first 80 chars
  } | null;
}

export interface BrainInit {
  type: "init";
  agent: string; // "claude-code" | "cline" | "manual"
  sessionPath: string;
  startedAt: string;
}

export interface LiveConfig {
  watchPath?: string;
  agent?: string;
  port: number;
  noOpen: boolean;
  share?: boolean;
  personality?: string;
}

export interface DetectedAgent {
  agent: string; // "claude-code" | "cline" | "manual"
  logPath: string;
  format: "jsonl" | "auto";
}

export type BrainMessage = BrainEvent | BrainInit;
