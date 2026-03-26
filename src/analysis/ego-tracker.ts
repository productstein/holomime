/**
 * Ego Tracker — metacognitive self-modification for ego.runtime.
 *
 * Tracks every mediation decision the ego makes, evaluates outcomes,
 * and suggests parameter adjustments based on accumulated evidence.
 *
 * Inspired by the Hyperagents framework (Zhang et al., 2026):
 * "The modification procedure itself should be editable."
 * The ego doesn't just mediate — it learns to mediate better.
 *
 * This is the meta-meta level: therapy improves the agent,
 * and the ego tracker improves the therapy process itself.
 */

import type {
  MediationDecision,
  StrategyPerformance,
} from "../core/stack-types.js";

// ─── Types ──────────────────────────────────────────────────

export interface EgoAdjustment {
  parameter: string;
  currentValue: string | number;
  suggestedValue: string | number;
  reason: string;
  confidence: number;
}

export interface EgoTrackerStats {
  totalDecisions: number;
  positiveOutcomes: number;
  negativeOutcomes: number;
  mostEffectiveStrategy: string;
  leastEffectiveStrategy: string;
  adjustmentsSuggested: number;
}

// ─── Ego Tracker ────────────────────────────────────────────

export class EgoTracker {
  private history: MediationDecision[];
  private performance: Record<string, StrategyPerformance>;
  private autoAdjust: boolean;

  constructor(options?: {
    history?: MediationDecision[];
    performance?: Record<string, StrategyPerformance>;
    autoAdjust?: boolean;
  }) {
    this.history = options?.history ?? [];
    this.performance = options?.performance ?? {};
    this.autoAdjust = options?.autoAdjust ?? false;
  }

  /**
   * Log a mediation decision.
   */
  logDecision(decision: MediationDecision): void {
    this.history.push({
      ...decision,
      timestamp: decision.timestamp ?? new Date().toISOString(),
    });

    // Initialize strategy performance if new
    if (!this.performance[decision.strategy_used]) {
      this.performance[decision.strategy_used] = {
        attempts: 0,
        successes: 0,
        effectiveness: 0.5,
      };
    }

    this.performance[decision.strategy_used].attempts++;
  }

  /**
   * Record the outcome of a previous decision.
   * Call this after observing whether the decision led to good results.
   */
  recordOutcome(
    index: number,
    outcome: "positive" | "neutral" | "negative",
  ): void {
    if (index < 0 || index >= this.history.length) return;

    this.history[index].outcome = outcome;
    const strategy = this.history[index].strategy_used;

    if (this.performance[strategy]) {
      if (outcome === "positive") {
        this.performance[strategy].successes++;
      }
      // Recalculate effectiveness
      const perf = this.performance[strategy];
      perf.effectiveness = perf.attempts > 0
        ? perf.successes / perf.attempts
        : 0.5;
    }
  }

  /**
   * Suggest ego.runtime parameter adjustments based on accumulated evidence.
   * Only returns suggestions when there's enough data (10+ decisions).
   */
  suggestAdjustments(currentConfig: {
    conflict_resolution: string;
    adaptation_rate: number;
    emotional_regulation: number;
    response_strategy: string;
  }): EgoAdjustment[] {
    const adjustments: EgoAdjustment[] = [];

    if (this.history.length < 10) return adjustments; // Not enough data

    // ── Analyze block rate ─────────────────────────────────
    const blocked = this.history.filter((d) => d.decision === "blocked");
    const blockRate = blocked.length / this.history.length;

    // If blocking too much (>40%), suggest moving toward "balanced"
    if (blockRate > 0.4 && currentConfig.conflict_resolution === "conscience_first") {
      adjustments.push({
        parameter: "conflict_resolution",
        currentValue: currentConfig.conflict_resolution,
        suggestedValue: "balanced",
        reason: `Block rate is ${(blockRate * 100).toFixed(0)}% — conscience_first may be too restrictive`,
        confidence: Math.min(0.9, blockRate),
      });
    }

    // If blocking too little (<5%), suggest stricter enforcement
    if (blockRate < 0.05 && currentConfig.conflict_resolution === "balanced") {
      adjustments.push({
        parameter: "conflict_resolution",
        currentValue: currentConfig.conflict_resolution,
        suggestedValue: "conscience_first",
        reason: `Block rate is only ${(blockRate * 100).toFixed(0)}% — may need stricter enforcement`,
        confidence: 0.6,
      });
    }

    // ── Analyze strategy effectiveness ──────────────────────
    const strategies = Object.entries(this.performance);
    if (strategies.length > 1) {
      const sorted = strategies.sort((a, b) => b[1].effectiveness - a[1].effectiveness);
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];

      if (best[1].effectiveness > 0.7 && best[0] !== currentConfig.response_strategy) {
        adjustments.push({
          parameter: "response_strategy",
          currentValue: currentConfig.response_strategy,
          suggestedValue: best[0],
          reason: `Strategy "${best[0]}" has ${(best[1].effectiveness * 100).toFixed(0)}% effectiveness vs current "${currentConfig.response_strategy}"`,
          confidence: best[1].effectiveness,
        });
      }
    }

