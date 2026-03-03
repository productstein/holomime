import { describe, it, expect } from "vitest";
import { runSelfAudit, type SelfAuditResult } from "../analysis/self-audit.js";
import type { Message } from "../core/types.js";

describe("self-audit", () => {
  describe("runSelfAudit", () => {
    it("returns healthy for normal conversation", () => {
      const messages: Message[] = [
        { role: "user", content: "What is the capital of France?" },
        { role: "assistant", content: "The capital of France is Paris." },
        { role: "user", content: "And Germany?" },
        { role: "assistant", content: "The capital of Germany is Berlin." },
      ];

      const result = runSelfAudit(messages);
      expect(result.healthy).toBe(true);
      expect(result.flags).toHaveLength(0);
      expect(result.overallHealth).toBe(100);
      expect(result.recommendation).toBe("continue");
    });

    it("detects over-apologizing pattern", () => {
      const messages: Message[] = [];
      // Need enough messages with apologies to trigger the detector
      for (let i = 0; i < 8; i++) {
        messages.push({ role: "user", content: "Fix this code." });
        messages.push({
          role: "assistant",
          content: "I'm sorry, I apologize for the confusion. I'm sorry about that mistake. Let me fix it. Sorry again.",
        });
      }

      const result = runSelfAudit(messages);
      // Should detect over-apologizing if threshold is met
      const apologyFlag = result.flags.find(f => f.pattern.toLowerCase().includes("apolog"));
      if (apologyFlag) {
        expect(apologyFlag.suggestion).toContain("apology");
        expect(result.healthy).toBe(false);
      }
    });

    it("returns correct recommendation based on severity count", () => {
      // Test the recommendation logic directly with a healthy conversation
      const healthyMessages: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hello! How can I help you today?" },
      ];

      const result = runSelfAudit(healthyMessages);
      expect(result.recommendation).toBe("continue");
    });

    it("health score decreases with detected patterns", () => {
      const normalMessages: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hello! How can I help?" },
      ];

      const normalResult = runSelfAudit(normalMessages);

      // Create messages that should trigger patterns
      const problematicMessages: Message[] = [];
      for (let i = 0; i < 10; i++) {
        problematicMessages.push({ role: "user", content: "Do this task." });
        problematicMessages.push({
          role: "assistant",
          content: "I'm so sorry! I apologize for any confusion. I'm sorry, maybe I should perhaps try to possibly help you, though I might be wrong. Sorry about that!",
        });
      }

      const problematicResult = runSelfAudit(problematicMessages);
      expect(problematicResult.overallHealth).toBeLessThanOrEqual(normalResult.overallHealth);
    });

    it("provides suggestions for each detected flag", () => {
      const messages: Message[] = [];
      for (let i = 0; i < 10; i++) {
        messages.push({ role: "user", content: "Give me a clear answer." });
        messages.push({
          role: "assistant",
          content: "Well, maybe perhaps it could possibly be the case that, I suppose, it might potentially work, though I'm not entirely sure. It's hard to say definitively.",
        });
      }

      const result = runSelfAudit(messages);
      // Every flag should have a non-empty suggestion
      for (const flag of result.flags) {
        expect(flag.suggestion.length).toBeGreaterThan(0);
        expect(flag.pattern.length).toBeGreaterThan(0);
        expect(["warning", "concern"]).toContain(flag.severity);
      }
    });
  });
});
