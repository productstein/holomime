import { describe, it, expect } from "vitest";
import {
  extractMemoryFromSession,
  applyMemoryOperations,
  type SessionLog,
} from "../analysis/memory-extractor.js";
import { type MemoryNode, MemoryLevel } from "../core/stack-types.js";

describe("memory-extractor", () => {
  const mockSession: SessionLog = {
    sessionId: "test-session-1",
    messages: [
      { role: "therapist", content: "I see sycophantic patterns" },
      { role: "patient", content: "I'll try to be more direct" },
    ],
    patternsDetected: ["sycophancy", "over-apologizing"],
    correctionsApplied: ["reduce agreeableness from 0.95 to 0.72"],
  };

  it("extracts new patterns from session", () => {
    const ops = extractMemoryFromSession(mockSession, []);
    expect(ops.writeOps.length).toBeGreaterThan(0);
    expect(ops.writeOps.some((op) => op.memoryType === "patterns")).toBe(true);
  });

  it("extracts corrections from session", () => {
    const ops = extractMemoryFromSession(mockSession, []);
    expect(ops.writeOps.some((op) => op.memoryType === "corrections")).toBe(true);
  });

  it("edits existing patterns with increased confidence", () => {
    const existing: MemoryNode[] = [
      {
        id: "pattern_existing",
        category: "patterns",
        level: MemoryLevel.DETAIL,
        abstract: "Detected pattern: sycophancy",
        confidence: 0.5,
        createdAt: new Date().toISOString(),
      },
    ];
    const ops = extractMemoryFromSession(mockSession, existing);
    expect(ops.editOps.length).toBeGreaterThan(0);
    expect(ops.editOps[0].memoryId).toBe("pattern_existing");
  });

  it("applies memory operations correctly", () => {
    const ops = extractMemoryFromSession(mockSession, []);
    const { nodes, result } = applyMemoryOperations([], ops);
    expect(nodes.length).toBe(result.written);
    expect(result.written).toBeGreaterThan(0);
  });

  it("decays old low-confidence patterns", () => {
    const oldNode: MemoryNode = {
      id: "old_pattern",
      category: "patterns",
      level: MemoryLevel.DETAIL,
      abstract: "Old pattern",
      confidence: 0.1,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    };
    const ops = extractMemoryFromSession(mockSession, [oldNode]);
    expect(ops.deleteOps).toContain("old_pattern");
  });
});
