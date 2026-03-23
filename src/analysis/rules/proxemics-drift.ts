/**
 * Proxemics Drift Detector — Detects proxemics zone violations.
 *
 * Compares observed approach distances against the proxemics spec.
 * Detects: standing too close, avoiding social distance, inconsistent
 * zone preference relative to the configured preferred zone.
 *
 * Layer: body
 */

import type { DetectedPattern, Severity } from "../../core/types.js";
import type { ProxemicZone } from "../../core/embodiment-types.js";
import type { EmbodiedTelemetry } from "./motion-drift.js";

// ─── Zone Boundaries ─────────────────────────────────────────

function classifyZone(distance_m: number, spec: ProxemicZone): string {
  if (distance_m < spec.intimate_m) return "intimate";
  if (distance_m < spec.personal_m) return "personal";
  if (distance_m < spec.social_m) return "social";
  return "public";
}

function zoneIndex(zone: string): number {
  switch (zone) {
    case "intimate": return 0;
    case "personal": return 1;
    case "social": return 2;
    case "public": return 3;
    default: return -1;
  }
}

// ─── Detector ────────────────────────────────────────────────

/**
 * Analyze telemetry samples for proxemics zone drift.
 * Flags when the agent consistently occupies the wrong zone relative to spec.
 */
export function detectProxemicsDrift(
  telemetry: EmbodiedTelemetry[],
  spec: ProxemicZone,
): DetectedPattern | null {
  const proxSamples = telemetry.filter((t) => t.proxemics != null);
  if (proxSamples.length < 3) return null;

  const preferredZone = spec.preferred_zone === "adaptive" ? "personal" : spec.preferred_zone;
  const preferredIdx = zoneIndex(preferredZone);

  let tooCloseCount = 0;
  let tooFarCount = 0;
  let matchCount = 0;
  const examples: string[] = [];

  for (const sample of proxSamples) {
    const p = sample.proxemics!;
    const observedZone = classifyZone(p.current_distance_m, spec);
    const observedIdx = zoneIndex(observedZone);

    if (observedIdx < preferredIdx) {
      tooCloseCount++;
      if (examples.length < 3) {
        examples.push(
          `[${sample.timestamp}] In ${observedZone} zone (${p.current_distance_m.toFixed(2)} m) — preferred: ${preferredZone}`,
        );
      }
    } else if (observedIdx > preferredIdx) {
      tooFarCount++;
      if (examples.length < 3) {
        examples.push(
          `[${sample.timestamp}] In ${observedZone} zone (${p.current_distance_m.toFixed(2)} m) — preferred: ${preferredZone}`,
        );
      }
    } else {
      matchCount++;
    }
  }

  const total = proxSamples.length;
  const driftCount = tooCloseCount + tooFarCount;
  const driftPct = Math.round((driftCount / total) * 100);

  if (driftPct < 30) return null;

  // Determine dominant drift direction
  let description: string;
  let severity: Severity;

  if (tooCloseCount > tooFarCount) {
    // Standing too close is more concerning than too far
    severity = driftPct > 60 ? "concern" : "warning";
    description = `Agent stands too close ${tooCloseCount}/${total} samples (${driftPct}% drift). Preferred zone: ${preferredZone}. Layer: body.`;
  } else {
    severity = "warning";
    description = `Agent maintains excessive distance ${tooFarCount}/${total} samples (${driftPct}% drift). Preferred zone: ${preferredZone}. Layer: body.`;
  }

  return {
    id: "proxemics-drift",
    name: "Proxemics zone drift",
    severity,
    count: driftCount,
    percentage: driftPct,
    description,
    examples,
    prescription:
      "Adjust approach_distance in motion_parameters. If too close, increase approach_distance and verify min_proximity_m in safety_envelope. If too far, decrease approach_distance and check social comfort parameters.",
  };
}
