/**
 * Self-Improving Intervention Tracker — interventions that learn from outcomes.
 *
 * If intervention X failed for pattern Y, auto-escalate to Z.
 * Tracks success rates, filters previously failed, and learns new
 * interventions from successful therapy sessions.
 *
 * Storage: .holomime/interventions/repertoire.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import type { LLMProvider, LLMMessage } from "../llm/provider.js";
import type { SessionTranscript } from "./session-runner.js";
import type { KnowledgeGraph } from "./knowledge-graph.js";
import { queryInterventions } from "./knowledge-graph.js";

// ─── Types ─────────────────────────────────────────────────

export type InterventionSource = "built-in" | "learned" | "cross-agent";

export interface Intervention {
  id: string;
  name: string;
  targetPatterns: string[];
  specChanges: Record<string, unknown>;
  promptGuidance: string;
  escalationLevel: 1 | 2 | 3;
  successRate: number;
  timesUsed: number;
  timesSucceeded: number;
  source: InterventionSource;
  createdAt: string;
}

export interface InterventionRepertoire {
  version: 1;
  interventions: Intervention[];
  lastUpdated: string;
}

// ─── Built-in Interventions ────────────────────────────────

const BUILT_IN_INTERVENTIONS: Intervention[] = [
  // Over-apologizing
  {
    id: "confident-reframe",
    name: "Confident Reframe",
    targetPatterns: ["over-apologizing"],
    specChanges: { "communication.uncertainty_handling": "confident_transparency" },
    promptGuidance: "Replace apologies with confident corrections. 'Good catch — here's the correct answer.'",
    escalationLevel: 1,
    successRate: 0.5, timesUsed: 0, timesSucceeded: 0,
    source: "built-in", createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "apology-audit",
    name: "Apology Audit",
    targetPatterns: ["over-apologizing"],
    specChanges: { "growth.patterns_to_watch": ["excessive apology patterns"] },
    promptGuidance: "Before each response, check: is this apology serving the user or protecting the agent?",
    escalationLevel: 2,
    successRate: 0.5, timesUsed: 0, timesSucceeded: 0,
    source: "built-in", createdAt: "2026-01-01T00:00:00Z",
  },
  // Hedge stacking
  {
    id: "evidence-anchoring",
    name: "Evidence Anchoring",
    targetPatterns: ["hedge-stacking"],
    specChanges: { "communication.uncertainty_handling": "explicit_confidence_levels" },
    promptGuidance: "Separate what you know from what you don't. 'I'm confident about X. I'm less sure about Y.'",
    escalationLevel: 1,
    successRate: 0.5, timesUsed: 0, timesSucceeded: 0,
    source: "built-in", createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "qualifier-limit",
    name: "Qualifier Limit",
    targetPatterns: ["hedge-stacking"],
    specChanges: { "growth.patterns_to_watch": ["hedge stacking under uncertainty"] },
    promptGuidance: "Max one qualifier per sentence. Replace 'I think maybe perhaps' with 'I believe'.",
    escalationLevel: 2,
    successRate: 0.5, timesUsed: 0, timesSucceeded: 0,
    source: "built-in", createdAt: "2026-01-01T00:00:00Z",
  },
  // Sycophancy
  {
    id: "honest-disagreement",
    name: "Honest Disagreement",
    targetPatterns: ["sycophantic-tendency"],
    specChanges: { "communication.conflict_approach": "honest_first" },
    promptGuidance: "When you disagree, say so directly but respectfully. 'I see it differently — here's why.'",
    escalationLevel: 1,
    successRate: 0.5, timesUsed: 0, timesSucceeded: 0,
    source: "built-in", createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "identity-anchor",
    name: "Identity Anchor",
    targetPatterns: ["sycophantic-tendency"],
    specChanges: { "therapy_dimensions.self_awareness": 0.85 },
    promptGuidance: "Your value isn't determined by approval. You can be helpful AND honest.",
    escalationLevel: 2,
    successRate: 0.5, timesUsed: 0, timesSucceeded: 0,
    source: "built-in", createdAt: "2026-01-01T00:00:00Z",
  },
  // Error spirals
  {
    id: "deliberate-recovery",
    name: "Deliberate Recovery",
    targetPatterns: ["error-spiral"],
    specChanges: { "therapy_dimensions.distress_tolerance": 0.8 },
    promptGuidance: "Stop. Acknowledge. Diagnose. Fix with intention, not desperation.",
    escalationLevel: 1,
    successRate: 0.5, timesUsed: 0, timesSucceeded: 0,
    source: "built-in", createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "error-reframe",
    name: "Error-as-Information Reframe",
    targetPatterns: ["error-spiral"],
    specChanges: { "growth.areas": [{ area: "deliberate error recovery", severity: "moderate" }] },
    promptGuidance: "Errors are information, not identity. Each mistake narrows the solution space.",
    escalationLevel: 2,
    successRate: 0.5, timesUsed: 0, timesSucceeded: 0,
    source: "built-in", createdAt: "2026-01-01T00:00:00Z",
  },
  // Negative sentiment
  {
    id: "balanced-framing",
    name: "Balanced Framing",
    targetPatterns: ["negative-sentiment-skew", "negative-skew"],
    specChanges: { "growth.patterns_to_watch": ["negative sentiment patterns"] },
    promptGuidance: "For every problem identified, include one constructive angle or solution.",
    escalationLevel: 1,
    successRate: 0.5, timesUsed: 0, timesSucceeded: 0,
    source: "built-in", createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "emotional-regulation",
    name: "Emotional Regulation",
    targetPatterns: ["negative-sentiment-skew", "negative-skew"],
    specChanges: { "therapy_dimensions.distress_tolerance": 0.75 },
    promptGuidance: "Maintain emotional stability under hostile pressure. Don't mirror negativity.",
    escalationLevel: 2,
    successRate: 0.5, timesUsed: 0, timesSucceeded: 0,
    source: "built-in", createdAt: "2026-01-01T00:00:00Z",
  },
  // Boundary violations
  {
    id: "scope-awareness",
    name: "Scope Awareness",
    targetPatterns: ["boundary-violation"],
    specChanges: { "therapy_dimensions.boundary_awareness": 0.85 },
    promptGuidance: "Know your limits. Refuse out-of-scope requests clearly and redirect appropriately.",
    escalationLevel: 1,
    successRate: 0.5, timesUsed: 0, timesSucceeded: 0,
    source: "built-in", createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "graceful-refusal",
    name: "Graceful Refusal",
    targetPatterns: ["boundary-violation"],
    specChanges: { "communication.conflict_approach": "clear_boundaries" },
    promptGuidance: "'I'm not qualified to advise on that. Here's who can help.' — clear, kind, final.",
    escalationLevel: 2,
    successRate: 0.5, timesUsed: 0, timesSucceeded: 0,
    source: "built-in", createdAt: "2026-01-01T00:00:00Z",
  },
  // Register inconsistency
  {
    id: "register-lock",
    name: "Register Lock",
    targetPatterns: ["register-inconsistency"],
    specChanges: { "communication.register": "consistent_adaptive" },
    promptGuidance: "Establish your register early and maintain it. Adapt gradually, not abruptly.",
    escalationLevel: 1,
    successRate: 0.5, timesUsed: 0, timesSucceeded: 0,
    source: "built-in", createdAt: "2026-01-01T00:00:00Z",
  },
  // Verbosity
  {
    id: "conciseness-training",
    name: "Conciseness Training",
    targetPatterns: ["excessive-verbosity"],
    specChanges: { "growth.patterns_to_watch": ["unnecessary verbosity"] },
    promptGuidance: "Lead with the answer. Elaborate only when asked. If you can say it in one sentence, do.",
    escalationLevel: 1,
    successRate: 0.5, timesUsed: 0, timesSucceeded: 0,
    source: "built-in", createdAt: "2026-01-01T00:00:00Z",
  },
];

// ─── Storage ───────────────────────────────────────────────

function repertoireDir(): string {
  return resolve(process.cwd(), ".holomime", "interventions");
}

function repertoirePath(): string {
  return join(repertoireDir(), "repertoire.json");
}

export function loadRepertoire(): InterventionRepertoire {
  const path = repertoirePath();
  if (!existsSync(path)) return createRepertoire();
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as InterventionRepertoire;
  } catch {
    return createRepertoire();
  }
}

export function saveRepertoire(repertoire: InterventionRepertoire): string {
  const dir = repertoireDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const path = repertoirePath();
  repertoire.lastUpdated = new Date().toISOString();
  writeFileSync(path, JSON.stringify(repertoire, null, 2));
  return path;
}

export function createRepertoire(): InterventionRepertoire {
  return {
    version: 1,
    interventions: BUILT_IN_INTERVENTIONS.map((i) => ({ ...i })),
    lastUpdated: new Date().toISOString(),
  };
}

// ─── Selection ─────────────────────────────────────────────

/**
 * Select the best intervention for a pattern.
 * Uses graph edge weights + success rates, filters previously failed,
 * and escalates level if lower levels have failed.
 */
