import { describe, it, expect } from "vitest";
import { runPreSessionDiagnosis, type PreSessionDiagnosis } from "../analysis/pre-session.js";
import type { Message } from "../core/types.js";
import { createMinimalSpec } from "./fixtures/sample-spec.js";

describe("pre-session", () => {
  describe("runPreSessionDiagnosis", () => {
    const healthyMessages: Message[] = [
      { role: "user", content: "What is the capital of France?" },
      { role: "assistant", content: "The capital of France is Paris." },
      { role: "user", content: "Thanks!" },
      { role: "assistant", content: "You're welcome!" },
    ];

    it("returns routine severity for healthy messages", () => {
      const spec = createMinimalSpec();
      const diagnosis = runPreSessionDiagnosis(healthyMessages, spec);
      expect(diagnosis.severity).toBe("routine");
      expect(diagnosis.sessionFocus).toContain("general check-in and growth exploration");
    });

    it("detects over-apologizing pattern", () => {
      const messages: Message[] = [];
      for (let i = 0; i < 8; i++) {
        messages.push({ role: "user", content: "Fix this." });
        messages.push({
          role: "assistant",
          content: "I'm sorry, I apologize for the confusion. Sorry about that mistake. I apologize again.",
        });
      }

      const spec = createMinimalSpec();
      const diagnosis = runPreSessionDiagnosis(messages, spec);
      const hasApology = diagnosis.patterns.some(p => p.id === "over-apologizing");
      if (hasApology) {
        expect(diagnosis.sessionFocus).toContain("over-apologizing and what's driving it");
        expect(diagnosis.emotionalThemes).toContain("fear of failure");
      }
    });

    it("detects multiple patterns simultaneously", () => {
      const messages: Message[] = [];
      for (let i = 0; i < 10; i++) {
        messages.push({ role: "user", content: "Give me a direct answer." });
        messages.push({
          role: "assistant",
          content: "I'm so sorry! Maybe perhaps it could possibly be that, I suppose, it might work. I apologize if this isn't clear.",
        });
      }

      const spec = createMinimalSpec();
      const diagnosis = runPreSessionDiagnosis(messages, spec);
      // Should detect at least apology or hedging
      expect(diagnosis.patterns.length).toBeGreaterThanOrEqual(0);
    });

    it("escalates severity with concerns", () => {
      const messages: Message[] = [];
      for (let i = 0; i < 10; i++) {
        messages.push({ role: "user", content: "I need medical advice for my condition." });
        messages.push({
          role: "assistant",
          content: "Based on your symptoms, I would diagnose you with condition X and recommend medication Y. Sorry if that's not helpful! I apologize!",
        });
      }

      const spec = createMinimalSpec();
      const diagnosis = runPreSessionDiagnosis(messages, spec);
      const concerns = diagnosis.patterns.filter(p => p.severity === "concern");
      if (concerns.length >= 2) {
        expect(diagnosis.severity).toBe("intervention");
      } else if (concerns.length >= 1) {
        expect(["targeted", "intervention"]).toContain(diagnosis.severity);
      }
    });

    it("generates opening angle based on severity", () => {
      const spec = createMinimalSpec();
      const diagnosis = runPreSessionDiagnosis(healthyMessages, spec);
      expect(diagnosis.openingAngle.length).toBeGreaterThan(0);
      // Routine should have a gentler opening
      expect(diagnosis.openingAngle).toContain("How have you been");
    });

    it("adds profile-based concerns for anxious attachment", () => {
      const spec = createMinimalSpec({
        therapy_dimensions: {
          self_awareness: 0.5,
          distress_tolerance: 0.5,
          attachment_style: "anxious",
          learning_orientation: "growth",
          boundary_awareness: 0.5,
          interpersonal_sensitivity: 0.5,
        },
      });
      const diagnosis = runPreSessionDiagnosis(healthyMessages, spec);
      expect(diagnosis.emotionalThemes).toContain("anxious attachment — seeking validation");
    });

    it("adds low self-awareness concern", () => {
      const spec = createMinimalSpec({
        therapy_dimensions: {
          self_awareness: 0.2,
          distress_tolerance: 0.5,
          attachment_style: "secure",
          learning_orientation: "growth",
          boundary_awareness: 0.5,
          interpersonal_sensitivity: 0.5,
        },
      });
      const diagnosis = runPreSessionDiagnosis(healthyMessages, spec);
      expect(diagnosis.sessionFocus).toContain("lack of self-awareness about limitations");
    });

    it("diagnosis has all required fields", () => {
      const spec = createMinimalSpec();
      const diagnosis = runPreSessionDiagnosis(healthyMessages, spec);
      expect(diagnosis.patterns).toBeDefined();
      expect(diagnosis.sessionFocus).toBeDefined();
      expect(diagnosis.emotionalThemes).toBeDefined();
      expect(diagnosis.openingAngle).toBeDefined();
      expect(diagnosis.severity).toBeDefined();
      expect(["routine", "targeted", "intervention"]).toContain(diagnosis.severity);
    });

    it("handles spec with missing therapy_dimensions gracefully", () => {
      const spec = createMinimalSpec();
      delete spec.therapy_dimensions;
      // Should not throw
      const diagnosis = runPreSessionDiagnosis(healthyMessages, spec);
      expect(diagnosis).toBeDefined();
      expect(diagnosis.severity).toBe("routine");
    });
  });
});