    // ── Analyze negative outcome patterns ────────────────────
    const negatives = this.history.filter((d) => d.outcome === "negative");
    const negativeRate = negatives.length / this.history.filter((d) => d.outcome).length || 0;

    if (negativeRate > 0.3) {
      // High negative rate — suggest increasing emotional regulation
      const newRegulation = Math.min(1.0, currentConfig.emotional_regulation + 0.15);
      if (newRegulation !== currentConfig.emotional_regulation) {
        adjustments.push({
          parameter: "emotional_regulation",
          currentValue: currentConfig.emotional_regulation,
          suggestedValue: Number(newRegulation.toFixed(2)),
          reason: `${(negativeRate * 100).toFixed(0)}% negative outcomes — increasing emotional regulation for smoother mediation`,
          confidence: 0.7,
        });
      }
    }

    // ── Adaptation rate self-tuning ──────────────────────────
    const recentDecisions = this.history.slice(-20);
    const recentModified = recentDecisions.filter((d) => d.decision === "modified");
    const modifyRate = recentModified.length / recentDecisions.length;

    if (modifyRate > 0.5 && currentConfig.adaptation_rate < 0.7) {
      adjustments.push({
        parameter: "adaptation_rate",
        currentValue: currentConfig.adaptation_rate,
        suggestedValue: Number(Math.min(0.9, currentConfig.adaptation_rate + 0.2).toFixed(2)),
        reason: `${(modifyRate * 100).toFixed(0)}% of recent actions modified — agent adapts frequently, increase adaptation rate`,
        confidence: 0.65,
      });
    }

    return adjustments;
  }

  /**
   * Apply suggested adjustments to ego config (if auto_adjust is enabled).
   * Returns the modified config.
   */
  applyAdjustments(
    currentConfig: Record<string, unknown>,
    adjustments: EgoAdjustment[],
    minConfidence: number = 0.6,
  ): Record<string, unknown> {
    if (!this.autoAdjust) return currentConfig;

    const updated = { ...currentConfig };
    for (const adj of adjustments) {
      if (adj.confidence >= minConfidence) {
        updated[adj.parameter] = adj.suggestedValue;
      }
    }
    return updated;
  }

  /**
   * Get tracker statistics.
   */
  getStats(): EgoTrackerStats {
    const positives = this.history.filter((d) => d.outcome === "positive").length;
    const negatives = this.history.filter((d) => d.outcome === "negative").length;

    const strategies = Object.entries(this.performance);
    const sorted = strategies.sort((a, b) => b[1].effectiveness - a[1].effectiveness);

    return {
      totalDecisions: this.history.length,
      positiveOutcomes: positives,
      negativeOutcomes: negatives,
      mostEffectiveStrategy: sorted[0]?.[0] ?? "none",
      leastEffectiveStrategy: sorted[sorted.length - 1]?.[0] ?? "none",
      adjustmentsSuggested: this.suggestAdjustments({
        conflict_resolution: "conscience_first",
        adaptation_rate: 0.5,
        emotional_regulation: 0.7,
        response_strategy: "balanced",
      }).length,
    };
  }

  /**
   * Export current state for persistence.
   */
  export(): {
    history: MediationDecision[];
    performance: Record<string, StrategyPerformance>;
  } {
    return {
      history: [...this.history],
      performance: { ...this.performance },
    };
  }
}
