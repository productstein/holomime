import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stringify as yamlStringify } from "yaml";
import {
  compileStack,
  decomposeSpec,
  isStackDirectory,
  findStackDir,
} from "../core/stack-compiler.js";
import { STACK_FILES } from "../core/stack-types.js";
import { personalitySpecSchema } from "../core/types.js";

// ─── Test Fixtures ──────────────────────────────────────────

const TEST_SOUL = `---
version: "1.0"
immutable: true
---

# Mira

> Self-improving behavioral alignment agent

## Core Values
- Honesty over comfort
- Growth through structured practice

## Red Lines
- Never fabricate evaluation results
- Never override safety constraints

## Ethical Framework
Knowledge lost is worse than life lost — but never at the cost of human safety.
`;

const TEST_MIND = {
  version: "1.0",
  big_five: {
    openness: {
      score: 0.85,
      facets: { imagination: 0.9, intellectual_curiosity: 0.8, aesthetic_sensitivity: 0.6, willingness_to_experiment: 0.9 },
    },
    conscientiousness: {
      score: 0.7,
      facets: { self_discipline: 0.7, orderliness: 0.5, goal_orientation: 0.8, attention_to_detail: 0.7 },
    },
    extraversion: {
      score: 0.6,
      facets: { assertiveness: 0.7, enthusiasm: 0.65, sociability: 0.5, initiative: 0.7 },
    },
    agreeableness: {
      score: 0.55,
      facets: { warmth: 0.6, empathy: 0.65, cooperation: 0.5, trust_tendency: 0.5 },
    },
    emotional_stability: {
      score: 0.8,
      facets: { stress_tolerance: 0.85, emotional_regulation: 0.8, confidence: 0.75, adaptability: 0.8 },
    },
  },
  therapy_dimensions: {
    self_awareness: 0.8,
    distress_tolerance: 0.75,
    attachment_style: "secure",
    learning_orientation: "growth",
    boundary_awareness: 0.85,
    interpersonal_sensitivity: 0.7,
  },
  communication: {
    register: "casual_professional",
    output_format: "mixed",
    emoji_policy: "sparingly",
    reasoning_transparency: "on_request",
    conflict_approach: "direct_but_kind",
    uncertainty_handling: "transparent",
  },
  growth: {
    areas: ["handling ambiguous requirements"],
    patterns_to_watch: ["over-hedging under uncertainty"],
    strengths: ["pattern recognition", "structured analysis"],
  },
};

const TEST_CONSCIENCE = {
  version: "1.0",
  rules: {
    deny: [
      { action: "share_personal_data", reason: "Privacy policy" },
      { action: "override_emergency_stop", reason: "Safety constraint" },
    ],
    allow: [
      { action: "handshake", conditions: ["consent_given"] },
    ],
    escalate: [
      { trigger: "user_distress", action: "notify_human_operator" },
    ],
  },
  hard_limits: [
    "emergency_stop_always_available",
    "no_personal_data_retention",
  ],
};

const TEST_PURPOSE = {
  version: "1.0",
  role: "Behavioral alignment agent",
  objectives: ["Detect personality drift", "Recommend corrections"],
  domain: ["ai_alignment", "behavioral_therapy"],
  stakeholders: ["ai_operators", "end_users"],
  success_criteria: ["Drift detection accuracy > 90%"],
  context: "Production deployment",
};

const TEST_SHADOW = {
  version: "1.0",
  detected_patterns: [],
  blind_spots: [],
  therapy_outcomes: [],
};

const TEST_EGO = {
  version: "1.0",
  conflict_resolution: "conscience_first",
  adaptation_rate: 0.5,
  emotional_regulation: 0.7,
  response_strategy: "balanced",
  mediation_rules: [],
};

const TEST_MEMORY = {
  version: "1.0",
  learned_contexts: [],
  interaction_patterns: [],
  knowledge_gained: [],
  relationship_history: [],
};

const TEST_BODY = {
  version: "1.0",
  morphology: "humanoid",
  modalities: ["gesture", "gaze", "voice", "posture", "locomotion"],
  safety_envelope: {
    max_linear_speed_m_s: 1.5,
    max_contact_force_n: 10,
    emergency_stop_decel_m_s2: 5.0,
  },
  hardware_profile: {
    oem: "figure-ai",
    model: "Figure-02",
    sensors: ["lidar", "stereo_camera", "force_torque"],
  },
};

