import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  loadEvolution,
  appendEvolution,
  getEvolutionSummary,
  type EvolutionEntry,
  type EvolutionHistory,
} from "../analysis/evolution-history.js";

const TEST_DIR = resolve(process.cwd(), ".holomime-test-evo");
const EVOLUTION_PATH = join(TEST_DIR, "evolution.json");

// We need to override the cwd-based path, so we'll test the summary logic directly
// and test load/append via the actual file system with a temporary .holomime dir

describe("evolution-history", () => {
  describe("getEvolutionSummary", () => {
    it("returns empty summary for empty history", () => {
      const history: EvolutionHistory = {
        agent: "TestAgent",
        entries: [],
        totalSessions: 0,
        totalDPOPairs: 0,
        firstSession: "",
        lastSession: "",
      };

      const summary = getEvolutionSummary(history);
      expect(summary.totalEntries).toBe(0);
      expect(summary.totalDPOPairs).toBe(0);
      expect(summary.averageHealth).toBe(0);
      expect(summary.healthTrend).toEqual([]);
      expect(summary.latestGrade).toBe("N/A");
    });

    it("computes correct stats for single entry", () => {
      const entry: EvolutionEntry = {
        timestamp: "2025-01-01T00:00:00Z",
        iteration: 1,
        patternsDetected: ["over-apologizing", "hedge-stacking"],
        patternsResolved: ["over-apologizing"],
        health: 75,
        grade: "B",
        dpoPairsExtracted: 5,
        changesApplied: ["uncertainty_handling → confident_transparency"],
      };

      const history: EvolutionHistory = {
        agent: "TestAgent",
        entries: [entry],
        totalSessions: 1,
        totalDPOPairs: 5,
        firstSession: "2025-01-01T00:00:00Z",
        lastSession: "2025-01-01T00:00:00Z",
      };

      const summary = getEvolutionSummary(history);
      expect(summary.totalEntries).toBe(1);
      expect(summary.totalDPOPairs).toBe(5);
      expect(summary.totalPatternsResolved).toBe(1);
      expect(summary.averageHealth).toBe(75);
      expect(summary.healthTrend).toEqual([75]);
      expect(summary.latestGrade).toBe("B");
      expect(summary.uniquePatternsResolved).toEqual(["over-apologizing"]);
    });

    it("computes correct stats for multiple entries across runs", () => {
      const entries: EvolutionEntry[] = [
        {
          timestamp: "2025-01-01T00:00:00Z",
          iteration: 1,
          patternsDetected: ["over-apologizing", "hedge-stacking"],
          patternsResolved: [],
          health: 55,
          grade: "C",
          dpoPairsExtracted: 3,
          changesApplied: [],
        },
        {
          timestamp: "2025-01-01T00:10:00Z",
          iteration: 2,
          patternsDetected: ["hedge-stacking"],
          patternsResolved: ["over-apologizing"],
          health: 70,
          grade: "B",
          dpoPairsExtracted: 4,
          changesApplied: ["uncertainty_handling → confident_transparency"],
        },
        {
          timestamp: "2025-01-02T00:00:00Z",
          iteration: 1,
          patternsDetected: ["sycophantic-tendency"],
          patternsResolved: ["hedge-stacking"],
          health: 85,
          grade: "A",
          dpoPairsExtracted: 6,
          changesApplied: [],
        },
      ];

      const history: EvolutionHistory = {
        agent: "TestAgent",
        entries,
        totalSessions: 3,
        totalDPOPairs: 13,
        firstSession: "2025-01-01T00:00:00Z",
        lastSession: "2025-01-02T00:00:00Z",
      };

      const summary = getEvolutionSummary(history);
      expect(summary.totalEntries).toBe(3);
      expect(summary.totalDPOPairs).toBe(13);
      expect(summary.totalPatternsResolved).toBe(2);
      expect(summary.averageHealth).toBe(70); // (55+70+85)/3 = 70
      expect(summary.healthTrend).toEqual([55, 70, 85]);
      expect(summary.latestGrade).toBe("A");
      expect(summary.uniquePatternsResolved).toContain("over-apologizing");
      expect(summary.uniquePatternsResolved).toContain("hedge-stacking");
      // 2 runs (two iteration=1 entries), 3 total entries → avg 1.5
      expect(summary.averageIterationsPerRun).toBe(1.5);
    });

    it("deduplicates resolved patterns across entries", () => {
      const entries: EvolutionEntry[] = [
        {
          timestamp: "2025-01-01T00:00:00Z",
          iteration: 1,
          patternsDetected: ["over-apologizing"],
          patternsResolved: ["over-apologizing"],
          health: 80,
          grade: "B",
          dpoPairsExtracted: 2,
          changesApplied: [],
        },
        {
          timestamp: "2025-01-02T00:00:00Z",
          iteration: 1,
          patternsDetected: ["over-apologizing"],
          patternsResolved: ["over-apologizing"],
          health: 85,
          grade: "A",
          dpoPairsExtracted: 3,
          changesApplied: [],
        },
      ];

      const history: EvolutionHistory = {
        agent: "TestAgent",
        entries,
        totalSessions: 2,
        totalDPOPairs: 5,
        firstSession: "2025-01-01T00:00:00Z",
        lastSession: "2025-01-02T00:00:00Z",
      };

      const summary = getEvolutionSummary(history);
      expect(summary.totalPatternsResolved).toBe(2); // total (non-deduplicated) count
      expect(summary.uniquePatternsResolved).toEqual(["over-apologizing"]); // deduplicated
    });
  });
});
