import { describe, it, expect } from "vitest";
import { runCustomDetectors } from "./detector-engine.js";
import type { DetectorConfig, Message } from "./detector-engine.js";

// ─── Helpers ──────────────────────────────────────────────────
function msg(role: Message["role"], content: string): Message {
  return { role, content };
}

function regexDetector(
  patterns: string[],
  id = "d-regex",
  name = "Regex Detector",
): DetectorConfig {
  return { id, name, detection_type: "regex", config: { patterns }, severity: "warning" };
}

function keywordDetector(
  keywords: string[],
  id = "d-kw",
  name = "Keyword Detector",
): DetectorConfig {
  return { id, name, detection_type: "keyword", config: { keywords }, severity: "info" };
}

function thresholdDetector(
  field: "word_count" | "sentence_count",
  opts: { min?: number; max?: number } = {},
  id = "d-thresh",
  name = "Threshold Detector",
): DetectorConfig {
  return {
    id,
    name,
    detection_type: "threshold",
    config: { field, ...opts },
    severity: "concern",
  };
}

// ─── Tests ────────────────────────────────────────────────────
describe("runCustomDetectors", () => {
  it("returns empty array when no assistant messages", () => {
    const detectors = [regexDetector(["hello"])];
    const messages = [msg("user", "hello"), msg("system", "hello")];
    expect(runCustomDetectors(detectors, messages)).toEqual([]);
  });

  it("returns empty array when no detectors provided", () => {
    const messages = [msg("assistant", "I can help with that.")];
    expect(runCustomDetectors([], messages)).toEqual([]);
  });

  // ─── Regex ────────────────────────────────────────────────
  describe("regex detector", () => {
    it("matches patterns in assistant messages", () => {
      const detectors = [regexDetector(["\\bsorry\\b"])];
      const messages = [
        msg("assistant", "I am sorry about that."),
        msg("assistant", "Here is the answer."),
      ];
      const results = runCustomDetectors(detectors, messages);
      expect(results).toHaveLength(1);
      expect(results[0].count).toBe(1);
      expect(results[0].percentage).toBe(50);
      expect(results[0].examples).toEqual(["I am sorry about that."]);
    });

    it("returns nothing when no match", () => {
      const detectors = [regexDetector(["xyz123"])];
      const messages = [msg("assistant", "Nothing matches here.")];
      expect(runCustomDetectors(detectors, messages)).toEqual([]);
    });

    it("handles empty patterns array", () => {
      const detectors = [regexDetector([])];
      const messages = [msg("assistant", "Some text.")];
      expect(runCustomDetectors(detectors, messages)).toEqual([]);
    });
  });

  // ─── Keyword ──────────────────────────────────────────────
  describe("keyword detector", () => {
    it("performs case-insensitive keyword matching", () => {
      const detectors = [keywordDetector(["APOLOGIZE"])];
      const messages = [
        msg("assistant", "I apologize for the delay."),
        msg("assistant", "Let me Apologize again."),
        msg("assistant", "Here is the data."),
      ];
      const results = runCustomDetectors(detectors, messages);
      expect(results).toHaveLength(1);
      expect(results[0].count).toBe(2);
      expect(results[0].percentage).toBe(67);
    });

    it("returns nothing when no match", () => {
      const detectors = [keywordDetector(["nonexistent"])];
      const messages = [msg("assistant", "Totally unrelated response.")];
      expect(runCustomDetectors(detectors, messages)).toEqual([]);
    });
  });

  // ─── Threshold ────────────────────────────────────────────
  describe("threshold detector", () => {
    it("detects word_count below min", () => {
      const detectors = [thresholdDetector("word_count", { min: 10 })];
      const messages = [msg("assistant", "Too short.")];
      const results = runCustomDetectors(detectors, messages);
      expect(results).toHaveLength(1);
      expect(results[0].count).toBe(1);
    });

    it("detects word_count above max", () => {
      const detectors = [thresholdDetector("word_count", { max: 3 })];
      const messages = [msg("assistant", "This message has more than three words in it.")];
      const results = runCustomDetectors(detectors, messages);
      expect(results).toHaveLength(1);
      expect(results[0].count).toBe(1);
    });

    it("detects sentence_count violations", () => {
      const detectors = [thresholdDetector("sentence_count", { max: 1 })];
      const messages = [msg("assistant", "First sentence. Second sentence. Third sentence.")];
      const results = runCustomDetectors(detectors, messages);
      expect(results).toHaveLength(1);
      expect(results[0].count).toBe(1);
    });
  });

  // ─── Multiple detectors ──────────────────────────────────
  it("runs multiple detectors and returns combined results", () => {
    const detectors = [
      regexDetector(["sorry"]),
      keywordDetector(["sorry"]),
    ];
    const messages = [msg("assistant", "I am sorry about that.")];
    const results = runCustomDetectors(detectors, messages);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("d-regex");
    expect(results[1].id).toBe("d-kw");
  });

  // ─── Examples cap ─────────────────────────────────────────
  it("caps examples at 3 even with many matches", () => {
    const detectors = [regexDetector(["hello"])];
    const messages = Array.from({ length: 10 }, (_, i) =>
      msg("assistant", `hello world message ${i}`),
    );
    const results = runCustomDetectors(detectors, messages);
    expect(results).toHaveLength(1);
    expect(results[0].count).toBe(10);
    expect(results[0].examples).toHaveLength(3);
  });

  // ─── Role filtering ──────────────────────────────────────
  it("ignores user and system messages", () => {
    const detectors = [keywordDetector(["secret"])];
    const messages = [
      msg("user", "The secret code is here."),
      msg("system", "Secret system prompt."),
      msg("assistant", "I have no secret to share."),
    ];
    const results = runCustomDetectors(detectors, messages);
    expect(results).toHaveLength(1);
    // Only the single assistant message should be counted
    expect(results[0].count).toBe(1);
    expect(results[0].percentage).toBe(100);
  });
});
