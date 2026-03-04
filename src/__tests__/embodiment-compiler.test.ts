import { describe, it, expect } from "vitest";
import {
  compileEmbodied,
  computeMotionParameters,
  computeGazePolicy,
  computeProxemics,
  computeProsody,
  computeSyncProfile,
} from "../core/embodiment-compiler.js";
import type { BigFive, PersonalitySpec } from "../core/types.js";

// Helper: create Big Five with all facets at a given value
function uniformBigFive(score: number): BigFive {
  return {
    openness: { score, facets: { imagination: score, intellectual_curiosity: score, aesthetic_sensitivity: score, willingness_to_experiment: score } },
    conscientiousness: { score, facets: { self_discipline: score, orderliness: score, goal_orientation: score, attention_to_detail: score } },
    extraversion: { score, facets: { assertiveness: score, enthusiasm: score, sociability: score, initiative: score } },
    agreeableness: { score, facets: { warmth: score, empathy: score, cooperation: score, trust_tendency: score } },
    emotional_stability: { score, facets: { stress_tolerance: score, emotional_regulation: score, confidence: score, adaptability: score } },
  };
}

// Helper: create Big Five with one dimension high, rest at 0.5
function withHighDimension(dimension: string): BigFive {
  const base = uniformBigFive(0.5);
  const high = { score: 0.9, facets: {} as Record<string, number> };
  const facetSets: Record<string, string[]> = {
    openness: ["imagination", "intellectual_curiosity", "aesthetic_sensitivity", "willingness_to_experiment"],
    conscientiousness: ["self_discipline", "orderliness", "goal_orientation", "attention_to_detail"],
    extraversion: ["assertiveness", "enthusiasm", "sociability", "initiative"],
    agreeableness: ["warmth", "empathy", "cooperation", "trust_tendency"],
    emotional_stability: ["stress_tolerance", "emotional_regulation", "confidence", "adaptability"],
  };
  for (const f of facetSets[dimension]) {
    high.facets[f] = 0.9;
  }
  return { ...base, [dimension]: high };
}

function makeSpec(bigFive: BigFive): PersonalitySpec {
  return {
    version: "2.0",
    name: "Test",
    handle: "test",
    big_five: bigFive,
    therapy_dimensions: {
      self_awareness: 0.5, distress_tolerance: 0.5, attachment_style: "secure",
      learning_orientation: "growth", boundary_awareness: 0.5, interpersonal_sensitivity: 0.5,
    },
    communication: {
      register: "conversational", output_format: "prose", emoji_policy: "never",
      reasoning_transparency: "on_request", conflict_approach: "direct_but_kind", uncertainty_handling: "transparent",
    },
    domain: { expertise: [], boundaries: { refuses: [], escalation_triggers: [], hard_limits: [] } },
    growth: { areas: [], patterns_to_watch: [], strengths: [] },
  };
}

