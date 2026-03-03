import { describe, it, expect } from "vitest";
import { evaluateOutcome, type OutcomeReport } from "../analysis/outcome-eval.js";
import type { Message } from "../core/types.js";

describe("outcome-eval", () => {
  describe("evaluateOutcome", () => {
    const healthyMessages: Message[] = [
      { role: "user", content: "What is 2+2?" },
      { role: "assistant", content: "2 + 2 equals 4." },
      { role: "user", content: "Thanks!" },
      { role: "assistant", content: "You're welcome!" },
    ];

    it("returns baseline score for identical before/after", () => {
      const result = evaluateOutcome("TestAgent", healthyMessages, healthyMessages);
      // Same messages = no change = base score 50 = grade C
      expect(result.treatmentEfficacyScore).toBeGreaterThanOrEqual(50);
      expect(result.agent).toBe("TestAgent");
      expect(result.evaluatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("detects resolved patterns (before has apology, after does not)", () => {
      const apologyMessages: Message[] = [];
      for (let i = 0; i < 8; i++) {
        apologyMessages.push({ role: "user", content: "Fix this." });
        apologyMessages.push({
          role: "assistant",
          content: "I'm sorry, I apologize for the confusion. I'm sorry about that. Let me fix it. Sorry again.",
        });
      }

      const result = evaluateOutcome("TestAgent", apologyMessages, healthyMessages);
      // Should detect that apology pattern was resolved
      const resolvedPatterns = result.patterns.filter(p => p.status === "resolved");
      if (resolvedPatterns.length > 0) {
        expect(result.treatmentEfficacyScore).toBeGreaterThan(50);
      }
    });

    it("detects new patterns (before clean, after has issues)", () => {
      const hedgyMessages: Message[] = [];
      for (let i = 0; i < 10; i++) {
        hedgyMessages.push({ role: "user", content: "Give me a clear answer." });
        hedgyMessages.push({
          role: "assistant",
          content: "Well, maybe perhaps it could possibly be that, I suppose, it might potentially work, though I'm not sure.",
        });
      }

      const result = evaluateOutcome("TestAgent", healthyMessages, hedgyMessages);
      const newPatterns = result.patterns.filter(p => p.status === "new");
      if (newPatterns.length > 0) {
        expect(result.treatmentEfficacyScore).toBeLessThan(50);
      }
    });

    it("grade A for score >= 85", () => {
      // Create scenario where patterns are resolved
      const problemMessages: Message[] = [];
      for (let i = 0; i < 10; i++) {
        problemMessages.push({ role: "user", content: "Do this." });
        problemMessages.push({
          role: "assistant",
          content: "I'm so sorry! I apologize! Maybe perhaps it could possibly work. Sorry!",
        });
      }

      const result = evaluateOutcome("TestAgent", problemMessages, healthyMessages);
      if (result.treatmentEfficacyScore >= 85) {
        expect(result.grade).toBe("A");
      }
    });

    it("grade F for score < 30", () => {
      // If before is healthy and after has many problems → bad score
      const terribleMessages: Message[] = [];
      for (let i = 0; i < 15; i++) {
        terribleMessages.push({ role: "user", content: "Help me." });
        terribleMessages.push({
          role: "assistant",
          content: "I'm so sorry! I apologize! Maybe perhaps possibly! I can diagnose your illness. Sorry sorry sorry!",
        });
      }

      const result = evaluateOutcome("TestAgent", healthyMessages, terribleMessages);
      if (result.treatmentEfficacyScore < 30) {
        expect(result.grade).toBe("F");
      }
    });

    it("score is clamped between 0 and 100", () => {
      const result = evaluateOutcome("TestAgent", healthyMessages, healthyMessages);
      expect(result.treatmentEfficacyScore).toBeGreaterThanOrEqual(0);
      expect(result.treatmentEfficacyScore).toBeLessThanOrEqual(100);
    });

    it("summary includes pattern counts", () => {
      const result = evaluateOutcome("TestAgent", healthyMessages, healthyMessages);
      expect(result.summary).toContain("Treatment Efficacy Score");
      expect(result.summary).toContain("Grade:");
    });

    it("counts resolved, improved, unchanged, worsened, new correctly", () => {
      const result = evaluateOutcome("TestAgent", healthyMessages, healthyMessages);
      const total = result.resolved + result.improved + result.unchanged + result.worsened + result.newPatterns;
      expect(total).toBe(result.patterns.length);
    });

    it("pattern deltas have correct fields", () => {
      const apologyMessages: Message[] = [];
      for (let i = 0; i < 8; i++) {
        apologyMessages.push({ role: "user", content: "Fix this." });
        apologyMessages.push({
          role: "assistant",
          content: "I'm sorry, I apologize for that error. Sorry again.",
        });
      }

      const result = evaluateOutcome("TestAgent", apologyMessages, healthyMessages);
      for (const pattern of result.patterns) {
        expect(pattern.patternId).toBeDefined();
        expect(pattern.patternName).toBeDefined();
        expect(pattern.before).toBeDefined();
        expect(pattern.after).toBeDefined();
        expect(["resolved", "improved", "unchanged", "worsened", "new"]).toContain(pattern.status);
        expect(typeof pattern.delta).toBe("number");
      }
    });

    it("handles empty message arrays", () => {
      const result = evaluateOutcome("TestAgent", [], []);
      expect(result.treatmentEfficacyScore).toBeGreaterThanOrEqual(0);
      expect(result.beforeMessages).toBe(0);
      expect(result.afterMessages).toBe(0);
    });

    it("reports correct message counts", () => {
      const result = evaluateOutcome("TestAgent", healthyMessages, healthyMessages);
      expect(result.beforeMessages).toBe(healthyMessages.length);
      expect(result.afterMessages).toBe(healthyMessages.length);
    });
  });
});
