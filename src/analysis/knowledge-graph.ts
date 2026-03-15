/**
 * Behavioral Knowledge Graph — tracks what interventions work.
 *
 * A local graph database that connects agents, behaviors, triggers,
 * interventions, and outcomes. Enables cross-agent learning by
 * recording which interventions improve which patterns.
 *
 * Storage: .holomime/graph/knowledge-graph.json
 * Temporal semantics: edges have weight, validAt, lastConfirmed, expired.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import type { DetectedPattern } from "../core/types.js";
import type { SessionTranscript } from "./session-runner.js";
import type { PreSessionDiagnosis } from "./pre-session.js";

// ─── Types ─────────────────────────────────────────────────

export type NodeType = "agent" | "behavior" | "trigger" | "intervention" | "outcome";
export type EdgeType = "exhibits" | "triggers" | "treats" | "improves" | "worsens" | "correlates";

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: EdgeType;
  weight: number;       // 0-1 effectiveness
  validAt: string;      // ISO timestamp
  lastConfirmed: string;
  expired: boolean;
}

export interface KnowledgeGraph {
  version: 1;
  nodes: GraphNode[];
  edges: GraphEdge[];
  lastUpdated: string;
}

// ─── Storage ───────────────────────────────────────────────

function graphDir(): string {
  return resolve(process.cwd(), ".holomime", "graph");
}

function graphPath(): string {
  return join(graphDir(), "knowledge-graph.json");
}

export function loadGraph(): KnowledgeGraph {
  const path = graphPath();
  if (!existsSync(path)) return createGraph();
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as KnowledgeGraph;
  } catch {
    return createGraph();
  }
}

export function saveGraph(graph: KnowledgeGraph): string {
  const dir = graphDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const path = graphPath();
  graph.lastUpdated = new Date().toISOString();
  writeFileSync(path, JSON.stringify(graph, null, 2));
  return path;
}

export function createGraph(): KnowledgeGraph {
  return {
    version: 1,
    nodes: [],
    edges: [],
    lastUpdated: new Date().toISOString(),
  };
}

// ─── CRUD ──────────────────────────────────────────────────

export function addNode(
  graph: KnowledgeGraph,
  id: string,
  type: NodeType,
  label: string,
  metadata: Record<string, unknown> = {},
): GraphNode {
  let node = graph.nodes.find((n) => n.id === id);
  if (node) {
    // Update existing node metadata
    Object.assign(node.metadata, metadata);
    return node;
  }
  node = {
    id,
    type,
    label,
    metadata,
    createdAt: new Date().toISOString(),
  };
  graph.nodes.push(node);
  return node;
}

export function addEdge(
  graph: KnowledgeGraph,
  source: string,
  target: string,
  type: EdgeType,
  weight: number = 0.5,
): GraphEdge {
  const now = new Date().toISOString();

  // Update existing edge if found
  const existing = graph.edges.find(
    (e) => e.source === source && e.target === target && e.type === type,
  );
  if (existing) {
    existing.weight = weight;
    existing.lastConfirmed = now;
    existing.expired = false;
    return existing;
  }

  const edge: GraphEdge = {
    source,
    target,
    type,
    weight: Math.max(0, Math.min(1, weight)),
    validAt: now,
    lastConfirmed: now,
    expired: false,
  };
  graph.edges.push(edge);
  return edge;
}

export function findNode(graph: KnowledgeGraph, id: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

export function findNodesByType(graph: KnowledgeGraph, type: NodeType): GraphNode[] {
  return graph.nodes.filter((n) => n.type === type);
}

export function findEdges(
  graph: KnowledgeGraph,
  opts: { source?: string; target?: string; type?: EdgeType },
): GraphEdge[] {
  return graph.edges.filter((e) => {
    if (e.expired) return false;
    if (opts.source && e.source !== opts.source) return false;
    if (opts.target && e.target !== opts.target) return false;
    if (opts.type && e.type !== opts.type) return false;
    return true;
  });
}

export function getNeighbors(graph: KnowledgeGraph, nodeId: string): GraphNode[] {
  const neighborIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.expired) continue;
    if (edge.source === nodeId) neighborIds.add(edge.target);
    if (edge.target === nodeId) neighborIds.add(edge.source);
  }
  return graph.nodes.filter((n) => neighborIds.has(n.id));
}

// ─── Queries ───────────────────────────────────────────────

/**
 * Find interventions that have been effective for a specific pattern.
 * Returns interventions sorted by edge weight (effectiveness).
 */