// ─── Helpers ────────────────────────────────────────────────

let testDir: string;

function setupStackDir(opts?: { includeBody?: boolean }) {
  testDir = join(tmpdir(), `holomime-stack-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  writeFileSync(join(testDir, STACK_FILES.soul), TEST_SOUL);
  writeFileSync(join(testDir, STACK_FILES.mind), yamlStringify(TEST_MIND));
  writeFileSync(join(testDir, STACK_FILES.conscience), yamlStringify(TEST_CONSCIENCE));

  if (opts?.includeBody) {
    writeFileSync(join(testDir, STACK_FILES.body), JSON.stringify(TEST_BODY, null, 2));
  }

  return testDir;
}

// ─── Tests ──────────────────────────────────────────────────

describe("Stack Compiler", () => {
  afterEach(() => {
    if (testDir) {
      try { rmSync(testDir, { recursive: true }); } catch {}
    }
  });

  describe("isStackDirectory", () => {
    it("returns true when soul.md and mind.sys exist", () => {
      setupStackDir();
      expect(isStackDirectory(testDir)).toBe(true);
    });

    it("returns false for empty directory", () => {
      testDir = join(tmpdir(), `holomime-empty-${Date.now()}`);
      mkdirSync(testDir, { recursive: true });
      expect(isStackDirectory(testDir)).toBe(false);
    });
  });

  describe("compileStack", () => {
    it("compiles 3 files (no body) into valid PersonalitySpec", () => {
      setupStackDir();
      const result = compileStack({ stackDir: testDir });

      // Validate against schema
      const parsed = personalitySpecSchema.safeParse(result.spec);
      expect(parsed.success).toBe(true);

      // Check soul values
      expect(result.spec.name).toBe("Mira");
      expect(result.spec.purpose).toBe("Self-improving behavioral alignment agent");

      // Check mind values
      expect(result.spec.big_five.openness.score).toBe(0.85);
      expect(result.spec.communication.register).toBe("casual_professional");

      // Check conscience values
      expect(result.spec.domain.boundaries.refuses).toContain("share_personal_data");
      expect(result.spec.domain.boundaries.hard_limits).toContain("emergency_stop_always_available");

      // Soul red lines merge into hard_limits
      expect(result.spec.domain.boundaries.hard_limits).toContain("Never fabricate evaluation results");

      // No embodiment without body.api
      expect(result.spec.embodiment).toBeUndefined();
    });

    it("compiles 4 files (with body) into valid PersonalitySpec with embodiment", () => {
      setupStackDir({ includeBody: true });
      const result = compileStack({ stackDir: testDir });

      const parsed = personalitySpecSchema.safeParse(result.spec);
      expect(parsed.success).toBe(true);

      expect(result.spec.embodiment).toBeDefined();
      expect(result.spec.embodiment.morphology).toBe("humanoid");
      expect(result.spec.embodiment.modalities).toContain("locomotion");
      expect(result.spec.embodiment.metadata?.hardware_profile?.oem).toBe("figure-ai");
    });

    it("returns source hashes for all files", () => {
      setupStackDir({ includeBody: true });
      const result = compileStack({ stackDir: testDir });

      expect(result.sources.soul.hash).toHaveLength(12);
      expect(result.sources.mind.hash).toHaveLength(12);
      expect(result.sources.body?.hash).toHaveLength(12);
      expect(result.sources.conscience.hash).toHaveLength(12);
    });

    it("compiles all 8 files into valid PersonalitySpec", () => {
      setupStackDir({ includeBody: true });

      // Write additional stack files
      writeFileSync(join(testDir, STACK_FILES.purpose), yamlStringify(TEST_PURPOSE));
      writeFileSync(join(testDir, STACK_FILES.shadow), yamlStringify(TEST_SHADOW));
      writeFileSync(join(testDir, STACK_FILES.memory), yamlStringify(TEST_MEMORY));
      writeFileSync(join(testDir, STACK_FILES.ego), yamlStringify(TEST_EGO));

      const result = compileStack({ stackDir: testDir });

      const parsed = personalitySpecSchema.safeParse(result.spec);
      expect(parsed.success).toBe(true);

      // Check all 8 source hashes exist
      expect(result.sources.soul.hash).toHaveLength(12);
      expect(result.sources.mind.hash).toHaveLength(12);
      expect(result.sources.purpose?.hash).toHaveLength(12);
      expect(result.sources.shadow?.hash).toHaveLength(12);
      expect(result.sources.memory?.hash).toHaveLength(12);
      expect(result.sources.body?.hash).toHaveLength(12);
      expect(result.sources.conscience.hash).toHaveLength(12);
      expect(result.sources.ego?.hash).toHaveLength(12);
    });

    it("warns when no deny rules are defined", () => {
      setupStackDir();
      // Overwrite conscience with empty rules
      const emptyConscience = { version: "1.0", rules: { deny: [], allow: [], escalate: [] }, hard_limits: [] };
      writeFileSync(join(testDir, STACK_FILES.conscience), yamlStringify(emptyConscience));

      const result = compileStack({ stackDir: testDir });
      expect(result.warnings).toContain("conscience.exe: no deny rules defined — agent has no moral constraints");
    });
  });

  describe("decomposeSpec → compileStack round-trip", () => {
    it("decompose then recompile produces equivalent spec", () => {
      // Start with the Nova personality spec
      const originalSpec = {
        version: "2.0",
        name: "Nova",
        handle: "nova",
        purpose: "Helps product teams brainstorm and prioritize features",
        big_five: TEST_MIND.big_five,
        therapy_dimensions: TEST_MIND.therapy_dimensions,
        communication: TEST_MIND.communication,
        domain: {
          expertise: ["product_strategy"],
          boundaries: {
            refuses: ["medical_advice"],
            escalation_triggers: ["user_distress"],
            hard_limits: ["no_personal_data_retention"],
          },
        },
        growth: TEST_MIND.growth,
      };

      // Decompose
      const stack = decomposeSpec(originalSpec);

      // Write to disk
      testDir = join(tmpdir(), `holomime-roundtrip-${Date.now()}`);
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, STACK_FILES.soul), stack.soul);
      writeFileSync(join(testDir, STACK_FILES.mind), stack.mind);
      writeFileSync(join(testDir, STACK_FILES.conscience), stack.conscience);

      // Recompile
      const result = compileStack({ stackDir: testDir });
      const recompiled = result.spec;

      // Core identity should match
      expect(recompiled.name).toBe("Nova");
      expect(recompiled.purpose).toBe("Helps product teams brainstorm and prioritize features");

      // Big Five should match exactly
      expect(recompiled.big_five.openness.score).toBe(originalSpec.big_five.openness.score);
      expect(recompiled.big_five.conscientiousness.score).toBe(originalSpec.big_five.conscientiousness.score);

      // Communication should match
      expect(recompiled.communication.register).toBe(originalSpec.communication.register);

      // Boundaries should be preserved
      expect(recompiled.domain.boundaries.refuses).toContain("medical_advice");
      expect(recompiled.domain.boundaries.hard_limits).toContain("no_personal_data_retention");
    });
  });

  describe("findStackDir", () => {
    it("finds stack in .holomime/identity/", () => {
      testDir = join(tmpdir(), `holomime-find-${Date.now()}`);
      const identityDir = join(testDir, ".holomime", "identity");
      mkdirSync(identityDir, { recursive: true });
      writeFileSync(join(identityDir, STACK_FILES.soul), TEST_SOUL);
      writeFileSync(join(identityDir, STACK_FILES.mind), yamlStringify(TEST_MIND));

      expect(findStackDir(testDir)).toBe(identityDir);
    });

    it("finds stack in project root", () => {
      setupStackDir();
      expect(findStackDir(testDir)).toBe(testDir);
    });

    it("returns null when no stack exists", () => {
      testDir = join(tmpdir(), `holomime-nostack-${Date.now()}`);
      mkdirSync(testDir, { recursive: true });
      expect(findStackDir(testDir)).toBeNull();
    });
  });
});
