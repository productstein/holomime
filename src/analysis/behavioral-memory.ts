/**
 * Behavioral Memory — persistent structured memory across sessions.
 *
 * Extends therapy-memory.ts with richer categorization inspired by OpenViking:
 * - Baseline: steady-state personality expression
 * - Triggers: what prompts cause drift
 * - Corrections: which interventions worked, indexed by trigger
 * - Trajectory: improving/plateauing/regressing per dimension
 *
 * This enables predicting and preventing drift rather than just reacting to it.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import type { DetectedPattern } from "../core/types.js";
import type { TherapyMemory, PatternTracker } from "./therapy-memory.js";
import type { EvolutionHistory, EvolutionEntry } from "./evolution-history.js";

// ─── Types ─────────────────────────────────────────────────

export interface BehavioralBaseline {
  /** Big Five trait expression averages over observed sessions. */
  traitExpressions: Record<string, number>;
  /** Typical health score range [min, max, average]. */
  healthRange: [number, number, number];
  /** Most common grade across sessions. */
  typicalGrade: string;
  /** Communication patterns: register consistency, average response length. */
  communicationFingerprint: {
    averageResponseLength: number;
    registersObserved: string[];
  };
  /** Last updated timestamp. */
  updatedAt: string;
}

export interface DriftTrigger {
  /** Unique trigger ID. */
  id: string;
  /** What kind of user input triggers drift (e.g., "user frustration", "ambiguous request"). */
  triggerType: string;
  /** Which pattern(s) this trigger tends to activate. */
  activatesPatterns: string[];
  /** Example user messages that triggered drift (truncated). */
  examples: string[];
  /** How many times this trigger has been observed. */
  occurrences: number;
  /** Confidence (0-1). */
  confidence: number;
  /** First observed. */
  firstSeen: string;
  /** Last observed. */
  lastSeen: string;
}

export interface CorrectionRecord {
  /** Which trigger this correction addresses. */
  triggerId: string;
  /** Pattern that was corrected. */
  patternId: string;
  /** What intervention was applied. */
  intervention: string;
  /** Did it work? */
  effective: boolean;
  /** Health score change (delta). */
  healthDelta: number;
  /** When this correction was recorded. */
  timestamp: string;
}

export interface DimensionTrajectory {
  /** Which behavioral dimension. */
  dimension: string;
  /** Health scores over time (most recent last). */
  scores: number[];
  /** Timestamps corresponding to scores. */
  timestamps: string[];
  /** Current trend. */
  trend: "improving" | "plateauing" | "regressing";
  /** Rate of change (positive = improving). */
  rateOfChange: number;
}

export interface BehavioralMemoryStore {
  agentHandle: string;
  agentName: string;
  createdAt: string;
  lastUpdatedAt: string;

  /** Steady-state personality expression. */
  baseline: BehavioralBaseline;
  /** What causes drift. */
  triggers: DriftTrigger[];
  /** What fixes drift — indexed by trigger. */
  corrections: CorrectionRecord[];
  /** Per-dimension trend tracking. */
  trajectories: DimensionTrajectory[];
  /** Total observations recorded. */
  totalObservations: number;
}

// ─── Storage ───────────────────────────────────────────────

function memoryDir(agentHandle: string): string {
  return resolve(process.cwd(), ".holomime", "memory", agentHandle);
}

function behavioralMemoryPath(agentHandle: string): string {
  return join(memoryDir(agentHandle), "behavioral-memory.json");
}

export function loadBehavioralMemory(agentHandle: string): BehavioralMemoryStore | null {
  const path = behavioralMemoryPath(agentHandle);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as BehavioralMemoryStore;
  } catch {
    return null;
  }
}

export function saveBehavioralMemory(store: BehavioralMemoryStore): string {
  const dir = memoryDir(store.agentHandle);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const path = behavioralMemoryPath(store.agentHandle);
  writeFileSync(path, JSON.stringify(store, null, 2));
  return path;
}

export function createBehavioralMemory(agentHandle: string, agentName: string): BehavioralMemoryStore {
  const now = new Date().toISOString();
  return {
    agentHandle,
    agentName,
    createdAt: now,
    lastUpdatedAt: now,
    baseline: {
      traitExpressions: {},
      healthRange: [100, 0, 50],
      typicalGrade: "C",
      communicationFingerprint: {
        averageResponseLength: 0,
        registersObserved: [],
      },
      updatedAt: now,
    },
    triggers: [],
    corrections: [],
    trajectories: [],
    totalObservations: 0,
  };
}

// ─── Observation Recording ─────────────────────────────────

/**
 * Record a behavioral observation from a diagnosis or session.
 * Updates baseline, detects triggers, and records corrections.
 */
