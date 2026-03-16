/**
 * Session Compactor — automatic memory consolidation for the evolve loop.
 *
 * After each evolution cycle, the compactor:
 * 1. Extracts structured behavioral observations from the iteration
 * 2. Deduplicates against existing behavioral memory
 * 3. Merges observations by category (triggers always merge, corrections append)
 * 4. Updates trajectories with new data points
 *
 * This makes the 100th alignment session genuinely more valuable than the 1st
 * by building compounding behavioral knowledge.
 */

import type { DetectedPattern } from "../core/types.js";
import type { IterationResult } from "./evolve-core.js";
import {
  loadBehavioralMemory,
  saveBehavioralMemory,
  createBehavioralMemory,
  recordObservation,
  type BehavioralMemoryStore,
} from "./behavioral-memory.js";
import { agentHandleFromSpec } from "./therapy-memory.js";

// ─── Types ─────────────────────────────────────────────────

export interface CompactionResult {
  /** Number of new observations recorded. */
  observationsRecorded: number;
  /** Number of triggers updated or created. */
  triggersUpdated: number;
  /** Number of corrections recorded. */
  correctionsRecorded: number;
  /** Number of trajectories updated. */
  trajectoriesUpdated: number;
  /** Path where behavioral memory was saved. */
  savedTo: string;
}

export interface CompactionSummary {
  /** Summary of what changed across all iterations. */
  iterations: number;
  /** Total observations recorded during compaction. */
  totalObservations: number;
  /** Patterns that improved across iterations. */
  patternsImproved: string[];
  /** Patterns that persisted across iterations. */
  patternsPersisted: string[];
  /** New triggers discovered. */
  newTriggers: number;
  /** Effective corrections found. */
  effectiveCorrections: number;
}

// ─── Core Compaction ───────────────────────────────────────

/**
 * Compact a single evolution iteration into behavioral memory.
 * Call this after each iteration in the evolve loop.
 */
export function compactIteration(
  spec: any,
  iteration: IterationResult,
  previousHealth?: number,
): CompactionResult {
  const agentHandle = agentHandleFromSpec(spec);
  let store = loadBehavioralMemory(agentHandle);
  if (!store) {
    store = createBehavioralMemory(agentHandle, spec.name ?? "Agent");
  }

  const triggersBefore = store.triggers.length;
  const correctionsBefore = store.corrections.length;

  // Record the observation
  recordObservation(store, {
    patterns: iteration.diagnosis.patterns,
    healthScore: iteration.health,
    grade: iteration.grade,
    interventionsApplied: iteration.appliedChanges.length > 0 ? iteration.appliedChanges : undefined,
    healthDelta: previousHealth !== undefined ? iteration.health - previousHealth : undefined,
    triggerContext: iteration.diagnosis.sessionFocus?.join(", "),
  });

  // Save
  const savedTo = saveBehavioralMemory(store);

  return {
    observationsRecorded: 1,
    triggersUpdated: store.triggers.length - triggersBefore,
    correctionsRecorded: store.corrections.length - correctionsBefore,
    trajectoriesUpdated: iteration.diagnosis.patterns.length + 1, // +1 for overall health
    savedTo,
  };
}

/**
 * Compact all iterations from an evolution run into behavioral memory.
 * Call this at the end of runEvolve() to consolidate the full run.
 */
