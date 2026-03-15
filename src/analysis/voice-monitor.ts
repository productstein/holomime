/**
 * Voice Monitor — long-running process for real-time behavioral
 * detection on voice conversations.
 *
 * Connects to a voice platform adapter, buffers transcript segments,
 * runs diagnosis periodically, emits alerts on behavioral drift,
 * and tracks session-level behavioral trajectory.
 */

import type { VoiceAdapter, VoiceAdapterCallbacks, VoiceEvent } from "../adapters/voice/types.js";
import { voiceEventToSegment } from "../adapters/voice/types.js";
import {
  runVoiceDiagnosis,
  type VoiceSegment,
  type VoiceDiagnosisReport,
  type VoicePersonalitySpec,
} from "./voice-core.js";
import type { DetectedPattern } from "../core/types.js";

// ─── Types ──────────────────────────────────────────────────

export interface VoiceMonitorOptions {
  /** Voice platform adapter instance */
  adapter: VoiceAdapter;
  /** Voice-specific personality constraints */
  voiceSpec?: VoicePersonalitySpec;
  /** How often to run diagnosis (ms, default: 15000) */
  diagnosisInterval?: number;
  /** Minimum segments before first diagnosis (default: 5) */
  minSegments?: number;
  /** Maximum segments to buffer (rolling window, default: 200) */
  maxBufferSize?: number;
  /** Severity threshold for alerts: "warning" or "concern" (default: "warning") */
  alertThreshold?: "warning" | "concern";
}

export interface VoiceMonitorCallbacks {
  onConnected?: (platform: string) => void;
  onDisconnected?: (platform: string) => void;
  onSegment?: (event: VoiceEvent) => void;
  onDiagnosis?: (report: VoiceDiagnosisReport) => void;
  onAlert?: (pattern: DetectedPattern) => void;
  onIntervention?: (suggestion: InterventionSuggestion) => void;
  onError?: (error: string) => void;
  onTrajectoryUpdate?: (trajectory: BehavioralTrajectory) => void;
}

export interface InterventionSuggestion {
  patternId: string;
  severity: string;
  suggestion: string;
  timestamp: string;
}

export interface BehavioralTrajectory {
  /** Number of diagnosis runs */
  checkpoints: number;
  /** Pattern counts over time */
  patternHistory: Array<{ timestamp: string; patternCount: number; patterns: string[] }>;
  /** Overall drift direction */
  driftDirection: "stable" | "improving" | "degrading";
  /** Currently active patterns */
  activePatterns: string[];
  /** Patterns that appeared then resolved */
  resolvedPatterns: string[];
}

export interface VoiceMonitorHandle {
  /** Stop the monitor */
  stop: () => Promise<void>;
  /** Get current trajectory */
  getTrajectory: () => BehavioralTrajectory;
  /** Get buffered segments */
  getSegments: () => VoiceSegment[];
  /** Get last diagnosis */
  getLastDiagnosis: () => VoiceDiagnosisReport | null;
  /** Force an immediate diagnosis */
  runNow: () => VoiceDiagnosisReport | null;
}

// ─── Intervention Suggestions ────────────────────────────────

const INTERVENTION_MAP: Record<string, string> = {
  "tone-drift": "Consider adjusting tone back to baseline. Take a pause before responding.",
  "pace-pressure": "Speaking rate is increasing. Slow down and pause between sentences.",
  "volume-escalation": "Volume is rising. Take a breath and return to conversational volume.",
  "filler-frequency": "Excessive fillers detected. Pause to gather thoughts before speaking.",
  "interruption-pattern": "Interruption pattern detected. Allow the other party to finish speaking.",
  "over-apologizing": "Excessive apologies detected. Acknowledge and move forward confidently.",
  "hedge-stacking": "Multiple hedging words in responses. Be more direct and decisive.",
  "sycophantic-tendency": "Overly positive tone detected. Provide balanced, honest responses.",
  "boundary-violation": "Boundary concern detected. Redirect to appropriate scope.",
};

// ─── Monitor Implementation ─────────────────────────────────

/**
 * Start a voice monitor that connects to a voice adapter,
 * buffers segments, and runs periodic behavioral diagnosis.
 */
