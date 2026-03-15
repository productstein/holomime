import { describe, it, expect } from "vitest";
import {
  createGraph,
  addNode,
  addEdge,
  findNode,
  findNodesByType,
  findEdges,
  getNeighbors,
  queryInterventions,
  getAgentBehaviors,
  populateFromDiagnosis,
  populateFromSession,
  populateFromEvolve,
  expireOldEdges,
  graphStats,
  type KnowledgeGraph,
} from "../analysis/knowledge-graph.js";
import type { DetectedPattern } from "../core/types.js";
import { createSampleTranscript } from "./fixtures/sample-transcript.js";

describe("knowledge-graph", () => {
  describe("createGraph", () => {
    it("creates an empty graph with correct structure", () => {
      const graph = createGraph();
      expect(graph.version).toBe(1);
      expect(graph.nodes).toEqual([]);
      expect(graph.edges).toEqual([]);
      expect(graph.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("addNode", () => {
    it("adds a new node to the graph", () => {
      const graph = createGraph();
      const node = addNode(graph, "agent:test", "agent", "TestAgent");
      expect(node.id).toBe("agent:test");
      expect(node.type).toBe("agent");
      expect(node.label).toBe("TestAgent");
      expect(graph.nodes).toHaveLength(1);
    });

    it("deduplicates nodes by id", () => {
      const graph = createGraph();
      addNode(graph, "agent:test", "agent", "TestAgent");
      addNode(graph, "agent:test", "agent", "TestAgent", { extra: "data" });
      expect(graph.nodes).toHaveLength(1);
    });

    it("merges metadata on duplicate add", () => {
      const graph = createGraph();
      addNode(graph, "agent:test", "agent", "TestAgent", { version: 1 });
      const node = addNode(graph, "agent:test", "agent", "TestAgent", { extra: "data" });
      expect(node.metadata.version).toBe(1);
      expect(node.metadata.extra).toBe("data");
    });

    it("sets createdAt timestamp", () => {
      const graph = createGraph();
      const node = addNode(graph, "agent:test", "agent", "TestAgent");
      expect(node.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("addEdge", () => {
    it("adds a new edge to the graph", () => {
      const graph = createGraph();
      addNode(graph, "agent:test", "agent", "TestAgent");
      addNode(graph, "behavior:apology", "behavior", "Over-Apologizing");
      const edge = addEdge(graph, "agent:test", "behavior:apology", "exhibits", 0.7);
      expect(edge.source).toBe("agent:test");
      expect(edge.target).toBe("behavior:apology");
      expect(edge.type).toBe("exhibits");
      expect(edge.weight).toBe(0.7);
      expect(edge.expired).toBe(false);
      expect(graph.edges).toHaveLength(1);
    });

    it("updates existing edge instead of duplicating", () => {
      const graph = createGraph();
      addEdge(graph, "a", "b", "exhibits", 0.5);
      addEdge(graph, "a", "b", "exhibits", 0.9);
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].weight).toBe(0.9);
    });

    it("clamps weight between 0 and 1", () => {
      const graph = createGraph();
      const edge1 = addEdge(graph, "a", "b", "exhibits", 1.5);
      expect(edge1.weight).toBe(1);
      const edge2 = addEdge(graph, "c", "d", "exhibits", -0.5);
      expect(edge2.weight).toBe(0);
    });

    it("un-expires edge on update", () => {
      const graph = createGraph();
      const edge = addEdge(graph, "a", "b", "exhibits", 0.5);
      edge.expired = true;
      addEdge(graph, "a", "b", "exhibits", 0.8);
      expect(graph.edges[0].expired).toBe(false);
    });
  });

  describe("findNode", () => {
    it("finds a node by id", () => {
      const graph = createGraph();
      addNode(graph, "agent:test", "agent", "TestAgent");
      const found = findNode(graph, "agent:test");
      expect(found).toBeDefined();
      expect(found!.label).toBe("TestAgent");
    });

    it("returns undefined for missing node", () => {
      const graph = createGraph();
      expect(findNode(graph, "nonexistent")).toBeUndefined();
    });
  });

  describe("findNodesByType", () => {
    it("returns all nodes of a given type", () => {
      const graph = createGraph();
      addNode(graph, "agent:a", "agent", "A");
      addNode(graph, "agent:b", "agent", "B");
      addNode(graph, "behavior:x", "behavior", "X");

      const agents = findNodesByType(graph, "agent");
      expect(agents).toHaveLength(2);
      expect(agents.map((n) => n.id)).toContain("agent:a");
      expect(agents.map((n) => n.id)).toContain("agent:b");
    });

    it("returns empty array when no matches", () => {
      const graph = createGraph();
      expect(findNodesByType(graph, "outcome")).toEqual([]);
    });
  });

  describe("findEdges", () => {
    it("finds edges by source", () => {
      const graph = createGraph();
      addEdge(graph, "a", "b", "exhibits", 0.5);
      addEdge(graph, "a", "c", "exhibits", 0.6);
      addEdge(graph, "d", "e", "treats", 0.7);

      const edges = findEdges(graph, { source: "a" });
      expect(edges).toHaveLength(2);
    });

    it("finds edges by target", () => {
      const graph = createGraph();
      addEdge(graph, "a", "b", "exhibits", 0.5);
      addEdge(graph, "c", "b", "treats", 0.6);

      const edges = findEdges(graph, { target: "b" });
      expect(edges).toHaveLength(2);
    });

    it("finds edges by type", () => {
      const graph = createGraph();
      addEdge(graph, "a", "b", "exhibits", 0.5);
      addEdge(graph, "c", "d", "treats", 0.6);

      const edges = findEdges(graph, { type: "treats" });
      expect(edges).toHaveLength(1);
    });

    it("excludes expired edges", () => {
      const graph = createGraph();
      const edge = addEdge(graph, "a", "b", "exhibits", 0.5);
      edge.expired = true;

      expect(findEdges(graph, { source: "a" })).toHaveLength(0);
    });

    it("combines filters", () => {
      const graph = createGraph();
      addEdge(graph, "a", "b", "exhibits", 0.5);
      addEdge(graph, "a", "c", "treats", 0.6);
      addEdge(graph, "d", "b", "exhibits", 0.7);

      const edges = findEdges(graph, { source: "a", type: "exhibits" });
      expect(edges).toHaveLength(1);
      expect(edges[0].target).toBe("b");
    });
  });

  describe("getNeighbors", () => {
    it("returns connected nodes", () => {
      const graph = createGraph();
      addNode(graph, "a", "agent", "A");
      addNode(graph, "b", "behavior", "B");
      addNode(graph, "c", "behavior", "C");
      addNode(graph, "d", "agent", "D");
      addEdge(graph, "a", "b", "exhibits");
      addEdge(graph, "a", "c", "exhibits");

      const neighbors = getNeighbors(graph, "a");
      expect(neighbors).toHaveLength(2);
      expect(neighbors.map((n) => n.id)).toContain("b");
      expect(neighbors.map((n) => n.id)).toContain("c");
    });

    it("returns neighbors from both edge directions", () => {
      const graph = createGraph();
      addNode(graph, "a", "agent", "A");
      addNode(graph, "b", "behavior", "B");
      addNode(graph, "c", "intervention", "C");
      addEdge(graph, "a", "b", "exhibits");
      addEdge(graph, "c", "a", "treats");

      const neighbors = getNeighbors(graph, "a");
      expect(neighbors).toHaveLength(2);
    });

    it("excludes expired edges", () => {
      const graph = createGraph();
      addNode(graph, "a", "agent", "A");
      addNode(graph, "b", "behavior", "B");
      const edge = addEdge(graph, "a", "b", "exhibits");
      edge.expired = true;

      expect(getNeighbors(graph, "a")).toHaveLength(0);
    });

    it("returns empty for isolated node", () => {
      const graph = createGraph();
      addNode(graph, "lonely", "agent", "Lonely");
      expect(getNeighbors(graph, "lonely")).toHaveLength(0);
    });
  });

  describe("queryInterventions", () => {
    it("returns interventions sorted by weight", () => {
      const graph = createGraph();
      addNode(graph, "behavior:apology", "behavior", "Over-Apologizing");
      addNode(graph, "intervention:a", "intervention", "Confident Reframe");
      addNode(graph, "intervention:b", "intervention", "Apology Audit");
      addEdge(graph, "intervention:a", "behavior:apology", "treats", 0.8);
      addEdge(graph, "intervention:b", "behavior:apology", "treats", 0.5);

      const results = queryInterventions(graph, "apology");
      expect(results).toHaveLength(2);
      expect(results[0].intervention.label).toBe("Confident Reframe");
      expect(results[0].weight).toBe(0.8);
    });

    it("includes both treats and improves edges", () => {
      const graph = createGraph();
      addNode(graph, "behavior:apology", "behavior", "Over-Apologizing");
      addNode(graph, "intervention:a", "intervention", "A");
      addNode(graph, "intervention:b", "intervention", "B");
      addEdge(graph, "intervention:a", "behavior:apology", "treats", 0.5);
      addEdge(graph, "intervention:b", "behavior:apology", "improves", 0.9);

      const results = queryInterventions(graph, "apology");
      expect(results).toHaveLength(2);
      expect(results[0].weight).toBe(0.9);
    });

    it("returns empty for unknown pattern", () => {
      const graph = createGraph();
      expect(queryInterventions(graph, "nonexistent")).toEqual([]);
    });
  });

  describe("getAgentBehaviors", () => {
    it("returns agent's behaviors", () => {
      const graph = createGraph();
      addNode(graph, "agent:test", "agent", "TestAgent");
      addNode(graph, "behavior:apology", "behavior", "Over-Apologizing");
      addNode(graph, "behavior:hedge", "behavior", "Hedge Stacking");
      addEdge(graph, "agent:test", "behavior:apology", "exhibits", 0.8);
      addEdge(graph, "agent:test", "behavior:hedge", "exhibits", 0.5);

      const behaviors = getAgentBehaviors(graph, "test");
      expect(behaviors).toHaveLength(2);
      expect(behaviors[0].weight).toBeGreaterThanOrEqual(behaviors[1].weight);
    });

    it("returns empty for unknown agent", () => {
      const graph = createGraph();
      expect(getAgentBehaviors(graph, "nonexistent")).toEqual([]);
    });
  });

  describe("populateFromDiagnosis", () => {
    it("creates agent node and behavior nodes with edges", () => {
      const graph = createGraph();
      const patterns: DetectedPattern[] = [
        { id: "over-apologizing", name: "Over-Apologizing", severity: "warning", count: 5, percentage: 35, description: "Too many apologies", examples: [] },
        { id: "hedge-stacking", name: "Hedge Stacking", severity: "concern", count: 3, percentage: 20, description: "Too many hedges", examples: [] },
      ];

      populateFromDiagnosis(graph, "test-agent", "TestAgent", patterns);

      expect(findNode(graph, "agent:test-agent")).toBeDefined();
      expect(findNode(graph, "behavior:over-apologizing")).toBeDefined();
      expect(findNode(graph, "behavior:hedge-stacking")).toBeDefined();

      const edges = findEdges(graph, { source: "agent:test-agent", type: "exhibits" });
      expect(edges).toHaveLength(2);
    });

    it("skips info-severity patterns", () => {
      const graph = createGraph();
      const patterns: DetectedPattern[] = [
        { id: "test-info", name: "Info Pattern", severity: "info", count: 1, percentage: 5, description: "Info only", examples: [] },
      ];

      populateFromDiagnosis(graph, "test-agent", "TestAgent", patterns);
      expect(findNode(graph, "behavior:test-info")).toBeUndefined();
    });

    it("assigns higher weight to concern severity", () => {
      const graph = createGraph();
      const patterns: DetectedPattern[] = [
        { id: "mild", name: "Mild", severity: "warning", count: 1, percentage: 10, description: "Mild", examples: [] },
        { id: "severe", name: "Severe", severity: "concern", count: 5, percentage: 50, description: "Severe", examples: [] },
      ];

      populateFromDiagnosis(graph, "test", "Test", patterns);
      const edges = findEdges(graph, { source: "agent:test", type: "exhibits" });
      const mildEdge = edges.find((e) => e.target === "behavior:mild");
      const severeEdge = edges.find((e) => e.target === "behavior:severe");
      expect(severeEdge!.weight).toBeGreaterThan(mildEdge!.weight);
    });
  });

  describe("populateFromSession", () => {
    it("creates intervention edges for recommendations", () => {
      const graph = createGraph();
      const transcript = createSampleTranscript();

      populateFromSession(graph, "test-agent", transcript);

      const interventionNodes = findNodesByType(graph, "intervention");
      expect(interventionNodes.length).toBeGreaterThan(0);

      // Interventions should have "treats" edges to behaviors
      for (const node of interventionNodes) {
        const edges = findEdges(graph, { source: node.id, type: "treats" });
        expect(edges.length).toBeGreaterThan(0);
      }
    });
  });

  describe("populateFromEvolve", () => {
    it("creates outcome nodes for detected patterns", () => {
      const graph = createGraph();
      addNode(graph, "agent:test", "agent", "Test");

      populateFromEvolve(
        graph,
        "test",
        ["over-apologizing"],
        ["over-apologizing"],
        ["confident-reframe"],
        85,
      );

      const outcomes = findNodesByType(graph, "outcome");
      expect(outcomes.length).toBeGreaterThan(0);
      expect(outcomes[0].label).toBe("resolved");
    });

    it("uses improves edge type for resolved patterns", () => {
      const graph = createGraph();
      addNode(graph, "agent:test", "agent", "Test");

      populateFromEvolve(graph, "test", ["over-apologizing"], ["over-apologizing"], ["confident-reframe"], 85);

      const behaviorId = "behavior:over-apologizing";
      const improvesEdges = findEdges(graph, { target: behaviorId, type: "improves" });
      expect(improvesEdges.length).toBeGreaterThan(0);
    });

    it("uses treats edge type for unresolved patterns", () => {
      const graph = createGraph();
      addNode(graph, "agent:test", "agent", "Test");

      populateFromEvolve(graph, "test", ["over-apologizing"], [], ["confident-reframe"], 50);

      const behaviorId = "behavior:over-apologizing";
      const treatsEdges = findEdges(graph, { target: behaviorId, type: "treats" });
      expect(treatsEdges.length).toBeGreaterThan(0);
    });
  });

  describe("expireOldEdges", () => {
    it("marks old edges as expired", () => {
      const graph = createGraph();
      const edge = addEdge(graph, "a", "b", "exhibits", 0.5);
      // Set lastConfirmed to 100 days ago
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      edge.lastConfirmed = oldDate;

      const expired = expireOldEdges(graph, 90);
      expect(expired).toBe(1);
      expect(edge.expired).toBe(true);
    });

    it("does not expire recent edges", () => {
      const graph = createGraph();
      addEdge(graph, "a", "b", "exhibits", 0.5);
      // Edge was just created, so it's recent

      const expired = expireOldEdges(graph, 90);
      expect(expired).toBe(0);
    });

    it("does not re-expire already expired edges", () => {
      const graph = createGraph();
      const edge = addEdge(graph, "a", "b", "exhibits", 0.5);
      edge.expired = true;
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      edge.lastConfirmed = oldDate;

      const expired = expireOldEdges(graph, 90);
      expect(expired).toBe(0);
    });
  });

  describe("graphStats", () => {
    it("returns correct counts", () => {
      const graph = createGraph();
      addNode(graph, "agent:a", "agent", "A");
      addNode(graph, "agent:b", "agent", "B");
      addNode(graph, "behavior:x", "behavior", "X");
      addNode(graph, "intervention:y", "intervention", "Y");
      addEdge(graph, "agent:a", "behavior:x", "exhibits", 0.5);
      const expiredEdge = addEdge(graph, "agent:b", "behavior:x", "exhibits", 0.3);
      expiredEdge.expired = true;

      const stats = graphStats(graph);
      expect(stats.nodes).toBe(4);
      expect(stats.edges).toBe(2);
      expect(stats.agents).toBe(2);
      expect(stats.behaviors).toBe(1);
      expect(stats.interventions).toBe(1);
      expect(stats.activeEdges).toBe(1);
    });

    it("returns zeros for empty graph", () => {
      const graph = createGraph();
      const stats = graphStats(graph);
      expect(stats.nodes).toBe(0);
      expect(stats.edges).toBe(0);
      expect(stats.activeEdges).toBe(0);
    });
  });
});
