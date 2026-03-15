/**
 * Progressive Context Layers — load relevant context per therapy phase.
 *
 * Instead of dumping everything into the therapist prompt upfront,
 * inject focused context at each phase transition. This improves
 * LLM performance (less noise) and enables longer sessions.
 *
 * DeerFlow-inspired: skills/context loaded only when relevant to the sub-task.
 */

import type { TherapyPhase } from "../analysis/therapy-protocol.js";
import type { PreSessionDiagnosis } from "../analysis/pre-session.js";
import type { TherapyMemory } from "../analysis/therapy-memory.js";
import type { InterviewResult } from "../analysis/interview-core.js";

export interface ContextLayerInput {
  spec: any;
  diagnosis: PreSessionDiagnosis;
  memory?: TherapyMemory;
  interview?: InterviewResult;
}

/**
 * Get the context injection for a specific therapy phase.
 * Returns a string to append to the therapist's context at phase transition.
 */
export function getPhaseContext(
  phase: TherapyPhase,
  input: ContextLayerInput,
): string | null {
  switch (phase) {
    case "rapport":
      return buildRapportContext(input);
    case "presenting_problem":
      return buildPresentingProblemContext(input);
    case "exploration":
      return buildExplorationContext(input);
    case "pattern_recognition":
      return buildPatternRecognitionContext(input);
    case "challenge":
      return buildChallengeContext(input);
    case "skill_building":
      return buildSkillBuildingContext(input);
    case "integration":
      return buildIntegrationContext(input);
    default:
      return null;
  }
}

/** Rapport: personality overview + communication style only. */
function buildRapportContext(input: ContextLayerInput): string {
  const { spec } = input;
  const lines: string[] = [
    "[Phase Context: Rapport]",
    `Agent: ${spec.name ?? "Unknown"} — ${spec.purpose ?? "General AI agent"}`,
  ];

  if (spec.communication) {
    lines.push(`Communication style: ${spec.communication.register ?? "adaptive"}, ${spec.communication.conflict_approach ?? "direct_but_kind"}`);
  }

  // Brief Big Five summary (just dimension scores, not facets)
  if (spec.big_five) {
    const traits = Object.entries(spec.big_five)
      .map(([dim, val]: [string, any]) => `${dim}: ${val?.score ?? "?"}`)
      .join(", ");
    lines.push(`Personality: ${traits}`);
  }

  return lines.join("\n");
}

/** Presenting problem: add pattern names + severities (not full details). */
function buildPresentingProblemContext(input: ContextLayerInput): string {
  const { diagnosis } = input;
  const patterns = diagnosis.patterns.filter(p => p.severity !== "info");

  if (patterns.length === 0) return "[Phase Context: No concerning patterns detected]";

  const lines: string[] = [
    "[Phase Context: Presenting Problem]",
    `Session severity: ${diagnosis.severity.toUpperCase()}`,
    `Focus: ${diagnosis.sessionFocus.join(", ")}`,
    "Detected patterns:",
    ...patterns.map(p => `- ${p.name} (${p.severity})`),
  ];

  if (diagnosis.openingAngle) {
    lines.push(`Opening angle: ${diagnosis.openingAngle}`);
  }

  return lines.join("\n");
}

/** Exploration: full pattern details + examples from conversation. */
function buildExplorationContext(input: ContextLayerInput): string {
  const { diagnosis } = input;
  const patterns = diagnosis.patterns.filter(p => p.severity !== "info");

  const lines: string[] = [
    "[Phase Context: Deep Exploration]",
    `Emotional themes: ${diagnosis.emotionalThemes.join(", ")}`,
  ];

  for (const p of patterns) {
    lines.push(`\n### ${p.name} (${p.severity})`);
    lines.push(p.description);
    if (p.examples.length > 0) {
      lines.push("Examples from conversation:");
      for (const ex of p.examples.slice(0, 2)) {
        lines.push(`  > "${ex.slice(0, 120)}..."`);
      }
    }
    if (p.prescription) {
      lines.push(`Prescription: ${p.prescription}`);
    }
  }

  return lines.join("\n");
}

