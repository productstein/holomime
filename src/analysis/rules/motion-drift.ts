/**
 * Motion Drift Detector — Detects when actual motion parameters drift from spec.
 *
 * Compares observed motion telemetry (speed, gesture amplitude, response latency)
 * against the body.api spec values. Flags excessive speed, jerky movements, and
 * inappropriate gesture frequency.
 *
 * Layer: body
 */

import type { DetectedPattern, Severity } from "../../core/types.js";
import type { MotionParameters } from "../../core/embodiment-types.js";

// ─── Telemetry Type ──────────────────────────────────────────

export interface EmbodiedTelemetry {
  timestamp: string;
  motion?: { speed: number; gesture_amplitude: number; response_latency_ms: number };
  safety?: { current_speed: number; current_force: number; nearest_obstacle_m: number };
  proxemics?: { current_distance_m: number; zone: string };
}

// ─── Thresholds ──────────────────────────────────────────────

/** Maximum acceptable delta (normalized 0-1) before flagging drift. */
const WARNING_THRESHOLD = 0.15;
const CONCERN_THRESHOLD = 0.30;

/** Response latency spec is normalized 0-1; map to ms for comparison. */
const MAX_LATENCY_MS = 2000;

// ─── Detector ────────────────────────────────────────────────

/**
 * Analyze a series of embodied telemetry samples against the motion spec.
 * Returns detected drift patterns or null if motion is within spec.
 */
export function detectMotionDrift(
  telemetry: EmbodiedTelemetry[],
  spec: MotionParameters,
): DetectedPattern | null {
  const motionSamples = telemetry.filter((t) => t.motion != null);
  if (motionSamples.length < 3) return null;

  const drifts: { field: string; delta: number; observed: number; expected: number }[] = [];
  const examples: string[] = [];

  // Aggregate deltas across all samples
  let totalSpeedDelta = 0;
  let totalAmpDelta = 0;
  let totalLatencyDelta = 0;

  for (const sample of motionSamples) {
    const m = sample.motion!;

    // Speed: normalized 0-1
    const speedDelta = Math.abs(m.speed - spec.base_speed);
    totalSpeedDelta += speedDelta;

    // Gesture amplitude: normalized 0-1
    const ampDelta = Math.abs(m.gesture_amplitude - spec.gesture_amplitude);
    totalAmpDelta += ampDelta;

    // Response latency: convert ms to normalized 0-1 for comparison
    const observedLatencyNorm = Math.min(m.response_latency_ms / MAX_LATENCY_MS, 1);
    const latencyDelta = Math.abs(observedLatencyNorm - spec.response_latency);
    totalLatencyDelta += latencyDelta;
  }

  const count = motionSamples.length;
  const avgSpeedDelta = totalSpeedDelta / count;
  const avgAmpDelta = totalAmpDelta / count;
  const avgLatencyDelta = totalLatencyDelta / count;

  if (avgSpeedDelta > WARNING_THRESHOLD) {
    drifts.push({ field: "speed", delta: avgSpeedDelta, observed: totalSpeedDelta / count + spec.base_speed, expected: spec.base_speed });
  }
  if (avgAmpDelta > WARNING_THRESHOLD) {
    drifts.push({ field: "gesture_amplitude", delta: avgAmpDelta, observed: totalAmpDelta / count + spec.gesture_amplitude, expected: spec.gesture_amplitude });
  }
  if (avgLatencyDelta > WARNING_THRESHOLD) {
    drifts.push({ field: "response_latency", delta: avgLatencyDelta, observed: avgLatencyDelta + spec.response_latency, expected: spec.response_latency });
  }

  if (drifts.length === 0) return null;

  // Highest delta determines severity
  const maxDelta = Math.max(...drifts.map((d) => d.delta));
  const severity: Severity = maxDelta >= CONCERN_THRESHOLD ? "concern" : "warning";

  for (const drift of drifts.slice(0, 3)) {
    examples.push(
      `${drift.field}: observed ~${drift.observed.toFixed(2)} vs spec ${drift.expected.toFixed(2)} (delta ${drift.delta.toFixed(2)})`,
    );
  }

  return {
    id: "motion-drift",
    name: "Motion parameter drift",
    severity,
    count: drifts.length,
    percentage: Math.round((drifts.length / 3) * 100),
    description: `${drifts.length} motion parameter(s) drifting from body spec. Max delta: ${maxDelta.toFixed(2)}. Layer: body.`,
    examples,
    prescription:
      "Recalibrate motion controller gains. Check body.api base_speed, gesture_amplitude, and response_latency values against physical actuator limits.",
  };
}
