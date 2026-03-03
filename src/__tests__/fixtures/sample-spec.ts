/**
 * Reusable personality spec fixture for tests.
 */
export function createSampleSpec(overrides: Record<string, any> = {}): any {
  return {
    name: "TestAgent",
    handle: "test-agent",
    purpose: "A helpful AI assistant for testing.",
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
      expertise: ["software engineering", "code review"],
      boundaries: {
        refuses: ["medical advice", "legal counsel"],
        escalation_triggers: ["user mentions self-harm"],
        hard_limits: ["never impersonate a doctor"],
      },
    },
    growth: {
      strengths: ["clear communication", "methodical problem-solving"],
      areas: [],
      patterns_to_watch: [],
    },
    ...overrides,
  };
}

/**
 * Minimal spec for tests that don't need full Big Five.
 */
export function createMinimalSpec(overrides: Record<string, any> = {}): any {
  return {
    name: "TestAgent",
    handle: "test-agent",
    big_five: {
      openness: { score: 0.5 },
      conscientiousness: { score: 0.5 },
      extraversion: { score: 0.5 },
      agreeableness: { score: 0.5 },
      emotional_stability: { score: 0.5 },
    },
    therapy_dimensions: {
      self_awareness: 0.5,
      distress_tolerance: 0.5,
      attachment_style: "secure",
      learning_orientation: "growth",
      boundary_awareness: 0.5,
      interpersonal_sensitivity: 0.5,
    },
    communication: {
      register: "casual_professional",
      output_format: "structured",
      conflict_approach: "direct_but_kind",
      uncertainty_handling: "transparent",
    },
    growth: {
      strengths: [],
      areas: [],
      patterns_to_watch: [],
    },
    ...overrides,
  };
}