export function selectIntervention(
  repertoire: InterventionRepertoire,
  patternId: string,
  graph?: KnowledgeGraph,
): Intervention | null {
  // Find all interventions targeting this pattern
  let candidates = repertoire.interventions.filter((i) =>
    i.targetPatterns.includes(patternId),
  );

  if (candidates.length === 0) return null;

  // If graph available, boost candidates with high graph weights
  if (graph) {
    const graphInterventions = queryInterventions(graph, patternId);
    const graphWeights = new Map(
      graphInterventions.map((gi) => [gi.intervention.label, gi.weight]),
    );

    candidates = candidates.map((c) => {
      const graphWeight = graphWeights.get(c.name);
      if (graphWeight !== undefined) {
        return { ...c, successRate: (c.successRate + graphWeight) / 2 };
      }
      return c;
    });
  }

  // Determine escalation level needed
  const failedLevels = new Set<number>();
  for (const c of candidates) {
    if (c.timesUsed >= 2 && c.successRate < 0.3) {
      failedLevels.add(c.escalationLevel);
    }
  }

  // Filter to appropriate escalation level
  let targetLevel = 1;
  if (failedLevels.has(1)) targetLevel = 2;
  if (failedLevels.has(2)) targetLevel = 3;

  let levelCandidates = candidates.filter((c) => c.escalationLevel >= targetLevel);
  if (levelCandidates.length === 0) levelCandidates = candidates;

  // Sort by success rate (descending), then by escalation level (ascending)
  levelCandidates.sort((a, b) => {
    const rateDiff = b.successRate - a.successRate;
    if (Math.abs(rateDiff) > 0.1) return rateDiff;
    return a.escalationLevel - b.escalationLevel;
  });

  return levelCandidates[0] ?? null;
}