export function compactEvolutionRun(
  spec: any,
  iterations: IterationResult[],
): CompactionSummary {
  if (iterations.length === 0) {
    return {
      iterations: 0,
      totalObservations: 0,
      patternsImproved: [],
      patternsPersisted: [],
      newTriggers: 0,
      effectiveCorrections: 0,
    };
  }

  const agentHandle = agentHandleFromSpec(spec);
  let store = loadBehavioralMemory(agentHandle);
  if (!store) {
    store = createBehavioralMemory(agentHandle, spec.name ?? "Agent");
  }

  const triggersBefore = store.triggers.length;
  let effectiveCorrections = 0;

  // Track pattern health across iterations
  const patternHealthMap = new Map<string, number[]>();

  for (let i = 0; i < iterations.length; i++) {
    const iteration = iterations[i];
    const previousHealth = i > 0 ? iterations[i - 1].health : undefined;

    // Record observation
    recordObservation(store, {
      patterns: iteration.diagnosis.patterns,
      healthScore: iteration.health,
      grade: iteration.grade,
      interventionsApplied: iteration.appliedChanges.length > 0 ? iteration.appliedChanges : undefined,
      healthDelta: previousHealth !== undefined ? iteration.health - previousHealth : undefined,
      triggerContext: iteration.diagnosis.sessionFocus?.join(", "),
    });

    // Track per-pattern health
    for (const pattern of iteration.diagnosis.patterns) {
      if (pattern.severity === "info") continue;
      const health = pattern.severity === "concern" ? 25 : 50;
      if (!patternHealthMap.has(pattern.id)) {
        patternHealthMap.set(pattern.id, []);
      }
      patternHealthMap.get(pattern.id)!.push(health);
    }

    // Count effective corrections
    if (previousHealth !== undefined && iteration.health > previousHealth) {
      effectiveCorrections++;
    }
  }

  // Determine improved vs persisted patterns
  const patternsImproved: string[] = [];
  const patternsPersisted: string[] = [];

  for (const [patternId, healthScores] of patternHealthMap) {
    if (healthScores.length >= 2) {
      const first = healthScores[0];
      const last = healthScores[healthScores.length - 1];
      if (last > first) {
        patternsImproved.push(patternId);
      } else {
        patternsPersisted.push(patternId);
      }
    } else {
      patternsPersisted.push(patternId);
    }
  }

  // Also check if patterns from early iterations disappeared in later ones
  const lastIteration = iterations[iterations.length - 1];
  const lastPatternIds = new Set(
    lastIteration.diagnosis.patterns
      .filter((p) => p.severity !== "info")
      .map((p) => p.id),
  );

  for (const [patternId] of patternHealthMap) {
    if (!lastPatternIds.has(patternId) && !patternsImproved.includes(patternId)) {
      patternsImproved.push(patternId);
    }
  }

  // Save
  saveBehavioralMemory(store);

  return {
    iterations: iterations.length,
    totalObservations: iterations.length,
    patternsImproved,
    patternsPersisted,
    newTriggers: store.triggers.length - triggersBefore,
    effectiveCorrections,
  };
}

/**
 * Merge behavioral memory from multiple agents into a shared baseline.
 * Useful for fleet-wide behavioral knowledge transfer.
 */
export function mergeStores(
  stores: BehavioralMemoryStore[],
  targetHandle: string,
  targetName: string,
): BehavioralMemoryStore {
  const merged = createBehavioralMemory(targetHandle, targetName);

  for (const store of stores) {
    // Merge triggers (deduplicate by triggerType + patterns)
    for (const trigger of store.triggers) {
      const existing = merged.triggers.find(
        (t) =>
          t.triggerType === trigger.triggerType &&
          JSON.stringify(t.activatesPatterns.sort()) === JSON.stringify(trigger.activatesPatterns.sort()),
      );

      if (existing) {
        existing.occurrences += trigger.occurrences;
        existing.confidence = Math.max(existing.confidence, trigger.confidence);
        existing.lastSeen = trigger.lastSeen > existing.lastSeen ? trigger.lastSeen : existing.lastSeen;
        for (const ex of trigger.examples) {
          if (existing.examples.length < 5 && !existing.examples.includes(ex)) {
            existing.examples.push(ex);
          }
        }
      } else {
        merged.triggers.push({ ...trigger });
      }
    }

    // Merge corrections (append, dedup by pattern+intervention)
    for (const correction of store.corrections) {
      const exists = merged.corrections.some(
        (c) => c.patternId === correction.patternId && c.intervention === correction.intervention,
      );
      if (!exists) {
        merged.corrections.push({ ...correction });
      }
    }

    // Merge trajectories (combine data points)
    for (const trajectory of store.trajectories) {
      const existing = merged.trajectories.find((t) => t.dimension === trajectory.dimension);
      if (existing) {
        existing.scores.push(...trajectory.scores);
        existing.timestamps.push(...trajectory.timestamps);
        // Sort by timestamp
        const combined = existing.scores.map((s, i) => ({ score: s, ts: existing.timestamps[i] }));
        combined.sort((a, b) => a.ts.localeCompare(b.ts));
        existing.scores = combined.map((c) => c.score);
        existing.timestamps = combined.map((c) => c.ts);
        // Cap at 50
        if (existing.scores.length > 50) {
          existing.scores = existing.scores.slice(-50);
          existing.timestamps = existing.timestamps.slice(-50);
        }
      } else {
        merged.trajectories.push({ ...trajectory });
      }
    }

    merged.totalObservations += store.totalObservations;
  }

  merged.lastUpdatedAt = new Date().toISOString();
  return merged;
}
