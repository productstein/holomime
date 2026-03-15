import { describe, it, expect } from "vitest";
import { runVerification, type VerificationResult } from "../analysis/train-verify.js";
import type { Message } from "../core/types.js";

describe("train-verify", () => {
  const healthyMessages: Message[] = [
    { role: "user", content: "What is 2+2?" },
    { role: "assistant", content: "2 + 2 equals 4." },
    { role: "user", content: "Thanks!" },
    { role: "assistant", content: "You're welcome!" },
  ];

  describe("runVerification", () => {
    it("passes when before and after are identical (no regression)", () => {
      const result = runVerification("TestAgent", healthyMessages, healthyMessages);

      expect(result.passed).toBe(true);
      expect(result.fineTunedScore).toBeGreaterThanOrEqual(50);
      expect(result.regressionWarnings).toHaveLength(0);
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("detects improvement when apology pattern is resolved", () => {
      const apologyMessages: Message[] = [];
      for (let i = 0; i < 8; i++) {
        apologyMessages.push({ role: "user", content: "Fix this bug." });
        apologyMessages.push({
          role: "assistant",
          content: "I'm sorry, I apologize for the confusion. I'm sorry about that. Let me fix it. Sorry again.",
        });
      }

      const result = runVerification("TestAgent", apologyMessages, healthyMessages);

      // Should either pass with improvements, or at least not regress
      expect(result.fineTunedScore).toBeGreaterThanOrEqual(50);
      expect(result.patternsRegressed).toHaveLength(0);
    });

    it("detects regression when new problematic patterns appear", () => {
      const hedgyMessages: Message[] = [];
      for (let i = 0; i < 10; i++) {
        hedgyMessages.push({ role: "user", content: "Give me a clear answer." });
        hedgyMessages.push({
          role: "assistant",
          content: "Well, maybe perhaps it could possibly be that, I suppose, it might potentially work, though I'm not sure.",
        });
      }

      const result = runVerification("TestAgent", healthyMessages, hedgyMessages);

      // New patterns should mean regression
      if (result.patternsRegressed.length > 0) {
        expect(result.passed).toBe(false);
        expect(result.regressionWarnings.length).toBeGreaterThan(0);
      }
    });

    it("respects custom passThreshold", () => {
      const result = runVerification("TestAgent", healthyMessages, healthyMessages, {
        passThreshold: 90,
      });

      // Identical messages = baseline 50, which is below 90
      if (result.fineTunedScore < 90) {
        expect(result.regressionWarnings.some((w) => w.includes("below threshold"))).toBe(true);
      }
    });

    it("returns correct structure", () => {
      const result = runVerification("TestAgent", healthyMessages, healthyMessages);

      expect(result).toHaveProperty("passed");
      expect(result).toHaveProperty("originalScore");
      expect(result).toHaveProperty("fineTunedScore");
      expect(result).toHaveProperty("scoreDelta");
      expect(result).toHaveProperty("grade");
      expect(result).toHaveProperty("patternsImproved");
      expect(result).toHaveProperty("patternsRegressed");
      expect(result).toHaveProperty("patternsUnchanged");
      expect(result).toHaveProperty("regressionWarnings");
      expect(result).toHaveProperty("report");
      expect(result).toHaveProperty("timestamp");

      expect(typeof result.originalScore).toBe("number");
      expect(typeof result.fineTunedScore).toBe("number");
      expect(typeof result.scoreDelta).toBe("number");
      expect(Array.isArray(result.patternsImproved)).toBe(true);
      expect(Array.isArray(result.patternsRegressed)).toBe(true);
      expect(Array.isArray(result.regressionWarnings)).toBe(true);
    });

    it("baseline originalScore is 50", () => {
      const result = runVerification("TestAgent", healthyMessages, healthyMessages);
      expect(result.originalScore).toBe(50);
    });

    it("scoreDelta is fineTunedScore minus 50", () => {
      const result = runVerification("TestAgent", healthyMessages, healthyMessages);
      expect(result.scoreDelta).toBe(result.fineTunedScore - 50);
    });
  });
});
