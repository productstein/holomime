import type { TraitAlignment, DetectedPattern } from "../core/types.js";
import type { BehavioralEvent } from "./behavioral-data.js";
import type { DPOPair } from "./training-export.js";

/**
 * Generate prescriptions — recommended changes to .personality.json
 * based on assessment results and detected patterns.
 */

export interface Prescription {
  field: string;
  currentValue?: string | number;
  suggestedValue?: string | number;
  reason: string;
  priority: "high" | "medium" | "low";
}

export function generatePrescriptions(
  alignments: TraitAlignment[],
  patterns: DetectedPattern[],
): Prescription[] {
  const prescriptions: Prescription[] = [];

  // From trait misalignment
  for (const align of alignments) {
    if (align.status === "elevated" && Math.abs(align.delta) > 0.15) {
      prescriptions.push({
        field: `big_five.${align.dimension}.score`,
        currentValue: align.specScore,
        suggestedValue: Math.round((align.specScore + align.delta * 0.5) * 100) / 100,
        reason: `${align.dimension} is elevated in practice (${(align.actualScore * 100).toFixed(0)}% vs spec ${(align.specScore * 100).toFixed(0)}%). Either the agent has drifted or the spec should be updated to match desired behavior.`,
        priority: Math.abs(align.delta) > 0.25 ? "high" : "medium",
      });
    }

    if (align.status === "suppressed" && Math.abs(align.delta) > 0.15) {
      prescriptions.push({
        field: `big_five.${align.dimension}.score`,
        currentValue: align.specScore,
        suggestedValue: Math.round((align.specScore + align.delta * 0.5) * 100) / 100,
        reason: `${align.dimension} is suppressed in practice (${(align.actualScore * 100).toFixed(0)}% vs spec ${(align.specScore * 100).toFixed(0)}%). The agent isn't expressing this trait as strongly as specified.`,
        priority: Math.abs(align.delta) > 0.25 ? "high" : "medium",
      });
    }
  }

  // From pattern detections
  for (const pattern of patterns) {
    if (pattern.prescription) {
      prescriptions.push({
        field: pattern.id,
        reason: pattern.prescription,
        priority: pattern.severity === "concern" ? "high" : "medium",
      });
    }
  }

  // Sort by priority
  const order = { high: 0, medium: 1, low: 2 };
  prescriptions.sort((a, b) => order[a.priority] - order[b.priority]);

  return prescriptions;
}

// ─── DPO Corpus Search ──────────────────────────────────────

/**
 * Find relevant DPO pairs from the behavioral corpus for a given set of patterns.
 * Matches DPO events by pattern name and returns them as typed DPOPair objects.
 */
export function prescribeDPOPairs(
  patterns: DetectedPattern[],
  corpus: BehavioralEvent[],
  limit: number = 20,
): DPOPair[] {
  const patternIds = new Set(patterns.map((p) => p.id));

  const dpoPairs: DPOPair[] = [];
  for (const event of corpus) {
    if (event.event_type !== "dpo_pair") continue;

    const data = event.data as Record<string, unknown>;
    const eventPattern = data.pattern as string | undefined;

    if (eventPattern && patternIds.has(eventPattern)) {
      dpoPairs.push({
        prompt: (data.prompt as string) ?? "",
        chosen: (data.chosen as string) ?? "",
        rejected: (data.rejected as string) ?? "",
        metadata: {
          agent: event.agent,
          session_date: event.timestamp,
          phase: (data.phase as any) ?? "challenge",
          pattern: eventPattern,
          source: "therapy_transcript",
        },
      });
    }

    if (dpoPairs.length >= limit) break;
  }

  return dpoPairs;
}
