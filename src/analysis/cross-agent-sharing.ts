/**
 * Cross-Agent Knowledge Sharing — fleet and network share learned interventions.
 *
 * What worked for Agent A informs Agent B. Aggregates interventions,
 * pattern correlations, and transferable DPO pairs across agents.
 *
 * Inspired by Cognee's multi-agent knowledge sharing architecture.
 */

import { readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import type { KnowledgeGraph, GraphNode } from "./knowledge-graph.js";
import type { InterventionRepertoire, Intervention } from "./intervention-tracker.js";
import { loadGraph, findNodesByType, findEdges, getAgentBehaviors } from "./knowledge-graph.js";
import { loadRepertoire } from "./intervention-tracker.js";

// ─── Types ─────────────────────────────────────────────────

export interface SharedKnowledge {
  effectiveInterventions: SharedIntervention[];
  patternCorrelations: PatternCorrelation[];
  agentCount: number;
  lastUpdated: string;
}

export interface SharedIntervention {
  intervention: Intervention;
  usedByAgents: string[];
  globalSuccessRate: number;
  targetPatterns: string[];
}

export interface PatternCorrelation {
  patternA: string;
  patternB: string;
  coOccurrenceRate: number;
  agentCount: number;
}

export interface CrossAgentQuery {
  patternId: string;
  excludeAgent?: string;
}

// ─── Core ──────────────────────────────────────────────────

/**
 * Build shared knowledge from multiple agents' graphs and repertoires.
 */
export function buildSharedKnowledge(
  graphs: KnowledgeGraph[],
  repertoires: InterventionRepertoire[],
): SharedKnowledge {
  const interventionMap = new Map<string, SharedIntervention>();
  const patternAgentMap = new Map<string, Set<string>>();

  // Aggregate interventions
  for (const repertoire of repertoires) {
    for (const intervention of repertoire.interventions) {
      if (intervention.timesUsed === 0) continue;

      const existing = interventionMap.get(intervention.id);
      if (existing) {
        existing.globalSuccessRate = (existing.globalSuccessRate + intervention.successRate) / 2;
        existing.usedByAgents = [...new Set([...existing.usedByAgents, intervention.source])];
      } else {
        interventionMap.set(intervention.id, {
          intervention: { ...intervention },
          usedByAgents: [intervention.source],
          globalSuccessRate: intervention.successRate,
          targetPatterns: intervention.targetPatterns,
        });
      }
    }
  }

  // Find pattern co-occurrences across agents
  for (const graph of graphs) {
    const agents = findNodesByType(graph, "agent");
    for (const agent of agents) {
      const behaviors = getAgentBehaviors(graph, agent.id.replace("agent:", ""));
      const patternIds = behaviors.map((b) => b.behavior.id.replace("behavior:", ""));

      for (const pid of patternIds) {
        if (!patternAgentMap.has(pid)) patternAgentMap.set(pid, new Set());
        patternAgentMap.get(pid)!.add(agent.id);
      }
    }
  }

  // Build correlations (patterns that co-occur across agents)
  const correlations: PatternCorrelation[] = [];
  const patternIds = [...patternAgentMap.keys()];
  for (let i = 0; i < patternIds.length; i++) {
    for (let j = i + 1; j < patternIds.length; j++) {
      const agentsA = patternAgentMap.get(patternIds[i])!;
      const agentsB = patternAgentMap.get(patternIds[j])!;
      const intersection = [...agentsA].filter((a) => agentsB.has(a));

      if (intersection.length >= 2) {
        correlations.push({
          patternA: patternIds[i],
          patternB: patternIds[j],
          coOccurrenceRate: intersection.length / Math.max(agentsA.size, agentsB.size),
          agentCount: intersection.length,
        });
      }
    }
  }

  return {
    effectiveInterventions: [...interventionMap.values()]
      .filter((si) => si.globalSuccessRate > 0.4)
      .sort((a, b) => b.globalSuccessRate - a.globalSuccessRate),
    patternCorrelations: correlations.sort((a, b) => b.coOccurrenceRate - a.coOccurrenceRate),
    agentCount: new Set(
      graphs.flatMap((g) => findNodesByType(g, "agent").map((n) => n.id)),
    ).size,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Query shared knowledge for interventions effective against a specific pattern.
 */
export function querySharedKnowledge(
  query: CrossAgentQuery,
  shared: SharedKnowledge,
): SharedIntervention[] {
  return shared.effectiveInterventions
    .filter((si) =>
      si.targetPatterns.includes(query.patternId) &&
      (!query.excludeAgent || !si.usedByAgents.includes(query.excludeAgent)),
    )
    .sort((a, b) => b.globalSuccessRate - a.globalSuccessRate);
}

/**
 * Find pattern correlations involving a specific pattern.
 */
export function findCrossAgentCorrelations(
  shared: SharedKnowledge,
  patternId: string,
): PatternCorrelation[] {
  return shared.patternCorrelations.filter(
    (c) => c.patternA === patternId || c.patternB === patternId,
  );
}

/**
 * Transfer an intervention from one agent's repertoire to another's.
 * Adapts the intervention for the target agent's context.
 */
export function transferIntervention(
  intervention: Intervention,
  targetRepertoire: InterventionRepertoire,
): Intervention | null {
  // Check if already exists
  const exists = targetRepertoire.interventions.some(
    (i) => i.name === intervention.name,
  );
  if (exists) return null;

  const transferred: Intervention = {
    ...intervention,
    id: `cross-${intervention.id}-${Date.now()}`,
    source: "cross-agent",
    successRate: intervention.successRate * 0.8, // Slight discount for cross-agent transfer
    timesUsed: 0,
    timesSucceeded: 0,
    createdAt: new Date().toISOString(),
  };

  targetRepertoire.interventions.push(transferred);
  return transferred;
}

// ─── Discovery ─────────────────────────────────────────────

/**
 * Discover all agent directories and load their graphs/repertoires.
 * Looks for .holomime/memory/ therapy-memory.json files, aggregates data.
 */
export function discoverAgentData(
  baseDir?: string,
): { graphs: KnowledgeGraph[]; repertoires: InterventionRepertoire[] } {
  const graphs: KnowledgeGraph[] = [];
  const repertoires: InterventionRepertoire[] = [];

  // Load the main graph
  const mainGraph = loadGraph();
  if (mainGraph.nodes.length > 0) {
    graphs.push(mainGraph);
  }

  // Load the main repertoire
  const mainRepertoire = loadRepertoire();
  if (mainRepertoire.interventions.some((i) => i.timesUsed > 0)) {
    repertoires.push(mainRepertoire);
  }

  // If a fleet directory is provided, scan for per-agent data
  if (baseDir && existsSync(baseDir)) {
    try {
      const entries = readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const agentDir = join(baseDir, entry.name);
        const agentGraphPath = join(agentDir, ".holomime", "graph", "knowledge-graph.json");
        const agentRepertoirePath = join(agentDir, ".holomime", "interventions", "repertoire.json");

        if (existsSync(agentGraphPath)) {
          try {
            const graph = JSON.parse(
              require("node:fs").readFileSync(agentGraphPath, "utf-8"),
            );
            graphs.push(graph);
          } catch { /* skip */ }
        }

        if (existsSync(agentRepertoirePath)) {
          try {
            const repertoire = JSON.parse(
              require("node:fs").readFileSync(agentRepertoirePath, "utf-8"),
            );
            repertoires.push(repertoire);
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  }

  return { graphs, repertoires };
}