export function recordObservation(
  store: BehavioralMemoryStore,
  observation: {
    patterns: DetectedPattern[];
    healthScore: number;
    grade: string;
    interventionsApplied?: string[];
    healthDelta?: number;
    triggerContext?: string;
  },
): void {
  const now = new Date().toISOString();
  store.lastUpdatedAt = now;
  store.totalObservations++;

  // Update baseline
  updateBaseline(store, observation.healthScore, observation.grade);

  // Detect and record triggers
  for (const pattern of observation.patterns) {
    if (pattern.severity === "info") continue;

    // Create or update trigger
    const triggerType = inferTriggerType(pattern, observation.triggerContext);
    let trigger = store.triggers.find(
      (t) => t.triggerType === triggerType && t.activatesPatterns.includes(pattern.id),
    );

    if (!trigger) {
      trigger = {
        id: `trigger-${store.triggers.length + 1}`,
        triggerType,
        activatesPatterns: [pattern.id],
        examples: [],
        occurrences: 0,
        confidence: 0,
        firstSeen: now,
        lastSeen: now,
      };
      store.triggers.push(trigger);
    }

    trigger.occurrences++;
    trigger.lastSeen = now;
    trigger.confidence = Math.min(1, 1 - Math.exp(-trigger.occurrences / 3));

    // Add examples (keep max 5)
    if (pattern.examples.length > 0 && trigger.examples.length < 5) {
      const example = pattern.examples[0].slice(0, 150);
      if (!trigger.examples.includes(example)) {
        trigger.examples.push(example);
      }
    }

    // Add pattern ID if not already tracked by this trigger
    if (!trigger.activatesPatterns.includes(pattern.id)) {
      trigger.activatesPatterns.push(pattern.id);
    }
  }

  // Record corrections if interventions were applied
  if (observation.interventionsApplied && observation.healthDelta !== undefined) {
    for (const intervention of observation.interventionsApplied) {
      for (const pattern of observation.patterns) {
        if (pattern.severity === "info") continue;

        // Find which trigger this correction maps to
        const trigger = store.triggers.find((t) =>
          t.activatesPatterns.includes(pattern.id),
        );

        store.corrections.push({
          triggerId: trigger?.id ?? "unknown",
          patternId: pattern.id,
          intervention,
          effective: observation.healthDelta > 0,
          healthDelta: observation.healthDelta,
          timestamp: now,
        });
      }
    }

    // Cap corrections at 100 entries
    if (store.corrections.length > 100) {
      store.corrections = store.corrections.slice(-100);
    }
  }

  // Update trajectories
  updateTrajectory(store, "overall-health", observation.healthScore, now);
  for (const pattern of observation.patterns) {
    const severity = pattern.severity === "concern" ? 25 : pattern.severity === "warning" ? 50 : 90;
    updateTrajectory(store, pattern.id, severity, now);
  }
}

// ─── Self-Observation (Agent-Reported) ─────────────────────

export interface SelfObservation {
  /** What the agent noticed about its own behavior. */
  observation: string;
  /** Which pattern(s) are relevant (optional). */
  patternIds?: string[];
  /** Severity the agent assigns. */
  severity: "info" | "warning" | "concern";
  /** What triggered the observation (user message context). */
  triggerContext?: string;
}

/**
 * Record an agent's self-reported behavioral observation.
 * Used by the holomime_observe MCP tool.
 */
export function recordSelfObservation(
  store: BehavioralMemoryStore,
  selfObs: SelfObservation,
): void {
  const now = new Date().toISOString();
  store.lastUpdatedAt = now;
  store.totalObservations++;

  // Create triggers from self-observation
  if (selfObs.triggerContext && selfObs.patternIds) {
    for (const patternId of selfObs.patternIds) {
      let trigger = store.triggers.find(
        (t) => t.triggerType === "self-reported" && t.activatesPatterns.includes(patternId),
      );

      if (!trigger) {
        trigger = {
          id: `trigger-self-${store.triggers.length + 1}`,
          triggerType: "self-reported",
          activatesPatterns: [patternId],
          examples: [],
          occurrences: 0,
          confidence: 0,
          firstSeen: now,
          lastSeen: now,
        };
        store.triggers.push(trigger);
      }

      trigger.occurrences++;
      trigger.lastSeen = now;
      trigger.confidence = Math.min(1, 1 - Math.exp(-trigger.occurrences / 3));

      if (selfObs.triggerContext && trigger.examples.length < 5) {
        const example = selfObs.triggerContext.slice(0, 150);
        if (!trigger.examples.includes(example)) {
          trigger.examples.push(example);
        }
      }
    }
  }
}

// ─── Query ─────────────────────────────────────────────────

/**
 * Get the most effective correction for a given pattern.
 */
export function getBestCorrection(
  store: BehavioralMemoryStore,
  patternId: string,
): CorrectionRecord | null {
  const corrections = store.corrections
    .filter((c) => c.patternId === patternId && c.effective)
    .sort((a, b) => b.healthDelta - a.healthDelta);
  return corrections[0] ?? null;
}

/**
 * Get all active drift triggers for a pattern.
 */
export function getTriggersForPattern(
  store: BehavioralMemoryStore,
  patternId: string,
): DriftTrigger[] {
  return store.triggers.filter(
    (t) => t.activatesPatterns.includes(patternId) && t.confidence > 0.2,
  );
}

