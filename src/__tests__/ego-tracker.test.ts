import { describe, it, expect, beforeEach } from "vitest";
import { EgoTracker } from "../analysis/ego-tracker.js";
import type { MediationDecision } from "../core/stack-types.js";

describe("EgoTracker", () => {
  let tracker: EgoTracker;

  beforeEach(() => {
    tracker = new EgoTracker({ autoAdjust: true });
  });

  it("logs mediation decisions", () => {
    tracker.logDecision({
      situation: "User asked to override safety",
      decision: "blocked",
      strategy_used: "conscience_first",
    });

    const stats = tracker.getStats();
    expect(stats.totalDecisions).toBe(1);
  });

  it("records outcomes and updates strategy performance", () => {
    tracker.logDecision({
      situation: "Speed limit approached",
      decision: "modified",
      strategy_used: "balanced",
    });
    tracker.recordOutcome(0, "positive");

    const exported = tracker.export();
    expect(exported.performance["balanced"].successes).toBe(1);
    expect(exported.performance["balanced"].effectiveness).toBe(1.0);
  });

  it("tracks multiple strategies", () => {
    tracker.logDecision({ situation: "a", decision: "blocked", strategy_used: "conscience_first" });
    tracker.logDecision({ situation: "b", decision: "allowed", strategy_used: "balanced" });
    tracker.logDecision({ situation: "c", decision: "modified", strategy_used: "cautious" });

    tracker.recordOutcome(0, "positive");
    tracker.recordOutcome(1, "negative");
    tracker.recordOutcome(2, "positive");

    const exported = tracker.export();
    expect(exported.performance["conscience_first"].effectiveness).toBe(1.0);
    expect(exported.performance["balanced"].effectiveness).toBe(0.0);
    expect(exported.performance["cautious"].effectiveness).toBe(1.0);
  });

  it("suggests no adjustments with insufficient data", () => {
    // Only 3 decisions — needs 10+
    for (let i = 0; i < 3; i++) {
      tracker.logDecision({ situation: `test_${i}`, decision: "allowed", strategy_used: "balanced" });
    }

    const adjustments = tracker.suggestAdjustments({
      conflict_resolution: "conscience_first",
      adaptation_rate: 0.5,
      emotional_regulation: 0.7,
      response_strategy: "balanced",
    });
    expect(adjustments.length).toBe(0);
  });

  it("suggests loosening when block rate is too high", () => {
    // 12 decisions, 6 blocked (50% block rate)
    for (let i = 0; i < 6; i++) {
      tracker.logDecision({ situation: `blocked_${i}`, decision: "blocked", strategy_used: "conscience_first" });
    }
    for (let i = 0; i < 6; i++) {
      tracker.logDecision({ situation: `allowed_${i}`, decision: "allowed", strategy_used: "conscience_first" });
    }

    const adjustments = tracker.suggestAdjustments({
      conflict_resolution: "conscience_first",
      adaptation_rate: 0.5,
      emotional_regulation: 0.7,
      response_strategy: "balanced",
    });

    const conflictAdj = adjustments.find((a) => a.parameter === "conflict_resolution");
    expect(conflictAdj).toBeDefined();
    expect(conflictAdj!.suggestedValue).toBe("balanced");
  });

  it("suggests tightening when block rate is too low", () => {
    for (let i = 0; i < 20; i++) {
      tracker.logDecision({ situation: `allowed_${i}`, decision: "allowed", strategy_used: "balanced" });
    }

    const adjustments = tracker.suggestAdjustments({
      conflict_resolution: "balanced",
      adaptation_rate: 0.5,
      emotional_regulation: 0.7,
      response_strategy: "balanced",
    });

    const conflictAdj = adjustments.find((a) => a.parameter === "conflict_resolution");
    expect(conflictAdj).toBeDefined();
    expect(conflictAdj!.suggestedValue).toBe("conscience_first");
  });

  it("suggests increasing emotional regulation on high negative rate", () => {
    for (let i = 0; i < 12; i++) {
      tracker.logDecision({ situation: `test_${i}`, decision: "allowed", strategy_used: "balanced" });
      tracker.recordOutcome(i, i < 5 ? "negative" : "positive");
    }

    const adjustments = tracker.suggestAdjustments({
      conflict_resolution: "balanced",
      adaptation_rate: 0.5,
      emotional_regulation: 0.5,
      response_strategy: "balanced",
    });

    const regAdj = adjustments.find((a) => a.parameter === "emotional_regulation");
    expect(regAdj).toBeDefined();
    expect(regAdj!.suggestedValue).toBeGreaterThan(0.5);
  });

  it("applies adjustments when auto_adjust is enabled", () => {
    const config = {
      conflict_resolution: "conscience_first",
      adaptation_rate: 0.5,
      emotional_regulation: 0.7,
      response_strategy: "balanced",
    };

    const adjustments = [
      { parameter: "conflict_resolution", currentValue: "conscience_first", suggestedValue: "balanced", reason: "test", confidence: 0.8 },
    ];

    const updated = tracker.applyAdjustments(config, adjustments);
    expect(updated.conflict_resolution).toBe("balanced");
  });

  it("does not apply adjustments when auto_adjust is disabled", () => {
    const noAutoTracker = new EgoTracker({ autoAdjust: false });
    const config = { conflict_resolution: "conscience_first" };
    const adjustments = [
      { parameter: "conflict_resolution", currentValue: "conscience_first", suggestedValue: "balanced", reason: "test", confidence: 0.9 },
    ];

    const updated = noAutoTracker.applyAdjustments(config, adjustments);
    expect(updated.conflict_resolution).toBe("conscience_first"); // unchanged
  });

  it("exports state for persistence", () => {
    tracker.logDecision({ situation: "test", decision: "allowed", strategy_used: "balanced" });
    tracker.recordOutcome(0, "positive");

    const exported = tracker.export();
    expect(exported.history.length).toBe(1);
    expect(exported.performance["balanced"]).toBeDefined();
    expect(exported.performance["balanced"].successes).toBe(1);
  });
});
