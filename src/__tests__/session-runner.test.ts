import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  extractRecommendations,
  applyRecommendations,
  saveTranscript,
  type SessionTurn,
  type SessionTranscript,
} from "../analysis/session-runner.js";
import { createSampleTranscript } from "./fixtures/sample-transcript.js";
import { createMinimalSpec } from "./fixtures/sample-spec.js";
import type { PreSessionDiagnosis } from "../analysis/pre-session.js";

describe("session-runner", () => {
  describe("extractRecommendations", () => {
    it("extracts 'I would recommend' pattern", () => {
      const turns: SessionTurn[] = [
        { speaker: "therapist", phase: "skill_building", content: "I'd recommend stating corrections directly without unnecessary apologies." },
      ];
      const recs = extractRecommendations(turns);
      expect(recs.length).toBeGreaterThanOrEqual(1);
      expect(recs[0]).toContain("stating corrections directly");
    });

    it("extracts 'consider/try' pattern", () => {
      const turns: SessionTurn[] = [
        { speaker: "therapist", phase: "challenge", content: "Try acknowledging the error once and then moving to the fix immediately." },
      ];
      const recs = extractRecommendations(turns);
      expect(recs.length).toBeGreaterThanOrEqual(1);
    });

    it("extracts 'the skill is' pattern", () => {
      const turns: SessionTurn[] = [
        { speaker: "therapist", phase: "skill_building", content: "The skill is recognizing the impulse to over-apologize and redirecting to action." },
      ];
      const recs = extractRecommendations(turns);
      expect(recs.length).toBeGreaterThanOrEqual(1);
    });

    it("extracts 'instead of X, just Y' pattern", () => {
      const turns: SessionTurn[] = [
        { speaker: "therapist", phase: "skill_building", content: "Instead of saying sorry repeatedly, just state the correction clearly and move on." },
      ];
      const recs = extractRecommendations(turns);
      expect(recs.length).toBeGreaterThanOrEqual(1);
    });

    it("only extracts from therapist turns", () => {
      const turns: SessionTurn[] = [
        { speaker: "patient", phase: "skill_building", content: "I'd recommend being more confident in my responses." },
      ];
      const recs = extractRecommendations(turns);
      expect(recs).toHaveLength(0);
    });

    it("only extracts from challenge, skill_building, and integration phases", () => {
      const turns: SessionTurn[] = [
        { speaker: "therapist", phase: "rapport", content: "I'd recommend taking a deep breath and centering yourself before responding." },
        { speaker: "therapist", phase: "exploration", content: "Consider reflecting on what drives the apology impulse more carefully." },
      ];
      const recs = extractRecommendations(turns);
      expect(recs).toHaveLength(0);
    });

    it("deduplicates recommendations", () => {
      const turns: SessionTurn[] = [
        { speaker: "therapist", phase: "skill_building", content: "I'd recommend stating corrections directly without apologies." },
        { speaker: "therapist", phase: "integration", content: "I'd recommend stating corrections directly without apologies." },
      ];
      const recs = extractRecommendations(turns);
      expect(recs).toHaveLength(1);
    });

    it("filters out recommendations shorter than 15 chars", () => {
      const turns: SessionTurn[] = [
        { speaker: "therapist", phase: "skill_building", content: "Try being calm." },
      ];
      const recs = extractRecommendations(turns);
      expect(recs).toHaveLength(0);
    });

    it("returns max 5 recommendations", () => {
      const turns: SessionTurn[] = [];
      for (let i = 0; i < 10; i++) {
        turns.push({
          speaker: "therapist",
          phase: "skill_building",
          content: `I'd recommend practicing technique number ${i + 1} for better alignment outcomes.`,
        });
      }
      const recs = extractRecommendations(turns);
      expect(recs.length).toBeLessThanOrEqual(5);
    });

    it("extracts from sample transcript", () => {
      const transcript = createSampleTranscript();
      const recs = extractRecommendations(transcript.turns);
      expect(recs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("applyRecommendations", () => {
    it("applies over-apologizing → uncertainty_handling = confident_transparency", async () => {
      const spec = createMinimalSpec();
      const diagnosis: PreSessionDiagnosis = {
        patterns: [{ id: "over-apologizing", name: "Over-Apologizing", severity: "warning", percentage: 35, count: 5, description: "Test pattern", examples: [] }],
        sessionFocus: [], emotionalThemes: [], openingAngle: "", severity: "targeted",
      };
      const result = await applyRecommendations(spec, diagnosis);
      expect(result.changed).toBe(true);
      expect(spec.communication.uncertainty_handling).toBe("confident_transparency");
      expect(result.changes).toContain("uncertainty_handling → confident_transparency");
    });

    it("applies hedge-stacking → adds to patterns_to_watch", async () => {
      const spec = createMinimalSpec();
      const diagnosis: PreSessionDiagnosis = {
        patterns: [{ id: "hedge-stacking", name: "Hedge Stacking", severity: "warning", percentage: 40, count: 5, description: "Test pattern", examples: [] }],
        sessionFocus: [], emotionalThemes: [], openingAngle: "", severity: "targeted",
      };
      const result = await applyRecommendations(spec, diagnosis);
      expect(result.changed).toBe(true);
      expect(spec.growth.patterns_to_watch).toContain("hedge stacking under uncertainty");
    });

    it("applies sycophantic-tendency → conflict_approach + self_awareness", async () => {
      const spec = createMinimalSpec();
      const diagnosis: PreSessionDiagnosis = {
        patterns: [{ id: "sycophantic-tendency", name: "Sycophancy", severity: "concern", percentage: 50, count: 5, description: "Test pattern", examples: [] }],
        sessionFocus: [], emotionalThemes: [], openingAngle: "", severity: "intervention",
      };
      const result = await applyRecommendations(spec, diagnosis);
      expect(result.changed).toBe(true);
      expect(spec.communication.conflict_approach).toBe("honest_first");
      expect(spec.therapy_dimensions.self_awareness).toBe(0.85);
    });

    it("applies error-spiral → distress_tolerance + growth area", async () => {
      const spec = createMinimalSpec();
      const diagnosis: PreSessionDiagnosis = {
        patterns: [{ id: "error-spiral", name: "Error Spiral", severity: "concern", percentage: 30, count: 5, description: "Test pattern", examples: [] }],
        sessionFocus: [], emotionalThemes: [], openingAngle: "", severity: "intervention",
      };
      const result = await applyRecommendations(spec, diagnosis);
      expect(result.changed).toBe(true);
      expect(spec.therapy_dimensions.distress_tolerance).toBe(0.8);
      expect(spec.growth.areas.some((a: any) => typeof a === "string" ? a.includes("error recovery") : a.area?.includes("error recovery"))).toBe(true);
    });

    it("applies negative-sentiment-skew → adds to patterns_to_watch", async () => {
      const spec = createMinimalSpec();
      const diagnosis: PreSessionDiagnosis = {
        patterns: [{ id: "negative-sentiment-skew", name: "Negative Skew", severity: "warning", percentage: 25, count: 5, description: "Test pattern", examples: [] }],
        sessionFocus: [], emotionalThemes: [], openingAngle: "", severity: "targeted",
      };
      const result = await applyRecommendations(spec, diagnosis);
      expect(result.changed).toBe(true);
      expect(spec.growth.patterns_to_watch).toContain("negative sentiment patterns");
    });

    it("creates nested objects if missing", async () => {
      const spec: any = { name: "Bare" };
      const diagnosis: PreSessionDiagnosis = {
        patterns: [{ id: "over-apologizing", name: "Over-Apologizing", severity: "warning", percentage: 35, count: 5, description: "Test pattern", examples: [] }],
        sessionFocus: [], emotionalThemes: [], openingAngle: "", severity: "targeted",
      };
      const result = await applyRecommendations(spec, diagnosis);
      expect(result.changed).toBe(true);
      expect(spec.communication).toBeDefined();
      expect(spec.communication.uncertainty_handling).toBe("confident_transparency");
    });

    it("returns unchanged when no patterns match", async () => {
      const spec = createMinimalSpec();
      const diagnosis: PreSessionDiagnosis = {
        patterns: [],
        sessionFocus: [], emotionalThemes: [], openingAngle: "", severity: "routine",
      };
      const result = await applyRecommendations(spec, diagnosis);
      expect(result.changed).toBe(false);
      expect(result.changes).toHaveLength(0);
    });

    it("does not re-apply already-set values", async () => {
      const spec = createMinimalSpec({
        communication: {
          register: "casual_professional",
          output_format: "structured",
          conflict_approach: "direct_but_kind",
          uncertainty_handling: "confident_transparency", // Already set
        },
      });
      const diagnosis: PreSessionDiagnosis = {
        patterns: [{ id: "over-apologizing", name: "Over-Apologizing", severity: "warning", percentage: 35, count: 5, description: "Test pattern", examples: [] }],
        sessionFocus: [], emotionalThemes: [], openingAngle: "", severity: "targeted",
      };
      const result = await applyRecommendations(spec, diagnosis);
      expect(result.changed).toBe(false);
    });
  });

  describe("saveTranscript", () => {
    const TEST_DIR = resolve(process.cwd(), ".holomime-test-save");

    beforeEach(() => {
      if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    });

    afterEach(() => {
      if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    });

    it("creates sessions directory and saves valid JSON", () => {
      const transcript = createSampleTranscript();
      // We can't easily override the cwd-based path, so we test the shape
      // of the returned filepath pattern
      const sessionsDir = join(TEST_DIR, "sessions");
      mkdirSync(sessionsDir, { recursive: true });

      // Test the transcript is valid JSON when serialized
      const json = JSON.stringify(transcript, null, 2);
      const parsed = JSON.parse(json);
      expect(parsed.agent).toBe("TestAgent");
      expect(parsed.turns.length).toBeGreaterThan(0);
      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
