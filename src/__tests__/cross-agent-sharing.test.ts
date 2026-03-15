import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildSharedKnowledge,
  querySharedKnowledge,
  findCrossAgentCorrelations,
  transferIntervention,
  discoverAgentData,
  type SharedKnowledge,
} from "../analysis/cross-agent-sharing.js";
import {
  createGraph,
  addNode,
  addEdge,
  type KnowledgeGraph,
} from "../analysis/knowledge-graph.js";
import type {
  Intervention,
  InterventionRepertoire,
} from "../analysis/intervention-tracker.js";

// ─── Helpers ──────────────────────────────────────────────

function makeIntervention(overrides: Partial<Intervention> = {}): Intervention {
  return {
    id: "int-1",
    name: "Confident Reframe",
    targetPatterns: ["over-apologizing"],
    specChanges: {},
    promptGuidance: "Reframe with confidence",
    escalationLevel: 1,
    successRate: 0.8,
    timesUsed: 5,
    timesSucceeded: 4,
    source: "built-in",
    createdAt: "2025-06-01T00:00:00Z",
    ...overrides,
  };
}

function makeRepertoire(interventions: Intervention[]): InterventionRepertoire {
  return { version: 1, interventions, lastUpdated: new Date().toISOString() };
}

function makeAgentGraph(agentId: string, behaviorIds: string[]): KnowledgeGraph {
  const graph = createGraph();
  addNode(graph, `agent:${agentId}`, "agent", agentId);
  for (const bid of behaviorIds) {
    addNode(graph, `behavior:${bid}`, "behavior", bid);
    addEdge(graph, `agent:${agentId}`, `behavior:${bid}`, "exhibits", 0.7);
  }
  return graph;
}

// ─── Tests ────────────────────────────────────────────────