export function queryInterventions(
  graph: KnowledgeGraph,
  patternId: string,
): { intervention: GraphNode; weight: number }[] {
  const behaviorNode = findNode(graph, `behavior:${patternId}`);
  if (!behaviorNode) return [];

  const treatsEdges = findEdges(graph, { target: behaviorNode.id, type: "treats" })
    .concat(findEdges(graph, { target: behaviorNode.id, type: "improves" }));

  return treatsEdges
    .map((edge) => {
      const intervention = findNode(graph, edge.source);
      return intervention ? { intervention, weight: edge.weight } : null;
    })
    .filter((x): x is { intervention: GraphNode; weight: number } => x !== null)
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Get all behaviors exhibited by a specific agent.
 */
export function getAgentBehaviors(
  graph: KnowledgeGraph,
  agentHandle: string,
): { behavior: GraphNode; weight: number }[] {
  const agentNode = findNode(graph, `agent:${agentHandle}`);
  if (!agentNode) return [];

  const exhibitEdges = findEdges(graph, { source: agentNode.id, type: "exhibits" });
  return exhibitEdges
    .map((edge) => {
      const behavior = findNode(graph, edge.target);
      return behavior ? { behavior, weight: edge.weight } : null;
    })
    .filter((x): x is { behavior: GraphNode; weight: number } => x !== null)
    .sort((a, b) => b.weight - a.weight);
}

// ─── Population ────────────────────────────────────────────

/**
 * Populate graph from a diagnosis result.
 */
export function populateFromDiagnosis(
  graph: KnowledgeGraph,
  agentHandle: string,
  agentName: string,
  patterns: DetectedPattern[],
): void {
  // Ensure agent node
  addNode(graph, `agent:${agentHandle}`, "agent", agentName, { handle: agentHandle });

  for (const pattern of patterns) {
    if (pattern.severity === "info") continue;

    // Add behavior node
    const behaviorId = `behavior:${pattern.id}`;
    addNode(graph, behaviorId, "behavior", pattern.name, {
      severity: pattern.severity,
      description: pattern.description,
    });

    // Agent exhibits behavior
    const severityWeight = pattern.severity === "concern" ? 0.9 : 0.6;
    addEdge(graph, `agent:${agentHandle}`, behaviorId, "exhibits", severityWeight);
  }
}

/**
 * Populate graph from a completed therapy session.
 */
export function populateFromSession(
  graph: KnowledgeGraph,
  agentHandle: string,
  transcript: SessionTranscript,
): void {
  const agentNodeId = `agent:${agentHandle}`;
  addNode(graph, agentNodeId, "agent", transcript.agent, { handle: agentHandle });

  for (const pattern of transcript.preDiagnosis.patterns) {
    if (pattern.severity === "info") continue;
    const behaviorId = `behavior:${pattern.id}`;
    addNode(graph, behaviorId, "behavior", pattern.name);

    // Record that recommendations were tried as interventions
    for (const rec of transcript.recommendations) {
      const interventionId = `intervention:${slugify(rec)}`;
      addNode(graph, interventionId, "intervention", rec);
      addEdge(graph, interventionId, behaviorId, "treats", 0.5);
    }
  }
}

/**
 * Populate graph from an evolve iteration result.
 */
export function populateFromEvolve(
  graph: KnowledgeGraph,
  agentHandle: string,
  patternsDetected: string[],
  patternsResolved: string[],
  interventions: string[],
  health: number,
): void {
  const agentNodeId = `agent:${agentHandle}`;

  for (const patternId of patternsDetected) {
    const behaviorId = `behavior:${patternId}`;
    addNode(graph, behaviorId, "behavior", patternId);
    addEdge(graph, agentNodeId, behaviorId, "exhibits", 0.7);

    for (const intervention of interventions) {
      const interventionId = `intervention:${slugify(intervention)}`;
      addNode(graph, interventionId, "intervention", intervention);

      const resolved = patternsResolved.includes(patternId);
      const edgeType: EdgeType = resolved ? "improves" : "treats";
      const weight = resolved ? Math.min(1, health / 100) : 0.3;
      addEdge(graph, interventionId, behaviorId, edgeType, weight);

      // Record outcome
      const outcomeId = `outcome:${agentHandle}-${patternId}-${Date.now()}`;
      addNode(graph, outcomeId, "outcome", resolved ? "resolved" : "in-progress", {
        health,
        timestamp: new Date().toISOString(),
      });
      addEdge(graph, interventionId, outcomeId, resolved ? "improves" : "treats", weight);
    }
  }
}

// ─── Maintenance ───────────────────────────────────────────

/**
 * Update an edge's weight (e.g., after evaluating intervention effectiveness).
 */
export function updateEdgeWeight(
  graph: KnowledgeGraph,
  source: string,
  target: string,
  type: EdgeType,
  newWeight: number,
): void {
  const edge = graph.edges.find(
    (e) => e.source === source && e.target === target && e.type === type,
  );
  if (edge) {
    edge.weight = Math.max(0, Math.min(1, newWeight));
    edge.lastConfirmed = new Date().toISOString();
  }
}

/**
 * Expire edges older than the given threshold (days).
 */
export function expireOldEdges(graph: KnowledgeGraph, maxAgeDays: number = 90): number {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let expired = 0;

  for (const edge of graph.edges) {
    const lastConfirmed = new Date(edge.lastConfirmed).getTime();
    if (lastConfirmed < cutoff && !edge.expired) {
      edge.expired = true;
      expired++;
    }
  }

  return expired;
}

/**
 * Get graph statistics.
 */
export function graphStats(graph: KnowledgeGraph): {
  nodes: number;
  edges: number;
  agents: number;
  behaviors: number;
  interventions: number;
  activeEdges: number;
} {
  return {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    agents: graph.nodes.filter((n) => n.type === "agent").length,
    behaviors: graph.nodes.filter((n) => n.type === "behavior").length,
    interventions: graph.nodes.filter((n) => n.type === "intervention").length,
    activeEdges: graph.edges.filter((e) => !e.expired).length,
  };
}

// ─── Helpers ───────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
