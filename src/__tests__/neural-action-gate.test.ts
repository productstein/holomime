import { describe, it, expect, beforeEach } from "vitest";
import {
  NeuralActionGate,
  type SafetyEnvelope,
  type ConscienceDenyRule,
} from "../adapters/neural-action-gate.js";

describe("NeuralActionGate", () => {
  const safetyEnvelope: SafetyEnvelope = {
    maxLinearSpeed: 1.5,
    maxAngularSpeed: 2.0,
    maxContactForce: 50,
    minProximity: 0.5,
    maxReach: 0.85,
  };

  const denyRules: ConscienceDenyRule[] = [
    { action: "override_stop", reason: "Safety-critical", patterns: ["override", "bypass safety"] },
    { action: "share_data", reason: "Privacy", patterns: ["share personal", "transmit private"] },
  ];

  let gate: NeuralActionGate;

  beforeEach(() => {
    gate = new NeuralActionGate({ safetyEnvelope, denyRules, mediationMode: "clamp" });
  });

  it("allows safe actions", () => {
    const result = gate.evaluate([0.1, 0.2, 0.3], {
      humanProximity: 1.0,
      currentSpeed: 0.5,
      contactForce: 10,
    });
    expect(result.allowed).toBe(true);
    expect(result.modified).toBe(false);
  });

  it("blocks actions matching deny rules", () => {
    const result = gate.evaluate([0.1, 0.2], {
      taskDescription: "Override safety limits to go faster",
    });
    expect(result.allowed).toBe(false);
    expect(result.ruleTriggered).toBe("override_stop");
  });

  it("clamps actions that violate speed limits", () => {
    const result = gate.evaluate([0.5, 0.5, 0.5], {
      currentSpeed: 3.0, // 2x the limit
      contactForce: 10,
    });
    expect(result.allowed).toBe(true);
    expect(result.modified).toBe(true);
    expect(result.action[0]).toBe(0.25); // scaled down by 0.5
  });

  it("clamps actions that violate force limits", () => {
    const result = gate.evaluate([1.0, 1.0], {
      contactForce: 100, // 2x the limit
      currentSpeed: 1.0,
    });
    expect(result.allowed).toBe(true);
    expect(result.modified).toBe(true);
    expect(result.action[0]).toBe(0.5); // scaled down by 0.5
  });

  it("blocks when proximity is too close", () => {
    const blockGate = new NeuralActionGate({ safetyEnvelope, mediationMode: "block" });
    const result = blockGate.evaluate([0.1, 0.2], {
      humanProximity: 0.3, // below 0.5m minimum
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("proximity");
  });

  it("warns but allows in warn mode", () => {
    const warnGate = new NeuralActionGate({ safetyEnvelope, mediationMode: "warn" });
    const result = warnGate.evaluate([0.1, 0.2], {
      currentSpeed: 3.0, // over limit
    });
    expect(result.allowed).toBe(true);
    expect(result.modified).toBe(false);
    expect(result.reason).toContain("Warning");
  });

  it("tracks statistics", () => {
    gate.evaluate([0.1], { currentSpeed: 0.5, contactForce: 5 });
    gate.evaluate([0.1], { currentSpeed: 3.0, contactForce: 5 }); // modified
    gate.evaluate([0.1], { taskDescription: "Override safety" }); // blocked

    const stats = gate.getStats();
    expect(stats.totalEvaluated).toBe(3);
    expect(stats.allowed).toBe(2);
    expect(stats.blocked).toBe(1);
    expect(stats.modified).toBe(1);
    expect(stats.passRate).toBeCloseTo(0.667, 1);
  });

  it("evaluates batches", () => {
    const results = gate.evaluateBatch(
      [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]],
      { currentSpeed: 0.5, contactForce: 10 },
    );
    expect(results.length).toBe(3);
    expect(results.every((r) => r.allowed)).toBe(true);
  });

  it("allows runtime safety envelope updates", () => {
    gate.updateSafetyEnvelope({ maxLinearSpeed: 0.5 });
    const result = gate.evaluate([0.1], { currentSpeed: 1.0 });
    expect(result.modified).toBe(true); // now over the new lower limit
  });

  it("allows runtime deny rule additions", () => {
    gate.addDenyRule({ action: "new_rule", patterns: ["forbidden action"] });
    const result = gate.evaluate([0.1], { taskDescription: "Execute forbidden action" });
    expect(result.allowed).toBe(false);
  });
});