describe("cross-agent-sharing", () => {
  describe("buildSharedKnowledge", () => {
    it("aggregates interventions from multiple repertoires", () => {
      const r1 = makeRepertoire([makeIntervention({ id: "a", source: "built-in", successRate: 0.9 })]);
      const r2 = makeRepertoire([makeIntervention({ id: "a", source: "learned", successRate: 0.7 })]);

      const shared = buildSharedKnowledge([], [r1, r2]);
      expect(shared.effectiveInterventions).toHaveLength(1);
      expect(shared.effectiveInterventions[0].globalSuccessRate).toBe(0.8);
      expect(shared.effectiveInterventions[0].usedByAgents).toContain("built-in");
      expect(shared.effectiveInterventions[0].usedByAgents).toContain("learned");
    });

    it("filters out interventions with successRate <= 0.4", () => {
      const r = makeRepertoire([makeIntervention({ successRate: 0.3 })]);
      const shared = buildSharedKnowledge([], [r]);
      expect(shared.effectiveInterventions).toHaveLength(0);
    });

    it("skips unused interventions (timesUsed === 0)", () => {
      const r = makeRepertoire([makeIntervention({ timesUsed: 0 })]);
      const shared = buildSharedKnowledge([], [r]);
      expect(shared.effectiveInterventions).toHaveLength(0);
    });

    it("sorts effective interventions by success rate descending", () => {
      const r = makeRepertoire([
        makeIntervention({ id: "low", name: "Low", successRate: 0.5 }),
        makeIntervention({ id: "high", name: "High", successRate: 0.9 }),
      ]);
      const shared = buildSharedKnowledge([], [r]);
      expect(shared.effectiveInterventions[0].globalSuccessRate).toBe(0.9);
      expect(shared.effectiveInterventions[1].globalSuccessRate).toBe(0.5);
    });

    it("counts unique agents from graphs", () => {
      const g1 = makeAgentGraph("alpha", ["hedge"]);
      const g2 = makeAgentGraph("beta", ["hedge"]);
      const shared = buildSharedKnowledge([g1, g2], []);
      expect(shared.agentCount).toBe(2);
    });

    it("builds pattern correlations from co-occurring behaviors", () => {
      const g1 = makeAgentGraph("a1", ["apology", "hedge"]);
      const g2 = makeAgentGraph("a2", ["apology", "hedge"]);
      const shared = buildSharedKnowledge([g1, g2], []);

      expect(shared.patternCorrelations).toHaveLength(1);
      expect(shared.patternCorrelations[0].agentCount).toBe(2);
      expect(shared.patternCorrelations[0].coOccurrenceRate).toBe(1);
    });

    it("requires >= 2 agents for a correlation", () => {
      const g = makeAgentGraph("solo", ["apology", "hedge"]);
      const shared = buildSharedKnowledge([g], []);
      expect(shared.patternCorrelations).toHaveLength(0);
    });

    it("handles empty inputs", () => {
      const shared = buildSharedKnowledge([], []);
      expect(shared.effectiveInterventions).toEqual([]);
      expect(shared.patternCorrelations).toEqual([]);
      expect(shared.agentCount).toBe(0);
    });

    it("sets lastUpdated to ISO timestamp", () => {
      const shared = buildSharedKnowledge([], []);
      expect(shared.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("querySharedKnowledge", () => {
    let shared: SharedKnowledge;

    beforeEach(() => {
      const r = makeRepertoire([
        makeIntervention({ id: "i1", successRate: 0.9, targetPatterns: ["apology"], source: "built-in" }),
        makeIntervention({ id: "i2", name: "Hedge Reducer", successRate: 0.7, targetPatterns: ["hedge"], source: "learned" }),
      ]);
      shared = buildSharedKnowledge([], [r]);
    });

    it("returns interventions matching the queried pattern", () => {
      const results = querySharedKnowledge({ patternId: "apology" }, shared);
      expect(results).toHaveLength(1);
      expect(results[0].intervention.id).toBe("i1");
    });

    it("returns empty array for unknown pattern", () => {
      const results = querySharedKnowledge({ patternId: "unknown" }, shared);
      expect(results).toHaveLength(0);
    });

    it("excludes interventions from a specified agent", () => {
      const results = querySharedKnowledge({ patternId: "apology", excludeAgent: "built-in" }, shared);
      expect(results).toHaveLength(0);
    });

    it("sorts results by global success rate descending", () => {
      shared.effectiveInterventions.push({
        intervention: makeIntervention({ id: "i3", successRate: 0.5 }),
        usedByAgents: ["other"],
        globalSuccessRate: 0.5,
        targetPatterns: ["apology"],
      });

      const results = querySharedKnowledge({ patternId: "apology" }, shared);
      expect(results).toHaveLength(2);
      expect(results[0].globalSuccessRate).toBeGreaterThanOrEqual(results[1].globalSuccessRate);
    });
  });

  describe("findCrossAgentCorrelations", () => {
    it("returns correlations involving the given pattern", () => {
      const g1 = makeAgentGraph("a1", ["apology", "hedge", "filler"]);
      const g2 = makeAgentGraph("a2", ["apology", "hedge"]);
      const shared = buildSharedKnowledge([g1, g2], []);

      const corrs = findCrossAgentCorrelations(shared, "apology");
      expect(corrs.length).toBeGreaterThan(0);
      expect(corrs.every((c) => c.patternA === "apology" || c.patternB === "apology")).toBe(true);
    });

    it("returns empty when pattern has no correlations", () => {
      const g1 = makeAgentGraph("a1", ["apology"]);
      const g2 = makeAgentGraph("a2", ["hedge"]);
      const shared = buildSharedKnowledge([g1, g2], []);
      expect(findCrossAgentCorrelations(shared, "apology")).toHaveLength(0);
    });

    it("returns empty for unknown pattern", () => {
      const shared = buildSharedKnowledge([], []);
      expect(findCrossAgentCorrelations(shared, "nonexistent")).toHaveLength(0);
    });
  });

  describe("transferIntervention", () => {
    it("creates a cross-agent copy with 0.8x success rate", () => {
      const source = makeIntervention({ successRate: 1.0 });
      const target = makeRepertoire([]);

      const transferred = transferIntervention(source, target);
      expect(transferred).not.toBeNull();
      expect(transferred!.successRate).toBe(0.8);
      expect(transferred!.source).toBe("cross-agent");
      expect(transferred!.timesUsed).toBe(0);
      expect(transferred!.timesSucceeded).toBe(0);
      expect(transferred!.id).toMatch(/^cross-/);
      expect(target.interventions).toHaveLength(1);
    });

    it("returns null if intervention already exists by name", () => {
      const source = makeIntervention({ name: "Reframe" });
      const target = makeRepertoire([makeIntervention({ name: "Reframe" })]);

      expect(transferIntervention(source, target)).toBeNull();
      expect(target.interventions).toHaveLength(1);
    });

    it("preserves original properties except source/rate/counters", () => {
      const source = makeIntervention({
        name: "Unique Transfer",
        targetPatterns: ["hedge-stacking"],
        promptGuidance: "Custom guidance",
        escalationLevel: 2,
      });
      const target = makeRepertoire([]);

      const transferred = transferIntervention(source, target);
      expect(transferred!.name).toBe("Unique Transfer");
      expect(transferred!.targetPatterns).toContain("hedge-stacking");
      expect(transferred!.promptGuidance).toBe("Custom guidance");
      expect(transferred!.escalationLevel).toBe(2);
    });

    it("sets a fresh createdAt timestamp", () => {
      const source = makeIntervention({ name: "Fresh TS", createdAt: "2020-01-01T00:00:00Z" });
      const target = makeRepertoire([]);

      const transferred = transferIntervention(source, target);
      expect(transferred!.createdAt).not.toBe("2020-01-01T00:00:00Z");
      expect(transferred!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("discoverAgentData", () => {
    it("loads graph and repertoire from agent subdirectories", () => {
      const tmp = mkdtempSync(join(tmpdir(), "holomime-discover-"));

      const graphDir = join(tmp, "agent-1", ".holomime", "graph");
      mkdirSync(graphDir, { recursive: true });
      writeFileSync(
        join(graphDir, "knowledge-graph.json"),
        JSON.stringify(makeAgentGraph("agent-1", ["apology"])),
      );

      const repDir = join(tmp, "agent-1", ".holomime", "interventions");
      mkdirSync(repDir, { recursive: true });
      writeFileSync(
        join(repDir, "repertoire.json"),
        JSON.stringify(makeRepertoire([makeIntervention({ timesUsed: 3 })])),
      );

      const result = discoverAgentData(tmp);
      expect(result.graphs.length).toBeGreaterThanOrEqual(1);
      expect(result.repertoires.length).toBeGreaterThanOrEqual(1);
    });

    it("handles missing base directory gracefully", () => {
      const result = discoverAgentData("/nonexistent/path/abc123");
      expect(result.graphs).toBeDefined();
      expect(result.repertoires).toBeDefined();
    });

    it("skips non-directory entries", () => {
      const tmp = mkdtempSync(join(tmpdir(), "holomime-discover-"));
      writeFileSync(join(tmp, "not-a-dir.txt"), "hello");

      const result = discoverAgentData(tmp);
      // Should not throw; file entry is silently skipped
      expect(result.graphs).toBeDefined();
    });

    it("skips malformed JSON files", () => {
      const tmp = mkdtempSync(join(tmpdir(), "holomime-discover-"));
      const graphDir = join(tmp, "bad-agent", ".holomime", "graph");
      mkdirSync(graphDir, { recursive: true });
      writeFileSync(join(graphDir, "knowledge-graph.json"), "{ broken json");

      const result = discoverAgentData(tmp);
      // Should not throw; malformed file is silently skipped
      expect(result.graphs).toBeDefined();
    });
  });
});