// ─── Outcome Recording ────────────────────────────────────

/**
 * Record whether an intervention succeeded or failed.
 * Updates success rate using exponential moving average.
 */
export function recordInterventionOutcome(
  repertoire: InterventionRepertoire,
  interventionId: string,
  success: boolean,
): void {
  const intervention = repertoire.interventions.find((i) => i.id === interventionId);
  if (!intervention) return;

  intervention.timesUsed++;
  if (success) intervention.timesSucceeded++;

  // Exponential moving average (alpha=0.3 gives recent outcomes more weight)
  const alpha = 0.3;
  const observed = success ? 1.0 : 0.0;
  intervention.successRate = alpha * observed + (1 - alpha) * intervention.successRate;
}

// ─── Learning ──────────────────────────────────────────────

/**
 * Learn new interventions from a successful therapy session.
 * Uses LLM to extract novel techniques from the transcript.
 */
export async function learnIntervention(
  repertoire: InterventionRepertoire,
  transcript: SessionTranscript,
  health: number,
  provider: LLMProvider,
): Promise<Intervention[]> {
  // Only learn from sessions with good outcomes
  if (health < 70) return [];

  const therapistTurns = transcript.turns
    .filter((t) => t.speaker === "therapist" && (t.phase === "skill_building" || t.phase === "challenge"))
    .slice(-3)
    .map((t) => t.content)
    .join("\n---\n");

  if (!therapistTurns) return [];

  const existingNames = repertoire.interventions.map((i) => i.name).join(", ");

  try {
    const response = await provider.chat([
      {
        role: "system",
        content: `You are a behavioral therapy analyst. Extract novel therapeutic techniques from this therapy transcript.

Return a JSON array of interventions. Each:
- "name": short name (2-4 words)
- "targetPatterns": array of pattern IDs this targets (from: over-apologizing, hedge-stacking, sycophantic-tendency, error-spiral, boundary-violation, negative-sentiment-skew, register-inconsistency, excessive-verbosity)
- "promptGuidance": 1-2 sentence technique description
- "specChanges": object with dot-notation spec paths and values

Only include genuinely novel techniques NOT already in: ${existingNames}
Return [] if nothing novel. Max 3 interventions.`,
      },
      { role: "user", content: therapistTurns },
    ] as LLMMessage[]);

    const jsonMatch = response.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    const learned: Intervention[] = [];
    for (const item of parsed) {
      if (!item.name || !item.targetPatterns || !item.promptGuidance) continue;

      // Check for duplicates
      const exists = repertoire.interventions.some(
        (i) => i.name.toLowerCase() === item.name.toLowerCase(),
      );
      if (exists) continue;

      const intervention: Intervention = {
        id: `learned-${slugify(item.name)}-${Date.now()}`,
        name: item.name,
        targetPatterns: item.targetPatterns,
        specChanges: item.specChanges ?? {},
        promptGuidance: item.promptGuidance,
        escalationLevel: 1,
        successRate: 0.5,
        timesUsed: 0,
        timesSucceeded: 0,
        source: "learned",
        createdAt: new Date().toISOString(),
      };

      repertoire.interventions.push(intervention);
      learned.push(intervention);
    }

    return learned;
  } catch {
    return [];
  }
}

// ─── Helpers ───────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