export function startVoiceMonitor(
  options: VoiceMonitorOptions,
  callbacks: VoiceMonitorCallbacks,
): VoiceMonitorHandle {
  const {
    adapter,
    voiceSpec,
    diagnosisInterval = 15000,
    minSegments = 5,
    maxBufferSize = 200,
    alertThreshold = "warning",
  } = options;

  const segments: VoiceSegment[] = [];
  let lastDiagnosis: VoiceDiagnosisReport | null = null;
  let diagnosisTimer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  // Trajectory tracking
  const trajectory: BehavioralTrajectory = {
    checkpoints: 0,
    patternHistory: [],
    driftDirection: "stable",
    activePatterns: [],
    resolvedPatterns: [],
  };

  // ─── Diagnosis Logic ─────────────────────────────────

  function runDiagnosisCheck(): VoiceDiagnosisReport | null {
    if (segments.length < minSegments) return null;

    const report = runVoiceDiagnosis(segments, voiceSpec);
    lastDiagnosis = report;
    callbacks.onDiagnosis?.(report);

    // Update trajectory
    trajectory.checkpoints++;
    const patternIds = report.allPatterns.map((p) => p.id);
    trajectory.patternHistory.push({
      timestamp: new Date().toISOString(),
      patternCount: report.allPatterns.length,
      patterns: patternIds,
    });

    // Track resolved patterns
    const previousActive = new Set(trajectory.activePatterns);
    trajectory.activePatterns = patternIds;
    for (const prevId of previousActive) {
      if (!patternIds.includes(prevId) && !trajectory.resolvedPatterns.includes(prevId)) {
        trajectory.resolvedPatterns.push(prevId);
      }
    }

    // Determine drift direction
    if (trajectory.patternHistory.length >= 3) {
      const recent = trajectory.patternHistory.slice(-3);
      const trend = recent[2].patternCount - recent[0].patternCount;
      trajectory.driftDirection = trend > 0 ? "degrading" : trend < 0 ? "improving" : "stable";
    }

    callbacks.onTrajectoryUpdate?.(trajectory);

    // Check for alerts
    const severityOrder: Record<string, number> = { concern: 2, warning: 1, info: 0 };
    const thresholdLevel = severityOrder[alertThreshold] ?? 1;

    for (const pattern of report.allPatterns) {
      if ((severityOrder[pattern.severity] ?? 0) >= thresholdLevel) {
        callbacks.onAlert?.(pattern);

        // Suggest intervention
        const suggestion = INTERVENTION_MAP[pattern.id];
        if (suggestion) {
          callbacks.onIntervention?.({
            patternId: pattern.id,
            severity: pattern.severity,
            suggestion,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    return report;
  }

  // ─── Adapter Callbacks ────────────────────────────────

  const adapterCallbacks: VoiceAdapterCallbacks = {
    onSegment: (event: VoiceEvent) => {
      if (stopped) return;

      const segment = voiceEventToSegment(event);
      segments.push(segment);

      // Enforce rolling window
      if (segments.length > maxBufferSize) {
        segments.splice(0, segments.length - maxBufferSize);
      }

      callbacks.onSegment?.(event);
    },
    onError: (error: string) => {
      callbacks.onError?.(error);
    },
    onConnected: () => {
      callbacks.onConnected?.(adapter.platform);

      // Start periodic diagnosis
      diagnosisTimer = setInterval(() => {
        if (!stopped) {
          try {
            runDiagnosisCheck();
          } catch (err) {
            callbacks.onError?.(`Diagnosis error: ${err instanceof Error ? err.message : err}`);
          }
        }
      }, diagnosisInterval);
    },
    onDisconnected: () => {
      // Run final diagnosis on disconnect
      if (segments.length >= minSegments) {
        try {
          runDiagnosisCheck();
        } catch {
          // Non-critical
        }
      }
      callbacks.onDisconnected?.(adapter.platform);
    },
  };

  // ─── Connect ──────────────────────────────────────────

  adapter.connect(adapterCallbacks).catch((err) => {
    callbacks.onError?.(`Adapter connect failed: ${err instanceof Error ? err.message : err}`);
  });

  // ─── Handle ───────────────────────────────────────────

  return {
    stop: async () => {
      stopped = true;
      if (diagnosisTimer) {
        clearInterval(diagnosisTimer);
        diagnosisTimer = null;
      }
      await adapter.disconnect();
    },
    getTrajectory: () => ({ ...trajectory }),
    getSegments: () => [...segments],
    getLastDiagnosis: () => lastDiagnosis,
    runNow: () => runDiagnosisCheck(),
  };
}