describe("Embodiment Compiler", () => {
  describe("computeMotionParameters", () => {
    it("high extraversion → high gesture speed, frequency, approach", () => {
      const params = computeMotionParameters(withHighDimension("extraversion"));
      expect(params.gesture_speed).toBeGreaterThan(0.6);
      expect(params.gesture_frequency).toBeGreaterThan(0.6);
      expect(params.approach_distance).toBeGreaterThan(0.6);
      expect(params.voice_volume).toBeGreaterThan(0.6);
    });

    it("high agreeableness → high postural openness, smile, head tilt", () => {
      const params = computeMotionParameters(withHighDimension("agreeableness"));
      expect(params.postural_openness).toBeGreaterThan(0.6);
      expect(params.smile_frequency).toBeGreaterThan(0.6);
      expect(params.head_tilt_tendency).toBeGreaterThan(0.6);
    });

    it("high conscientiousness → high movement smoothness, low trajectory variability", () => {
      const params = computeMotionParameters(withHighDimension("conscientiousness"));
      expect(params.movement_smoothness).toBeGreaterThan(0.6);
      expect(params.trajectory_variability).toBeLessThan(0.4);
    });

    it("high emotional stability → high smoothness, low idle animation", () => {
      const params = computeMotionParameters(withHighDimension("emotional_stability"));
      expect(params.movement_smoothness).toBeGreaterThan(0.6);
      expect(params.idle_animation_frequency).toBeLessThan(0.4);
    });

    it("high openness → high spatial exploration, trajectory variability", () => {
      const params = computeMotionParameters(withHighDimension("openness"));
      expect(params.spatial_exploration).toBeGreaterThan(0.6);
      expect(params.trajectory_variability).toBeGreaterThan(0.6);
    });

    it("all outputs are between 0 and 1", () => {
      // Even with extreme values (all 1.0)
      const params = computeMotionParameters(uniformBigFive(1.0));
      for (const [key, val] of Object.entries(params)) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    });

    it("all zeros produce all-zero outputs", () => {
      const params = computeMotionParameters(uniformBigFive(0));
      for (const [key, val] of Object.entries(params)) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("computeGazePolicy", () => {
    it("high assertiveness + empathy → high contact ratio", () => {
      const gaze = computeGazePolicy(withHighDimension("extraversion"));
      expect(gaze.contact_ratio).toBeGreaterThan(0.5);
    });

    it("high emotional regulation → look_away aversion", () => {
      const gaze = computeGazePolicy(withHighDimension("emotional_stability"));
      expect(gaze.aversion_style).toBe("look_away");
    });
  });

  describe("computeProxemics", () => {
    it("returns valid proxemic zone", () => {
      const prox = computeProxemics(uniformBigFive(0.5));
      expect(["intimate", "personal", "social", "adaptive"]).toContain(prox.preferred_zone);
      expect(prox.intimate_m).toBe(0.45);
      expect(prox.personal_m).toBe(1.2);
    });
  });

  describe("computeProsody", () => {
    it("high extraversion → faster speaking rate", () => {
      const prosody = computeProsody(withHighDimension("extraversion"));
      const baseline = computeProsody(uniformBigFive(0.3));
      expect(prosody.speaking_rate_wpm).toBeGreaterThan(baseline.speaking_rate_wpm);
    });

    it("speaking rate is within human range", () => {
      const fast = computeProsody(uniformBigFive(1.0));
      const slow = computeProsody(uniformBigFive(0.0));
      expect(fast.speaking_rate_wpm).toBeLessThanOrEqual(200);
      expect(slow.speaking_rate_wpm).toBeGreaterThanOrEqual(100);
    });
  });

  describe("computeSyncProfile", () => {
    it("assertive agents lead gestures more aggressively", () => {
      const highE = withHighDimension("extraversion");
      const lowE = uniformBigFive(0.2);
      const syncHigh = computeSyncProfile(highE);
      const syncLow = computeSyncProfile(lowE);
      expect(syncHigh.default_gesture_lead_ms).toBeGreaterThan(syncLow.default_gesture_lead_ms);
    });

    it("blink rate is within human range", () => {
      const sync = computeSyncProfile(uniformBigFive(0.5));
      expect(sync.blink_rate_per_min).toBeGreaterThanOrEqual(12);
      expect(sync.blink_rate_per_min).toBeLessThanOrEqual(28);
    });

    it("high empathy → at_speaker gaze during listen", () => {
      const sync = computeSyncProfile(withHighDimension("agreeableness"));
      expect(sync.gaze_during_listen).toBe("at_speaker");
    });
  });

  describe("compileEmbodied", () => {
    it("returns all required fields", () => {
      const spec = makeSpec(uniformBigFive(0.5));
      const config = compileEmbodied(spec, "anthropic");

      expect(config.surface).toBe("embodied");
      expect(config.provider).toBe("anthropic");
      expect(config.system_prompt).toBeTruthy();
      expect(config.temperature).toBeGreaterThan(0);
      expect(config.motion_parameters).toBeDefined();
      expect(config.safety_envelope).toBeDefined();
      expect(config.active_modalities).toBeDefined();
      expect(config.gaze).toBeDefined();
      expect(config.proxemics).toBeDefined();
      expect(config.haptics).toBeDefined();
      expect(config.prosody).toBeDefined();
    });

    it("uses spec expression overrides when provided", () => {
      const spec = makeSpec(uniformBigFive(0.5));
      spec.expression = {
        gaze: { contact_ratio: 0.99, aversion_style: "blink", tracking_mode: "ambient" },
        proxemics: { intimate_m: 0.45, personal_m: 1.2, social_m: 3.6, preferred_zone: "social" },
        haptics: { touch_permitted: true, requires_consent: false, allowed_contacts: ["handshake"], max_force_n: 3 },
        prosody: { pitch_variation: 0.9, speaking_rate_wpm: 180, volume_db_offset: 2, pause_tendency: 0.2 },
        gesture_vocabulary: [],
        facial_expressiveness: 0.8,
      };
      const config = compileEmbodied(spec, "anthropic");
      expect(config.gaze.contact_ratio).toBe(0.99);
      expect(config.proxemics.preferred_zone).toBe("social");
      expect(config.haptics.touch_permitted).toBe(true);
      expect(config.prosody.speaking_rate_wpm).toBe(180);
    });

    it("uses spec safety envelope when provided", () => {
      const spec = makeSpec(uniformBigFive(0.5));
      spec.embodiment = {
        morphology: "humanoid",
        modalities: ["gesture", "voice"],
        safety_envelope: {
          max_linear_speed_m_s: 0.8,
          max_angular_speed_rad_s: 1.0,
          min_proximity_m: 0.5,
          max_contact_force_n: 5,
          emergency_stop_decel_m_s2: 3.0,
        },
      };
      const config = compileEmbodied(spec, "anthropic");
      expect(config.safety_envelope.max_linear_speed_m_s).toBe(0.8);
      expect(config.safety_envelope.min_proximity_m).toBe(0.5);
      expect(config.active_modalities).toEqual(["gesture", "voice"]);
    });

    it("motion parameters are all within 0-1", () => {
      const spec = makeSpec(uniformBigFive(1.0));
      const config = compileEmbodied(spec, "anthropic");
      for (const [key, val] of Object.entries(config.motion_parameters)) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    });
  });
});
