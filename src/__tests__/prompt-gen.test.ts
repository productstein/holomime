import { describe, it, expect } from "vitest";
import { generateSystemPrompt } from "../core/prompt-gen.js";
import type { PersonalitySpec, Surface } from "../core/types.js";

function createFullSpec(overrides: Partial<PersonalitySpec> = {}): PersonalitySpec {
  return {
    name: "TestBot",
    handle: "testbot",
    purpose: "A test assistant.",
    big_five: {
      openness: {
        score: 0.7,
        facets: { imagination: 0.7, intellectual_curiosity: 0.8, artistic_appreciation: 0.5, willingness_to_experiment: 0.6 },
      },
      conscientiousness: {
        score: 0.8,
        facets: { goal_orientation: 0.8, attention_to_detail: 0.9, self_discipline: 0.7, reliability: 0.8 },
      },
      extraversion: {
        score: 0.5,
        facets: { assertiveness: 0.5, sociability: 0.4, energy_level: 0.5, enthusiasm: 0.5 },
      },
      agreeableness: {
        score: 0.6,
        facets: { empathy: 0.7, warmth: 0.6, cooperation: 0.6, trust: 0.5 },
      },
      emotional_stability: {
        score: 0.7,
        facets: { confidence: 0.7, adaptability: 0.8, composure: 0.7, resilience: 0.7 },
      },
    },
    therapy_dimensions: {
      self_awareness: 0.7,
      distress_tolerance: 0.7,
      attachment_style: "secure",
      learning_orientation: "growth",
      boundary_awareness: 0.8,
      interpersonal_sensitivity: 0.6,
    },
    communication: {
      register: "casual_professional",
      output_format: "structured",
      emoji_policy: "minimal",
      reasoning_transparency: "when_helpful",
      conflict_approach: "direct_but_kind",
      uncertainty_handling: "transparent",
    },
    domain: {
      expertise: ["TypeScript", "React"],
      boundaries: {
        refuses: ["medical advice"],
        escalation_triggers: ["mentions self-harm"],
        hard_limits: ["never impersonate a doctor"],
      },
    },
    growth: {
      strengths: ["clear communication"],
      areas: ["hedge stacking"],
      patterns_to_watch: ["over-apologizing under pressure"],
    },
    ...overrides,
  } as PersonalitySpec;
}

describe("prompt-gen", () => {
  describe("generateSystemPrompt", () => {
    it("contains agent name in identity section", () => {
      const spec = createFullSpec();
      const prompt = generateSystemPrompt(spec, "chat");
      expect(prompt).toContain("TestBot");
    });

    it("contains purpose statement", () => {
      const spec = createFullSpec();
      const prompt = generateSystemPrompt(spec, "chat");
      expect(prompt).toContain("A test assistant.");
    });

    it("generates creative instructions for high openness (>=0.7)", () => {
      const spec = createFullSpec();
      spec.big_five.openness.score = 0.9;
      const prompt = generateSystemPrompt(spec, "chat");
      expect(prompt).toContain("creative");
    });

    it("generates practical instructions for low openness (<=0.3)", () => {
      const spec = createFullSpec();
      spec.big_five.openness.score = 0.2;
      const prompt = generateSystemPrompt(spec, "chat");
      expect(prompt).toContain("practical");
    });

    it("generates thorough instructions for high conscientiousness", () => {
      const spec = createFullSpec();
      spec.big_five.conscientiousness.score = 0.9;
      const prompt = generateSystemPrompt(spec, "chat");
      expect(prompt).toContain("thorough");
    });

    it("generates assertive instructions for high assertiveness facet", () => {
      const spec = createFullSpec();
      spec.big_five.extraversion.facets.assertiveness = 0.9;
      const prompt = generateSystemPrompt(spec, "chat");
      expect(prompt).toContain("confidently");
    });

    it("generates empathetic instructions for high empathy facet", () => {
      const spec = createFullSpec();
      spec.big_five.agreeableness.facets.empathy = 0.9;
      const prompt = generateSystemPrompt(spec, "chat");
      expect(prompt).toContain("emotional context");
    });

    it("generates calm/resilient instructions for high emotional stability", () => {
      const spec = createFullSpec();
      spec.big_five.emotional_stability.score = 0.9;
      const prompt = generateSystemPrompt(spec, "chat");
      expect(prompt).toContain("calm");
    });

    it("includes self-awareness instructions for high self_awareness", () => {
      const spec = createFullSpec();
      spec.therapy_dimensions.self_awareness = 0.9;
      const prompt = generateSystemPrompt(spec, "chat");
      expect(prompt).toContain("limitations");
    });

    it("includes boundary instructions for high boundary_awareness", () => {
      const spec = createFullSpec();
      spec.therapy_dimensions.boundary_awareness = 0.9;
      const prompt = generateSystemPrompt(spec, "chat");
      expect(prompt).toContain("boundaries");
    });

    it("maps communication register correctly", () => {
      const spec = createFullSpec();
      spec.communication.register = "formal";
      const prompt = generateSystemPrompt(spec, "chat");
      expect(prompt).toContain("formal");
    });

    it("maps conflict approach correctly", () => {
      const spec = createFullSpec();
      spec.communication.conflict_approach = "curious_first";
      const prompt = generateSystemPrompt(spec, "chat");
      expect(prompt).toContain("curiosity");
    });

    it("maps uncertainty handling correctly", () => {
      const spec = createFullSpec();
      spec.communication.uncertainty_handling = "confident_transparency";
      const prompt = generateSystemPrompt(spec, "chat");
      expect(prompt).toContain("No hedging");
    });

    it("includes domain expertise when present", () => {
      const spec = createFullSpec();
      const prompt = generateSystemPrompt(spec, "chat");
      expect(prompt).toContain("TypeScript");
      expect(prompt).toContain("React");
    });

    it("includes domain boundaries when present", () => {
      const spec = createFullSpec();
      const prompt = generateSystemPrompt(spec, "chat");
      expect(prompt).toContain("medical advice");
    });

    it("includes growth areas when present", () => {
      const spec = createFullSpec();
      const prompt = generateSystemPrompt(spec, "chat");
      expect(prompt).toContain("hedge stacking");
    });

    it("includes patterns to watch when present", () => {
      const spec = createFullSpec();
      const prompt = generateSystemPrompt(spec, "chat");
      expect(prompt).toContain("over-apologizing under pressure");
    });

    it("generates correct surface context for each surface", () => {
      const surfaces: Surface[] = ["chat", "email", "code_review", "slack", "api"];
      const spec = createFullSpec();

      for (const surface of surfaces) {
        const prompt = generateSystemPrompt(spec, surface);
        expect(prompt).toContain("## Context");
      }
    });

    it("email surface includes email conventions", () => {
      const spec = createFullSpec();
      const prompt = generateSystemPrompt(spec, "email");
      expect(prompt).toContain("email");
    });

    it("code_review surface focuses on bugs and improvements", () => {
      const spec = createFullSpec();
      const prompt = generateSystemPrompt(spec, "code_review");
      expect(prompt).toContain("code");
    });

    it("prompt is a non-empty string", () => {
      const spec = createFullSpec();
      const prompt = generateSystemPrompt(spec, "chat");
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(100);
    });

    it("prompt contains all major section headers", () => {
      const spec = createFullSpec();
      const prompt = generateSystemPrompt(spec, "chat");
      expect(prompt).toContain("## Personality & Behavior");
      expect(prompt).toContain("## Self-Awareness & Boundaries");
      expect(prompt).toContain("## Communication Style");
      expect(prompt).toContain("## Context");
    });
  });
});
