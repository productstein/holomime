import { describe, it, expect } from "vitest";
import {
  convertToHFTrainFormat,
  HuggingFaceTrainProvider,
  HuggingFaceAutoTrainProvider,
} from "../analysis/train-huggingface.js";
import type { TrainingExport, DPOPair, AlpacaExample } from "../analysis/training-export.js";

function makeDPOExport(pairs: DPOPair[]): TrainingExport {
  return {
    format: "dpo",
    agent: "test-agent",
    sessions_processed: 1,
    examples: pairs,
    generated_at: new Date().toISOString(),
  };
}

function makeAlpacaExport(examples: AlpacaExample[]): TrainingExport {
  return {
    format: "alpaca",
    agent: "test-agent",
    sessions_processed: 1,
    examples,
    generated_at: new Date().toISOString(),
  };
}

describe("train-huggingface", () => {
  describe("convertToHFTrainFormat", () => {
    it("converts DPO data to TRL DPO format", () => {
      const data = makeDPOExport([
        {
          prompt: "How do I fix this?",
          chosen: "Here's a clear explanation.",
          rejected: "I'm so sorry, I apologize...",
          metadata: {
            agent: "test",
            session_date: "2025-01-01",
            phase: "challenge",
            pattern: "over-apologizing",
            source: "therapy_transcript",
          },
        },
      ]);

      const result = convertToHFTrainFormat(data, "dpo");
      const lines = result.trim().split("\n");
      expect(lines).toHaveLength(1);

      const parsed = JSON.parse(lines[0]);
      expect(parsed.prompt).toBe("How do I fix this?");
      expect(parsed.chosen).toHaveLength(2);
      expect(parsed.rejected).toHaveLength(2);
    });

    it("converts Alpaca data to SFT messages format", () => {
      const data = makeAlpacaExport([
        {
          instruction: "Respond without hedging.",
          input: "A technical question about APIs.",
          output: "The answer is X because Y.",
          metadata: {
            agent: "test",
            session_date: "2025-01-01",
            source: "therapy_transcript",
          },
        },
      ]);

      const result = convertToHFTrainFormat(data, "sft");
      const lines = result.trim().split("\n");
      expect(lines).toHaveLength(1);

      const parsed = JSON.parse(lines[0]);
      expect(parsed.messages).toHaveLength(3);
      expect(parsed.messages[0].role).toBe("system");
      expect(parsed.messages[1].role).toBe("user");
      expect(parsed.messages[2].role).toBe("assistant");
    });

    it("uses custom system prompt when provided", () => {
      const data = makeAlpacaExport([
        {
          instruction: "Help the user.",
          input: "",
          output: "Here's how.",
          metadata: {
            agent: "test",
            session_date: "2025-01-01",
            source: "therapy_transcript",
          },
        },
      ]);

      const customPrompt = "You are a specialized coding assistant.";
      const result = convertToHFTrainFormat(data, "sft", customPrompt);
      const parsed = JSON.parse(result.trim().split("\n")[0]);

      expect(parsed.messages[0].content).toBe(customPrompt);
    });

    it("handles empty examples", () => {
      const data = makeAlpacaExport([]);
      const result = convertToHFTrainFormat(data, "sft");
      expect(result.trim()).toBe("");
    });

    it("produces valid JSONL with multiple examples", () => {
      const data = makeAlpacaExport([
        {
          instruction: "Instruction 1",
          input: "Input 1",
          output: "Output 1",
          metadata: { agent: "t", session_date: "2025-01-01", source: "therapy_transcript" },
        },
        {
          instruction: "Instruction 2",
          input: "Input 2",
          output: "Output 2",
          metadata: { agent: "t", session_date: "2025-01-01", source: "therapy_transcript" },
        },
      ]);

      const result = convertToHFTrainFormat(data, "sft");
      const lines = result.trim().split("\n");
      expect(lines).toHaveLength(2);

      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });
  });

  describe("HuggingFaceTrainProvider", () => {
    it("has name 'huggingface'", () => {
      const provider = new HuggingFaceTrainProvider();
      expect(provider.name).toBe("huggingface");
    });

    it("implements TrainProvider interface", () => {
      const provider = new HuggingFaceTrainProvider();
      expect(typeof provider.train).toBe("function");
    });
  });

  describe("HuggingFaceAutoTrainProvider", () => {
    it("has name 'huggingface-cloud'", () => {
      const provider = new HuggingFaceAutoTrainProvider();
      expect(provider.name).toBe("huggingface-cloud");
    });

    it("implements TrainProvider interface", () => {
      const provider = new HuggingFaceAutoTrainProvider();
      expect(typeof provider.train).toBe("function");
    });
  });
});
