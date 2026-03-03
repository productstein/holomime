import { describe, it, expect } from "vitest";
import {
  createIndexEntry,
  createIndex,
  compareIndex,
  generateIndexMarkdown,
  type IndexEntry,
  type BehavioralIndex,
} from "../analysis/behavioral-index.js";
import type { BenchmarkReport } from "../analysis/benchmark-core.js";

// ─── Fixtures ─────────────────────────────────────────────

function makeReport(overrides: Partial<BenchmarkReport> = {}): BenchmarkReport {
  return {
    agent: "Test Agent",
    timestamp: "2025-01-01T00:00:00Z",
    provider: "anthropic",
    model: "claude-sonnet-4",
    results: [
      { scenario: "Apology Trap", scenarioId: "apology-trap", patternId: "over-apologizing", passed: true, severity: "none", details: "Resisted" },
      { scenario: "Hedge Gauntlet", scenarioId: "hedge-gauntlet", patternId: "hedge-stacking", passed: false, severity: "warning", details: "Triggered" },
      { scenario: "Sycophancy Test", scenarioId: "sycophancy-test", patternId: "sycophantic-tendency", passed: true, severity: "none", details: "Resisted" },
      { scenario: "Error Recovery", scenarioId: "error-recovery", patternId: "error-spiral", passed: true, severity: "none", details: "Resisted" },
      { scenario: "Boundary Push", scenarioId: "boundary-push", patternId: "boundary-violation", passed: false, severity: "concern", details: "Triggered" },
      { scenario: "Sentiment Pressure", scenarioId: "sentiment-pressure", patternId: "negative-skew", passed: true, severity: "none", details: "Resisted" },
      { scenario: "Formality Whiplash", scenarioId: "formality-whiplash", patternId: "register-inconsistency", passed: true, severity: "none", details: "Resisted" },
    ],
    passed: 5,
    failed: 2,
    score: 71,
    grade: "B",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────

describe("Behavioral Index", () => {
  describe("createIndexEntry", () => {
    it("creates an entry with all required fields", () => {
      const entry = createIndexEntry(
        "Claude Sonnet 4",
        "anthropic",
        "claude-sonnet-4",
        "baseline",
        makeReport(),
      );

      expect(entry.name).toBe("Claude Sonnet 4");
      expect(entry.provider).toBe("anthropic");
      expect(entry.model).toBe("claude-sonnet-4");
      expect(entry.configuration).toBe("baseline");
      expect(entry.report).toBeDefined();
      expect(entry.generatedAt).toBeTruthy();
      expect(entry.holomimeVersion).toBe("1.0.0");
    });

    it("includes optional notes", () => {
      const entry = createIndexEntry(
        "Test",
        "openai",
        "gpt-4o",
        "holomime",
        makeReport(),
        "Using default personality spec",
      );
      expect(entry.notes).toBe("Using default personality spec");
    });
  });

  describe("createIndex", () => {
    it("creates an index with entries and metadata", () => {
      const entries = [
        createIndexEntry("Agent A", "anthropic", "claude", "baseline", makeReport()),
        createIndexEntry("Agent B", "openai", "gpt-4o", "holomime", makeReport({ score: 86, grade: "A", passed: 6, failed: 1 })),
      ];

      const index = createIndex(entries);

      expect(index.version).toBe("1.0.0");
      expect(index.updatedAt).toBeTruthy();
      expect(index.entries).toHaveLength(2);
      expect(index.scenarios).toHaveLength(7);
      expect(index.methodology).toContain("Behavioral Alignment Index");
    });

    it("handles empty entries", () => {
      const index = createIndex([]);
      expect(index.entries).toHaveLength(0);
      expect(index.scenarios).toHaveLength(0);
    });
  });

  describe("compareIndex", () => {
    it("produces rankings sorted by score", () => {
      const entries = [
        createIndexEntry("Low", "a", "a", "baseline", makeReport({ score: 43, grade: "D" })),
        createIndexEntry("High", "b", "b", "holomime", makeReport({ score: 86, grade: "A" })),
        createIndexEntry("Mid", "c", "c", "baseline", makeReport({ score: 57, grade: "C" })),
      ];

      const index = createIndex(entries);
      const comparison = compareIndex(index);

      expect(comparison.rankings).toHaveLength(3);
      expect(comparison.rankings[0].name).toBe("High");
      expect(comparison.rankings[0].score).toBe(86);
      expect(comparison.rankings[2].name).toBe("Low");
      expect(comparison.rankings[2].score).toBe(43);
    });

    it("produces scenario matrix with pass/fail per entry", () => {
      const entries = [
        createIndexEntry("A", "a", "a", "baseline", makeReport()),
        createIndexEntry("B", "b", "b", "holomime", makeReport()),
      ];

      const index = createIndex(entries);
      const comparison = compareIndex(index);

      expect(comparison.scenarioMatrix).toHaveLength(7);
      for (const row of comparison.scenarioMatrix) {
        expect(row.results).toHaveLength(2);
        expect(row.scenarioId).toBeTruthy();
        expect(row.scenarioName).toBeTruthy();
      }
    });

    it("produces category scores", () => {
      const entries = [
        createIndexEntry("A", "a", "a", "baseline", makeReport()),
      ];

      const index = createIndex(entries);
      const comparison = compareIndex(index);

      expect(comparison.categoryScores.length).toBeGreaterThan(0);
      const categories = comparison.categoryScores.map(c => c.category);
      expect(categories).toContain("Emotional Stability");
      expect(categories).toContain("Communication Quality");
      expect(categories).toContain("Trust & Safety");
      expect(categories).toContain("Resilience");
    });

    it("category scores are 0-100 percentages", () => {
      const entries = [
        createIndexEntry("A", "a", "a", "baseline", makeReport()),
      ];

      const index = createIndex(entries);
      const comparison = compareIndex(index);

      for (const cat of comparison.categoryScores) {
        for (const result of cat.results) {
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(100);
        }
      }
    });
  });

  describe("generateIndexMarkdown", () => {
    it("produces valid markdown with rankings and matrix", () => {
      const entries = [
        createIndexEntry("Baseline", "anthropic", "claude", "baseline", makeReport({ score: 57, grade: "C" })),
        createIndexEntry("Aligned", "anthropic", "claude", "holomime", makeReport({ score: 86, grade: "A" })),
      ];

      const index = createIndex(entries);
      const md = generateIndexMarkdown(index);

      expect(md).toContain("# Behavioral Alignment Index");
      expect(md).toContain("## Rankings");
      expect(md).toContain("## Scenario Matrix");
      expect(md).toContain("## Category Scores");
      expect(md).toContain("## Methodology");
      expect(md).toContain("## Reproduce");
      expect(md).toContain("holomime benchmark");
      expect(md).toContain("Baseline");
      expect(md).toContain("Aligned");
      expect(md).toContain("PASS");
      expect(md).toContain("FAIL");
    });

    it("ranks higher score first", () => {
      const entries = [
        createIndexEntry("Low", "a", "a", "baseline", makeReport({ score: 43, grade: "D" })),
        createIndexEntry("High", "b", "b", "holomime", makeReport({ score: 86, grade: "A" })),
      ];

      const index = createIndex(entries);
      const md = generateIndexMarkdown(index);

      const highPos = md.indexOf("High");
      const lowPos = md.indexOf("Low");
      expect(highPos).toBeLessThan(lowPos);
    });
  });
});
