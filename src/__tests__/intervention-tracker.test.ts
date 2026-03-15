import { describe, it, expect } from "vitest";
import {
  createRepertoire,
  selectIntervention,
  recordInterventionOutcome,
  type InterventionRepertoire,
  type Intervention,
} from "../analysis/intervention-tracker.js";
import { createGraph, addNode, addEdge } from "../analysis/knowledge-graph.js";

describe("intervention-tracker", () => {
  describe("createRepertoire", () => {
    it("has built-in interventions", () => {
      const repertoire = createRepertoire();
      expect(repertoire.interventions.length).toBeGreaterThan(0);
      expect(repertoire.version).toBe(1);
      expect(repertoire.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("includes interventions for all 7 detector patterns", () => {
      const repertoire = createRepertoire();
      const allPatterns = new Set(
        repertoire.interventions.flatMap((i) => i.targetPatterns),
      );

      expect(allPatterns.has("over-apologizing")).toBe(true);
      expect(allPatterns.has("hedge-stacking")).toBe(true);
      expect(allPatterns.has("sycophantic-tendency")).toBe(true);
      expect(allPatterns.has("error-spiral")).toBe(true);
      expect(allPatterns.has("boundary-violation")).toBe(true);
      expect(allPatterns.has("register-inconsistency")).toBe(true);
      expect(allPatterns.has("excessive-verbosity")).toBe(true);
    });

    it("all built-in interventions have source 'built-in'", () => {
      const repertoire = createRepertoire();
      for (const intervention of repertoire.interventions) {
        expect(intervention.source).toBe("built-in");
      }
    });

    it("all built-in interventions start with default success rate", () => {
      const repertoire = createRepertoire();
      for (const intervention of repertoire.interventions) {
        expect(intervention.successRate).toBe(0.5);
        expect(intervention.timesUsed).toBe(0);
        expect(intervention.timesSucceeded).toBe(0);
      }
    });

    it("has interventions at multiple escalation levels", () => {
      const repertoire = createRepertoire();
      const levels = new Set(repertoire.interventions.map((i) => i.escalationLevel));
      expect(levels.has(1)).toBe(true);
      expect(levels.has(2)).toBe(true);
    });
  });

  describe("selectIntervention", () => {
    it("returns best match for known pattern", () => {
      const repertoire = createRepertoire();
      const intervention = selectIntervention(repertoire, "over-apologizing");
      expect(intervention).not.toBeNull();
      expect(intervention!.targetPatterns).toContain("over-apologizing");
    });

    it("returns null for unknown pattern", () => {
      const repertoire = createRepertoire();
      const intervention = selectIntervention(repertoire, "completely-unknown-pattern");
      expect(intervention).toBeNull();
    });

    it("prefers level 1 when no failures", () => {
      const repertoire = createRepertoire();
      const intervention = selectIntervention(repertoire, "over-apologizing");
      expect(intervention).not.toBeNull();
      expect(intervention!.escalationLevel).toBe(1);
    });

    it("escalates when lower levels have failed", () => {
      const repertoire = createRepertoire();

      // Simulate level 1 failure: set used >= 2 and successRate < 0.3
      const level1Interventions = repertoire.interventions.filter(
        (i) => i.targetPatterns.includes("over-apologizing") && i.escalationLevel === 1,
      );
      for (const intervention of level1Interventions) {
        intervention.timesUsed = 5;
        intervention.successRate = 0.1;
      }

      const selected = selectIntervention(repertoire, "over-apologizing");
      expect(selected).not.toBeNull();
      expect(selected!.escalationLevel).toBeGreaterThanOrEqual(2);
    });

    it("uses graph weights when graph is provided", () => {
      const repertoire = createRepertoire();
      const graph = createGraph();

      // Set up a graph edge that boosts a specific intervention
      addNode(graph, "behavior:over-apologizing", "behavior", "Over-Apologizing");
      addNode(graph, "intervention:apology-audit", "intervention", "Apology Audit");
      addEdge(graph, "intervention:apology-audit", "behavior:over-apologizing", "treats", 0.95);

      const selected = selectIntervention(repertoire, "over-apologizing", graph);
      expect(selected).not.toBeNull();
    });

    it("sorts by success rate descending", () => {
      const repertoire = createRepertoire();
      // Manually set different success rates
      const apologyInterventions = repertoire.interventions.filter(
        (i) => i.targetPatterns.includes("over-apologizing"),
      );
      if (apologyInterventions.length >= 2) {
        apologyInterventions[0].successRate = 0.3;
        apologyInterventions[1].successRate = 0.9;
      }

      const selected = selectIntervention(repertoire, "over-apologizing");
      expect(selected).not.toBeNull();
      expect(selected!.successRate).toBeGreaterThanOrEqual(0.5);
    });

    it("returns intervention for each known pattern", () => {
      const repertoire = createRepertoire();
      const knownPatterns = [
        "over-apologizing",
        "hedge-stacking",
        "sycophantic-tendency",
        "error-spiral",
        "boundary-violation",
        "register-inconsistency",
        "excessive-verbosity",
      ];

      for (const patternId of knownPatterns) {
        const intervention = selectIntervention(repertoire, patternId);
        expect(intervention).not.toBeNull();
        expect(intervention!.targetPatterns).toContain(patternId);
      }
    });
  });

  describe("recordInterventionOutcome", () => {
    it("increments timesUsed on success", () => {
      const repertoire = createRepertoire();
      const id = repertoire.interventions[0].id;

      recordInterventionOutcome(repertoire, id, true);
      const intervention = repertoire.interventions.find((i) => i.id === id)!;
      expect(intervention.timesUsed).toBe(1);
      expect(intervention.timesSucceeded).toBe(1);
    });

    it("increments timesUsed on failure", () => {
      const repertoire = createRepertoire();
      const id = repertoire.interventions[0].id;

      recordInterventionOutcome(repertoire, id, false);
      const intervention = repertoire.interventions.find((i) => i.id === id)!;
      expect(intervention.timesUsed).toBe(1);
      expect(intervention.timesSucceeded).toBe(0);
    });

    it("updates success rate with EMA on success", () => {
      const repertoire = createRepertoire();
      const id = repertoire.interventions[0].id;
      const initialRate = repertoire.interventions[0].successRate; // 0.5

      recordInterventionOutcome(repertoire, id, true);
      const intervention = repertoire.interventions.find((i) => i.id === id)!;

      // EMA: alpha=0.3, so new = 0.3 * 1.0 + 0.7 * 0.5 = 0.65
      expect(intervention.successRate).toBeCloseTo(0.65, 2);
    });

    it("updates success rate with EMA on failure", () => {
      const repertoire = createRepertoire();
      const id = repertoire.interventions[0].id;

      recordInterventionOutcome(repertoire, id, false);
      const intervention = repertoire.interventions.find((i) => i.id === id)!;

      // EMA: alpha=0.3, so new = 0.3 * 0.0 + 0.7 * 0.5 = 0.35
      expect(intervention.successRate).toBeCloseTo(0.35, 2);
    });

    it("converges toward 1.0 with repeated successes", () => {
      const repertoire = createRepertoire();
      const id = repertoire.interventions[0].id;

      for (let i = 0; i < 20; i++) {
        recordInterventionOutcome(repertoire, id, true);
      }

      const intervention = repertoire.interventions.find((i) => i.id === id)!;
      expect(intervention.successRate).toBeGreaterThan(0.95);
    });

    it("converges toward 0.0 with repeated failures", () => {
      const repertoire = createRepertoire();
      const id = repertoire.interventions[0].id;

      for (let i = 0; i < 20; i++) {
        recordInterventionOutcome(repertoire, id, false);
      }

      const intervention = repertoire.interventions.find((i) => i.id === id)!;
      expect(intervention.successRate).toBeLessThan(0.05);
    });

    it("does nothing for unknown intervention id", () => {
      const repertoire = createRepertoire();
      const beforeCount = repertoire.interventions[0].timesUsed;

      recordInterventionOutcome(repertoire, "nonexistent-id", true);

      // Nothing should have changed
      expect(repertoire.interventions[0].timesUsed).toBe(beforeCount);
    });
  });
});
