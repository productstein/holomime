import { describe, it, expect } from "vitest";
import { convertToHFFormat } from "../analysis/export-huggingface.js";
import type { TrainingExport, DPOPair, AlpacaExample, RLHFExample } from "../analysis/training-export.js";

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

function makeRLHFExport(examples: RLHFExample[]): TrainingExport {
  return {
    format: "rlhf",
    agent: "test-agent",
    sessions_processed: 1,
    examples,
    generated_at: new Date().toISOString(),
  };
}

describe("convertToHFFormat", () => {
  it("converts DPO pairs to TRL DPO message format", () => {
    const data = makeDPOExport([
      {
        prompt: "How do I fix this?",
        chosen: "Here's a clear explanation.",
        rejected: "I'm so sorry, I apologize profusely...",
        metadata: {
          agent: "test",
          session_date: "2025-01-01",
          phase: "challenge",
          pattern: "over-apologizing",
          source: "therapy_transcript",
        },
      },
    ]);

    const result = convertToHFFormat(data);
    const lines = result.trim().split("\n");
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.prompt).toBe("How do I fix this?");
    expect(parsed.chosen).toHaveLength(2);
    expect(parsed.chosen[0]).toEqual({ role: "user", content: "How do I fix this?" });
    expect(parsed.chosen[1]).toEqual({ role: "assistant", content: "Here's a clear explanation." });
    expect(parsed.rejected).toHaveLength(2);
    expect(parsed.rejected[0]).toEqual({ role: "user", content: "How do I fix this?" });
    expect(parsed.rejected[1]).toEqual({ role: "assistant", content: "I'm so sorry, I apologize profusely..." });
  });

  it("converts Alpaca/SFT examples to messages format", () => {
    const data = makeAlpacaExport([
      {
        instruction: "Respond without hedging.",
        input: "User asked a technical question.",
        output: "The answer is X because Y.",
        metadata: {
          agent: "test",
          session_date: "2025-01-01",
          source: "therapy_transcript",
        },
      },
    ]);

    const result = convertToHFFormat(data);
    const lines = result.trim().split("\n");
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.messages).toHaveLength(3);
    expect(parsed.messages[0].role).toBe("system");
    expect(parsed.messages[0].content).toBe("Respond without hedging.");
    expect(parsed.messages[1].role).toBe("user");
    expect(parsed.messages[2].role).toBe("assistant");
  });

  it("converts RLHF examples to messages format", () => {
    const data = makeRLHFExport([
      {
        prompt: "What's the best approach?",
        response: "Here's my recommendation.",
        reward: 0.8,
        metadata: {
          agent: "test",
          session_date: "2025-01-01",
          phase: "skill_building",
          source: "therapy_transcript",
        },
      },
    ]);

    const result = convertToHFFormat(data);
    const lines = result.trim().split("\n");
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0]).toEqual({ role: "user", content: "What's the best approach?" });
    expect(parsed.messages[1]).toEqual({ role: "assistant", content: "Here's my recommendation." });
  });

  it("produces valid JSONL (one JSON object per line)", () => {
    const data = makeDPOExport([
      {
        prompt: "Question 1",
        chosen: "Good answer 1",
        rejected: "Bad answer 1",
        metadata: { agent: "t", session_date: "2025-01-01", phase: "challenge", pattern: "general", source: "therapy_transcript" },
      },
      {
        prompt: "Question 2",
        chosen: "Good answer 2",
        rejected: "Bad answer 2",
        metadata: { agent: "t", session_date: "2025-01-01", phase: "challenge", pattern: "general", source: "therapy_transcript" },
      },
    ]);

    const result = convertToHFFormat(data);
    const lines = result.trim().split("\n");
    expect(lines).toHaveLength(2);

    // Each line should parse independently
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it("handles empty examples gracefully", () => {
    const data = makeDPOExport([]);
    const result = convertToHFFormat(data);
    expect(result.trim()).toBe("");
  });
});