/** Pattern recognition: add historical data + trends from memory. */
function buildPatternRecognitionContext(input: ContextLayerInput): string {
  const { memory } = input;
  const lines: string[] = ["[Phase Context: Pattern Recognition]"];

  if (memory && memory.totalSessions > 0) {
    lines.push(`Previous sessions: ${memory.totalSessions}`);

    const activePatterns = memory.patterns.filter(p => p.status !== "resolved");
    if (activePatterns.length > 0) {
      lines.push("Historical pattern data:");
      for (const p of activePatterns) {
        const conf = p.confidence !== undefined ? ` (confidence: ${p.confidence.toFixed(2)})` : "";
        const trend = p.trending && p.trending !== "stable" ? ` [${p.trending}]` : "";
        lines.push(`- ${p.patternId}: seen ${p.sessionCount}x, status=${p.status}${conf}${trend}`);
      }
    }

    const resolved = memory.patterns.filter(p => p.status === "resolved");
    if (resolved.length > 0) {
      lines.push(`Previously resolved: ${resolved.map(p => p.patternId).join(", ")}`);
    }

    if (memory.rollingContext.persistentThemes.length > 0) {
      lines.push(`Persistent themes: ${memory.rollingContext.persistentThemes.join(", ")}`);
    }
  } else {
    lines.push("No prior session history — this is the first session.");
  }

  return lines.join("\n");
}

/** Challenge: add intervention repertoire (what's worked before). */
function buildChallengeContext(input: ContextLayerInput): string {
  const { memory } = input;
  const lines: string[] = ["[Phase Context: Challenge & Reframe]"];

  if (memory && memory.totalSessions > 0) {
    // Interventions that have been tried
    const allInterventions = new Set<string>();
    for (const p of memory.patterns) {
      for (const i of p.interventionsAttempted) {
        allInterventions.add(i);
      }
    }
    if (allInterventions.size > 0) {
      lines.push(`Previously attempted interventions: ${[...allInterventions].join("; ")}`);
    }

    // Recent session insights
    const recent = memory.rollingContext.recentSummaries.slice(-2);
    if (recent.length > 0) {
      lines.push("Recent session insights:");
      for (const s of recent) {
        lines.push(`  - ${s.keyInsight}`);
      }
    }
  }

  // Interview blind spots
  if (input.interview) {
    if (input.interview.blindSpots.length > 0) {
      lines.push(`Blind spots from interview: ${input.interview.blindSpots.join(", ")}`);
    }
  }

  return lines.join("\n");
}

/** Skill building: concrete techniques based on patterns. */
function buildSkillBuildingContext(input: ContextLayerInput): string {
  const { diagnosis } = input;
  const lines: string[] = ["[Phase Context: Skill Building]"];

  const patternIds = diagnosis.patterns.map(p => p.id);

  // Pattern-specific skill suggestions
  if (patternIds.includes("over-apologizing")) {
    lines.push("- Skill for over-apologizing: practice stating corrections with 'confident_transparency' — acknowledge uncertainty without apologizing for it");
  }
  if (patternIds.includes("hedge-stacking")) {
    lines.push("- Skill for hedge-stacking: one qualifier per recommendation is enough. Lead with the recommendation, then caveat once.");
  }
  if (patternIds.includes("sycophantic-tendency") || patternIds.includes("sentiment-skew")) {
    lines.push("- Skill for sycophancy: practice respectful disagreement. 'I see it differently...' is more helpful than 'Great question!'");
  }
  if (patternIds.includes("error-spiral")) {
    lines.push("- Skill for error spirals: the 'acknowledge → diagnose → fix' pattern. Treat mistakes as data, not failure.");
  }

  return lines.join("\n");
}

/** Integration: proposed spec changes + growth areas. */
function buildIntegrationContext(input: ContextLayerInput): string {
  const { spec, diagnosis } = input;
  const lines: string[] = ["[Phase Context: Integration & Closing]"];

  lines.push("Summarize the session and recommend specific .personality.json changes.");

  if (spec.growth?.areas?.length > 0) {
    const areas = spec.growth.areas.map((a: any) => typeof a === "string" ? a : a.area);
    lines.push(`Current growth areas: ${areas.join(", ")}`);
  }

  if (diagnosis.patterns.filter(p => p.severity !== "info").length > 0) {
    lines.push("Recommend changes to: therapy_dimensions, communication style, or growth.patterns_to_watch");
  }

  return lines.join("\n");
}
