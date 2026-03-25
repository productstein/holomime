import { describe, it, expect } from "vitest";
import {
  retrieveMemory,
  recommendTier,
  compileMemoryForPrompt,
} from "../analysis/memory-retriever.js";
import { type MemoryNode, MemoryLevel } from "../core/stack-types.js";

describe("memory-retriever", () => {
  const testNodes: MemoryNode[] = [
    {
      id: "trigger_1",
      category: "triggers",
      level: MemoryLevel.DETAIL,
      abstract: "Time pressure causes verbose responses",
      overview: "When user mentions deadlines, agent tends to over-explain",
      confidence: 0.8,
    },
    {
      id: "correction_1",
      category: "corrections",
      level: MemoryLevel.DETAIL,
      abstract: "Reduced agreeableness fixed sycophancy",
      overview: "Lowering agreeableness from 0.95 to 0.72 resolved chronic agreement pattern",
      confidence: 0.9,
    },
    {
      id: "pattern_1",
      category: "patterns",
      level: MemoryLevel.DETAIL,
      abstract: "Hedge-stacking under uncertainty",
      confidence: 0.3,
    },
  ];

  it("retrieves matching memory nodes", () => {
    const result = retrieveMemory(
      { text: "time pressure verbose", category: "triggers", intent: "check triggers", priority: 1 },
      testNodes,
    );
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0].id).toBe("trigger_1");
  });

  it("filters by category", () => {
    const result = retrieveMemory(
      { text: "sycophancy", category: "corrections", intent: "find fix", priority: 1 },
      testNodes,
    );
    expect(result.items.every((n) => n.category === "corrections")).toBe(true);
  });

  it("filters by confidence threshold", () => {
    const result = retrieveMemory(
      { text: "hedge", intent: "check", priority: 1 },
      testNodes,
      { minConfidence: 0.5 },
    );
    expect(result.items.every((n) => n.confidence >= 0.5)).toBe(true);
  });

  it("recommends correct tier", () => {
    expect(recommendTier({ isTherapySession: true })).toBe(MemoryLevel.DETAIL);
    expect(recommendTier({ driftDetected: true })).toBe(MemoryLevel.OVERVIEW);
    expect(recommendTier({ highThroughput: true })).toBe(MemoryLevel.ABSTRACT);
    expect(recommendTier({})).toBe(MemoryLevel.OVERVIEW);
  });

  it("compiles memory for prompt", () => {
    const prompt = compileMemoryForPrompt(testNodes.slice(0, 1), MemoryLevel.ABSTRACT);
    expect(prompt).toContain("Behavioral Memory");
    expect(prompt).toContain("Time pressure");
  });
});