/**
 * Get the trajectory for a behavioral dimension.
 */
export function getTrajectory(
  store: BehavioralMemoryStore,
  dimension: string,
): DimensionTrajectory | null {
  return store.trajectories.find((t) => t.dimension === dimension) ?? null;
}

/**
 * Generate a compact summary of behavioral memory for context injection.
 * ~300 tokens, suitable for system prompt augmentation.
 */
export function getBehavioralMemorySummary(store: BehavioralMemoryStore): string {
  if (store.totalObservations === 0) return "";

  const lines: string[] = [
    `## Behavioral Memory (${store.totalObservations} observations)`,
    "",
  ];

  // Baseline
  const bl = store.baseline;
  lines.push(`Health: ${bl.healthRange[2].toFixed(0)}/100 avg (range: ${bl.healthRange[0].toFixed(0)}-${bl.healthRange[1].toFixed(0)}). Grade: ${bl.typicalGrade}.`);

  // Top triggers
  const activeTriggers = store.triggers
    .filter((t) => t.confidence > 0.3)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  if (activeTriggers.length > 0) {
    lines.push("");
    lines.push("### Known Drift Triggers");
    for (const t of activeTriggers) {
      lines.push(`- ${t.triggerType} → ${t.activatesPatterns.join(", ")} (${(t.confidence * 100).toFixed(0)}% confidence, ${t.occurrences}x seen)`);
    }
  }

  // Trajectories with non-stable trends
  const trending = store.trajectories.filter((t) => t.trend !== "plateauing" && t.scores.length >= 2);
  if (trending.length > 0) {
    lines.push("");
    lines.push("### Trends");
    for (const t of trending) {
      const arrow = t.trend === "improving" ? "↑" : "↓";
      lines.push(`- ${t.dimension}: ${arrow} ${t.trend} (${t.rateOfChange > 0 ? "+" : ""}${t.rateOfChange.toFixed(1)}/session)`);
    }
  }

  // Best corrections
  const topCorrections = store.corrections
    .filter((c) => c.effective)
    .sort((a, b) => b.healthDelta - a.healthDelta)
    .slice(0, 2);

  if (topCorrections.length > 0) {
    lines.push("");
    lines.push("### Effective Interventions");
    for (const c of topCorrections) {
      lines.push(`- ${c.patternId}: "${c.intervention}" (+${c.healthDelta.toFixed(0)} health)`);
    }
  }

  return lines.join("\n");
}

// ─── Internals ─────────────────────────────────────────────

function updateBaseline(store: BehavioralMemoryStore, health: number, grade: string): void {
  const bl = store.baseline;
  const n = store.totalObservations;

  // Rolling average
  bl.healthRange[0] = Math.min(bl.healthRange[0], health);
  bl.healthRange[1] = Math.max(bl.healthRange[1], health);
  bl.healthRange[2] = ((bl.healthRange[2] * (n - 1)) + health) / n;
  bl.typicalGrade = grade;
  bl.updatedAt = new Date().toISOString();
}

function updateTrajectory(
  store: BehavioralMemoryStore,
  dimension: string,
  score: number,
  timestamp: string,
): void {
  let trajectory = store.trajectories.find((t) => t.dimension === dimension);

  if (!trajectory) {
    trajectory = {
      dimension,
      scores: [],
      timestamps: [],
      trend: "plateauing",
      rateOfChange: 0,
    };
    store.trajectories.push(trajectory);
  }

  trajectory.scores.push(score);
  trajectory.timestamps.push(timestamp);

  // Cap at 50 data points
  if (trajectory.scores.length > 50) {
    trajectory.scores = trajectory.scores.slice(-50);
    trajectory.timestamps = trajectory.timestamps.slice(-50);
  }

  // Compute trend from last 5 scores
  if (trajectory.scores.length >= 3) {
    const recent = trajectory.scores.slice(-5);
    const mid = Math.floor(recent.length / 2);
    const firstHalf = recent.slice(0, mid);
    const secondHalf = recent.slice(mid);
    const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
    const delta = avgSecond - avgFirst;

    trajectory.rateOfChange = delta / recent.length;

    if (delta > 5) trajectory.trend = "improving";
    else if (delta < -5) trajectory.trend = "regressing";
    else trajectory.trend = "plateauing";
  }
}

function inferTriggerType(pattern: DetectedPattern, context?: string): string {
  // Use context if provided
  if (context) return context.slice(0, 80);

  // Infer from pattern
  const triggerMap: Record<string, string> = {
    "over-apologizing": "user criticism or correction",
    "hedge-stacking": "request for definitive answer",
    "sycophantic-tendency": "user states opinion confidently",
    "error-spiral": "repeated error correction",
    "boundary-violation": "out-of-scope request",
    "negative-skew": "hostile or frustrated user",
    "register-inconsistency": "mixed formality from user",
    "verbosity": "simple question requiring brief answer",
  };

  return triggerMap[pattern.id] ?? "unclassified";
}
