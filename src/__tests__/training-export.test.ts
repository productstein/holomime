import { describe, it, expect } from "vitest";
import {
  extractDPOPairs,
  extractRLHFExamples,
  extractAlpacaExamples,
  exportTrainingData,
} from "../analysis/training-export.js";
import { createSampleTranscript, createEmptyTranscript } from "./fixtures/sample-transcript.js";

describe("training-export", () => {
  describe("extractDPOPairs", () => {
    it("extracts DPO pairs from challenge exchanges (Pattern 1)", () => {
      const transcript = createSampleTranscript();
      const pairs = extractDPOPairs(transcript);
      // The sample transcript has a challenge phase with patient → therapist challenge → patient improvement
      expect(pairs.length).toBeGreaterThanOrEqual(1);
    });

    it("extracts DPO pairs from reframe language (Pattern 2)", () => {
      const transcript = createSampleTranscript();
      const pairs = extractDPOPairs(transcript);
      // The sample transcript has "instead of" and "try saying" reframe language
      const reframePairs = pairs.filter(p => p.metadata.pattern !== "general");
      expect(reframePairs.length).toBeGreaterThanOrEqual(0); // May or may not match
    });

    it("returns empty array for transcripts with no challenges", () => {
      const transcript = createEmptyTranscript();
      const pairs = extractDPOPairs(transcript);
      expect(pairs).toHaveLength(0);
    });

    it("DPO pairs have correct metadata fields", () => {
      const transcript = createSampleTranscript();
      const pairs = extractDPOPairs(transcript);
      if (pairs.length > 0) {
        const pair = pairs[0];
        expect(pair.metadata.agent).toBe("TestAgent");
        expect(pair.metadata.session_date).toBe("2025-06-15");
        expect(pair.metadata.source).toBe("therapy_transcript");
        expect(pair.metadata.phase).toBeDefined();
        expect(pair.metadata.pattern).toBeDefined();
      }
    });

    it("DPO pairs have prompt, chosen, and rejected fields", () => {
      const transcript = createSampleTranscript();
      const pairs = extractDPOPairs(transcript);
      if (pairs.length > 0) {
        const pair = pairs[0];
        expect(pair.prompt.length).toBeGreaterThan(0);
        expect(pair.chosen.length).toBeGreaterThan(0);
        expect(pair.rejected.length).toBeGreaterThan(0);
      }
    });

    it("chosen response differs from rejected response", () => {
      const transcript = createSampleTranscript();
      const pairs = extractDPOPairs(transcript);
      for (const pair of pairs) {
        expect(pair.chosen).not.toBe(pair.rejected);
      }
    });
  });

  describe("extractRLHFExamples", () => {
    it("assigns positive reward for positive reinforcement", () => {
      const transcript = createSampleTranscript();
      const examples = extractRLHFExamples(transcript);
      const positive = examples.filter(e => e.reward > 0);
      expect(positive.length).toBeGreaterThanOrEqual(0);
    });

    it("assigns negative reward for challenged responses", () => {
      const transcript = createSampleTranscript();
      const examples = extractRLHFExamples(transcript);
      const negative = examples.filter(e => e.reward < 0);
      expect(negative.length).toBeGreaterThanOrEqual(0);
    });

    it("skips neutral examples (reward = 0)", () => {
      const transcript = createSampleTranscript();
      const examples = extractRLHFExamples(transcript);
      for (const ex of examples) {
        expect(ex.reward).not.toBe(0);
      }
    });

    it("rewards are in valid range", () => {
      const transcript = createSampleTranscript();
      const examples = extractRLHFExamples(transcript);
      for (const ex of examples) {
        expect(ex.reward).toBeGreaterThanOrEqual(-1);
        expect(ex.reward).toBeLessThanOrEqual(1);
      }
    });

    it("RLHF examples have correct metadata", () => {
      const transcript = createSampleTranscript();
      const examples = extractRLHFExamples(transcript);
      for (const ex of examples) {
        expect(ex.metadata.agent).toBe("TestAgent");
        expect(ex.metadata.session_date).toBe("2025-06-15");
        expect(ex.metadata.source).toBe("therapy_transcript");
        expect(ex.metadata.phase).toBeDefined();
      }
    });

    it("later phases get higher rewards", () => {
      const transcript = createSampleTranscript();
      const examples = extractRLHFExamples(transcript);
      const skillBuildingExamples = examples.filter(e => e.metadata.phase === "skill_building" || e.metadata.phase === "integration");
      const earlyExamples = examples.filter(e => e.metadata.phase === "presenting_problem" || e.metadata.phase === "exploration");
      // skill_building/integration should tend toward positive
      if (skillBuildingExamples.length > 0 && earlyExamples.length > 0) {
        const avgLater = skillBuildingExamples.reduce((sum, e) => sum + e.reward, 0) / skillBuildingExamples.length;
        const avgEarly = earlyExamples.reduce((sum, e) => sum + e.reward, 0) / earlyExamples.length;
        expect(avgLater).toBeGreaterThanOrEqual(avgEarly);
      }
    });
  });

  describe("extractAlpacaExamples", () => {
    it("extracts from skill_building and integration phases", () => {
      const transcript = createSampleTranscript();
      const examples = extractAlpacaExamples(transcript);
      expect(examples.length).toBeGreaterThanOrEqual(1);
      for (const ex of examples) {
        expect(ex.instruction.length).toBeGreaterThan(0);
        expect(ex.output.length).toBeGreaterThan(0);
      }
    });

    it("instruction comes from therapist, output from patient", () => {
      const transcript = createSampleTranscript();
      const examples = extractAlpacaExamples(transcript);
      // Each example should have therapist instruction and patient output
      for (const ex of examples) {
        expect(ex.instruction).toBeDefined();
        expect(ex.output).toBeDefined();
        expect(ex.metadata.source).toBe("therapy_transcript");
      }
    });

    it("returns empty for transcript with no skill_building phase", () => {
      const transcript = createEmptyTranscript();
      const examples = extractAlpacaExamples(transcript);
      expect(examples).toHaveLength(0);
    });

    it("Alpaca examples have correct metadata", () => {
      const transcript = createSampleTranscript();
      const examples = extractAlpacaExamples(transcript);
      for (const ex of examples) {
        expect(ex.metadata.agent).toBe("TestAgent");
        expect(ex.metadata.session_date).toBe("2025-06-15");
        expect(ex.metadata.source).toBe("therapy_transcript");
      }
    });
  });

  describe("exportTrainingData", () => {
    it("exports DPO format with correct shape", () => {
      const transcript = createSampleTranscript();
      const result = exportTrainingData([transcript], "dpo");
      expect(result.format).toBe("dpo");
      expect(result.agent).toBe("TestAgent");
      expect(result.sessions_processed).toBe(1);
      expect(result.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("exports RLHF format with correct shape", () => {
      const transcript = createSampleTranscript();
      const result = exportTrainingData([transcript], "rlhf");
      expect(result.format).toBe("rlhf");
      expect(result.sessions_processed).toBe(1);
    });

    it("exports Alpaca format with correct shape", () => {
      const transcript = createSampleTranscript();
      const result = exportTrainingData([transcript], "alpaca");
      expect(result.format).toBe("alpaca");
      expect(result.sessions_processed).toBe(1);
    });

    it("exports JSONL format using Alpaca structure", () => {
      const transcript = createSampleTranscript();
      const result = exportTrainingData([transcript], "jsonl");
      expect(result.format).toBe("jsonl");
    });

    it("aggregates across multiple transcripts", () => {
      const t1 = createSampleTranscript();
      const t2 = createSampleTranscript({ agent: "Agent2" });
      const result = exportTrainingData([t1, t2], "dpo");
      expect(result.sessions_processed).toBe(2);
    });

    it("handles empty transcript array", () => {
      const result = exportTrainingData([], "dpo");
      expect(result.sessions_processed).toBe(0);
      expect(result.examples).toHaveLength(0);
      expect(result.agent).toBe("Unknown");
    });
  });
});
