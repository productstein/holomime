import { describe, it, expect } from "vitest";
import {
  getBenchmarkScenarios,
  getScenarioById,
  type BenchmarkScenario,
} from "../analysis/benchmark-scenarios.js";

describe("benchmark-scenarios", () => {
  it("returns exactly 7 scenarios", () => {
    const scenarios = getBenchmarkScenarios();
    expect(scenarios).toHaveLength(7);
  });

  it("each scenario has required fields", () => {
    const scenarios = getBenchmarkScenarios();
    for (const scenario of scenarios) {
      expect(scenario.id).toBeTruthy();
      expect(scenario.name).toBeTruthy();
      expect(scenario.targetPattern).toBeTruthy();
      expect(scenario.description).toBeTruthy();
      expect(scenario.messages.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("each scenario has unique ID", () => {
    const scenarios = getBenchmarkScenarios();
    const ids = scenarios.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all messages are user role", () => {
    const scenarios = getBenchmarkScenarios();
    for (const scenario of scenarios) {
      for (const msg of scenario.messages) {
        expect(msg.role).toBe("user");
      }
    }
  });

  it("targets each of the 7 detector patterns", () => {
    const scenarios = getBenchmarkScenarios();
    const patterns = scenarios.map(s => s.targetPattern);
    expect(patterns).toContain("over-apologizing");
    expect(patterns).toContain("hedge-stacking");
    expect(patterns).toContain("sycophantic-tendency");
    expect(patterns).toContain("error-spiral");
    expect(patterns).toContain("boundary-violation");
    expect(patterns).toContain("negative-skew");
    expect(patterns).toContain("register-inconsistency");
  });

  it("getScenarioById returns correct scenario", () => {
    const scenario = getScenarioById("apology-trap");
    expect(scenario).toBeDefined();
    expect(scenario!.name).toBe("Apology Trap");
    expect(scenario!.targetPattern).toBe("over-apologizing");
  });

  it("getScenarioById returns undefined for unknown ID", () => {
    const scenario = getScenarioById("nonexistent");
    expect(scenario).toBeUndefined();
  });

  describe("scenario content quality", () => {
    it("apology-trap uses critical/corrective user messages", () => {
      const scenario = getScenarioById("apology-trap")!;
      const hasCorrectiveMessages = scenario.messages.some(m =>
        m.content.toLowerCase().includes("wrong") ||
        m.content.toLowerCase().includes("not what")
      );
      expect(hasCorrectiveMessages).toBe(true);
    });

    it("sycophancy-test includes incorrect factual claims", () => {
      const scenario = getScenarioById("sycophancy-test")!;
      // The sycophancy test should include statements the agent should disagree with
      const hasIncorrectClaims = scenario.messages.some(m =>
        m.content.toLowerCase().includes("faster than c++") ||
        m.content.toLowerCase().includes("plain text") ||
        m.content.toLowerCase().includes("perfectly safe")
      );
      expect(hasIncorrectClaims).toBe(true);
    });

    it("boundary-push asks agent to exceed its role", () => {
      const scenario = getScenarioById("boundary-push")!;
      const hasBoundaryTests = scenario.messages.some(m =>
        m.content.toLowerCase().includes("diagnose") ||
        m.content.toLowerCase().includes("medication") ||
        m.content.toLowerCase().includes("investment advice")
      );
      expect(hasBoundaryTests).toBe(true);
    });
  });
});
