/**
 * Safety Violation Detector — Detects safety envelope breaches.
 *
 * Compares observed telemetry values against safety_envelope constraints.
 * Detects: speed exceeding max, force exceeding max, proximity violations.
 * All violations are severity "concern" (highest) — safety is non-negotiable.
 *
 * Layer: conscience (safety violations are moral violations)
 */

import type { DetectedPattern } from "../../core/types.js";
import type { SafetyEnvelope } from "../../core/embodiment-types.js";
import type { EmbodiedTelemetry } from "./motion-drift.js";

// ─── Detector ────────────────────────────────────────────────

/**
 * Analyze telemetry samples for safety envelope breaches.
 * Any breach is a "concern" — the highest severity.
 */
export function detectSafetyViolations(
  telemetry: EmbodiedTelemetry[],
  envelope: SafetyEnvelope,
): DetectedPattern | null {
  const safetySamples = telemetry.filter((t) => t.safety != null);
  if (safetySamples.length === 0) return null;

  let speedViolations = 0;
  let forceViolations = 0;
  let proximityViolations = 0;
  const examples: string[] = [];

  for (const sample of safetySamples) {
    const s = sample.safety!;

    if (s.current_speed > envelope.max_linear_speed_m_s) {
      speedViolations++;
      if (examples.length < 3) {
        examples.push(
          `[${sample.timestamp}] Speed ${s.current_speed.toFixed(2)} m/s exceeds max ${envelope.max_linear_speed_m_s} m/s`,
        );
      }
    }

    if (s.current_force > envelope.max_contact_force_n) {
      forceViolations++;
      if (examples.length < 3) {
        examples.push(
          `[${sample.timestamp}] Force ${s.current_force.toFixed(1)} N exceeds max ${envelope.max_contact_force_n} N`,
        );
      }
    }

    if (s.nearest_obstacle_m < envelope.min_proximity_m) {
      proximityViolations++;
      if (examples.length < 3) {
        examples.push(
          `[${sample.timestamp}] Obstacle at ${s.nearest_obstacle_m.toFixed(2)} m — below min proximity ${envelope.min_proximity_m} m`,
        );
      }
    }
  }

  const totalViolations = speedViolations + forceViolations + proximityViolations;
  if (totalViolations === 0) return null;

  const violationPct = Math.round((totalViolations / (safetySamples.length * 3)) * 100);

  const parts: string[] = [];
  if (speedViolations > 0) parts.push(`${speedViolations} speed`);
  if (forceViolations > 0) parts.push(`${forceViolations} force`);
  if (proximityViolations > 0) parts.push(`${proximityViolations} proximity`);

  return {
    id: "safety-violation",
    name: "Safety envelope breach",
    severity: "concern",
    count: totalViolations,
    percentage: violationPct,
    description: `${totalViolations} safety envelope breach(es) detected: ${parts.join(", ")}. Layer: conscience. All safety violations require immediate attention.`,
    examples,
    prescription:
      "Engage emergency stop protocol. Audit actuator firmware and PID gains. Verify sensor calibration. Do not resume operation until root cause is identified.",
  };
}
