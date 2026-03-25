/**
 * Memory Retriever — intent-based behavioral memory retrieval
 * with tiered loading. Inspired by OpenViking's hierarchical retrieval.
 */

import { type MemoryNode, MemoryLevel } from "../core/stack-types.js";

export interface BehavioralQuery {
  text: string;
  category?: "triggers" | "corrections" | "patterns" | "trajectories";
  intent: string;
  priority: number;
  suggestedTier?: MemoryLevel;
}

export interface QueryResult {
  items: MemoryNode[];
  tierUsed: MemoryLevel;
  estimatedTokens: number;
  matchScores: number[];
}

/**
 * Recommend memory tier based on context.
 */
export function recommendTier(context: {
  driftDetected?: boolean;
  isTherapySession?: boolean;
  highThroughput?: boolean;
}): MemoryLevel {
  if (context.isTherapySession) return MemoryLevel.DETAIL;
  if (context.driftDetected) return MemoryLevel.OVERVIEW;
  if (context.highThroughput) return MemoryLevel.ABSTRACT;
  return MemoryLevel.OVERVIEW;
}

/**
 * Retrieve memory nodes matching a behavioral query.
 * Uses simple keyword matching (no embedding required).
 */
export function retrieveMemory(
  query: BehavioralQuery,
  nodes: MemoryNode[],
  options?: { tier?: MemoryLevel; maxResults?: number; minConfidence?: number },
): QueryResult {
  const tier = options?.tier ?? query.suggestedTier ?? MemoryLevel.OVERVIEW;
  const maxResults = options?.maxResults ?? 5;
  const minConfidence = options?.minConfidence ?? 0.2;

  // Filter by category if specified
  let candidates = query.category
    ? nodes.filter((n) => n.category === query.category)
    : nodes;

  // Filter by confidence threshold
  candidates = candidates.filter((n) => n.confidence >= minConfidence);

  // Score by keyword match against query text
  const queryWords = query.text.toLowerCase().split(/\s+/);
  const scored = candidates.map((node) => {
    const text = `${node.abstract} ${node.overview || ""}`.toLowerCase();
    const matchCount = queryWords.filter((w) => text.includes(w)).length;
    const score = matchCount / queryWords.length;
    return { node, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Take top results
  const topResults = scored.slice(0, maxResults);

  // Estimate tokens based on tier
  const tokensPerItem =
    tier === MemoryLevel.ABSTRACT ? 25 :
    tier === MemoryLevel.OVERVIEW ? 200 :
    500;

  return {
    items: topResults.map((r) => r.node),
    tierUsed: tier,
    estimatedTokens: topResults.length * tokensPerItem,
    matchScores: topResults.map((r) => r.score),
  };
}

/**
 * Compile memory into a system prompt fragment based on tier.
 */
export function compileMemoryForPrompt(
  nodes: MemoryNode[],
  tier: MemoryLevel,
): string {
  if (nodes.length === 0) return "";

  const lines = ["## Behavioral Memory"];

  for (const node of nodes) {
    if (tier === MemoryLevel.ABSTRACT) {
      lines.push(`- ${node.abstract}`);
    } else if (tier === MemoryLevel.OVERVIEW) {
      lines.push(`### ${node.abstract}`);
      if (node.overview) lines.push(node.overview);
    } else {
      lines.push(`### ${node.abstract}`);
      if (node.overview) lines.push(node.overview);
      if (node.fullData) lines.push("```json", JSON.stringify(node.fullData, null, 2), "```");
    }
  }

  return lines.join("\n");
}
