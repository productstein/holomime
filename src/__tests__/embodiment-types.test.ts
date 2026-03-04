import { describe, it, expect } from "vitest";
import {
  embodimentSchema,
  expressionSchema,
  safetyEnvelopeSchema,
  physicalSafetySchema,
  motionParametersSchema,
  gazePolicySchema,
  proxemicZoneSchema,
  hapticPolicySchema,
  prosodySchema,
  gestureSchema,
  compiledEmbodiedConfigSchema,
} from "../core/embodiment-types.js";
import { syncProfileSchema, syncRuleSchema } from "../core/embodiment-sync.js";
import { personalitySpecSchema } from "../core/types.js";

describe("Embodiment Types", () => {
  describe("backward compatibility", () => {
    it("existing personality spec without embodiment still validates", () => {
      const spec = {
        version: "2.0",
        name: "TestAgent",
        handle: "test-agent",
        big_five: {
          openness: { score: 0.5, facets: { imagination: 0.5, intellectual_curiosity: 0.5, aesthetic_sensitivity: 0.5, willingness_to_experiment: 0.5 } },
          conscientiousness: { score: 0.5, facets: { self_discipline: 0.5, orderliness: 0.5, goal_orientation: 0.5, attention_to_detail: 0.5 } },
          extraversion: { score: 0.5, facets: { assertiveness: 0.5, enthusiasm: 0.5, sociability: 0.5, initiative: 0.5 } },
          agreeableness: { score: 0.5, facets: { warmth: 0.5, empathy: 0.5, cooperation: 0.5, trust_tendency: 0.5 } },
          emotional_stability: { score: 0.5, facets: { stress_tolerance: 0.5, emotional_regulation: 0.5, confidence: 0.5, adaptability: 0.5 } },
        },
        therapy_dimensions: {
          self_awareness: 0.5, distress_tolerance: 0.5, attachment_style: "secure",
          learning_orientation: "growth", boundary_awareness: 0.5, interpersonal_sensitivity: 0.5,
        },
      };
      const result = personalitySpecSchema.safeParse(spec);
      expect(result.success).toBe(true);
    });

    it("personality spec with embodiment validates", () => {
      const spec = {
        version: "2.0",
        name: "RobotAgent",
        handle: "robot-agent",
        big_five: {
          openness: { score: 0.5, facets: { imagination: 0.5, intellectual_curiosity: 0.5, aesthetic_sensitivity: 0.5, willingness_to_experiment: 0.5 } },
          conscientiousness: { score: 0.5, facets: { self_discipline: 0.5, orderliness: 0.5, goal_orientation: 0.5, attention_to_detail: 0.5 } },
          extraversion: { score: 0.5, facets: { assertiveness: 0.5, enthusiasm: 0.5, sociability: 0.5, initiative: 0.5 } },
          agreeableness: { score: 0.5, facets: { warmth: 0.5, empathy: 0.5, cooperation: 0.5, trust_tendency: 0.5 } },
          emotional_stability: { score: 0.5, facets: { stress_tolerance: 0.5, emotional_regulation: 0.5, confidence: 0.5, adaptability: 0.5 } },
        },
        therapy_dimensions: {
          self_awareness: 0.5, distress_tolerance: 0.5, attachment_style: "secure",
          learning_orientation: "growth", boundary_awareness: 0.5, interpersonal_sensitivity: 0.5,
        },
        embodiment: {
          morphology: "humanoid",
          modalities: ["gesture", "gaze", "voice"],
        },
        expression: {
          gaze: { contact_ratio: 0.7 },
          proxemics: { preferred_zone: "personal" },
        },
      };
      const result = personalitySpecSchema.safeParse(spec);
      expect(result.success).toBe(true);
    });
  });

  describe("embodimentSchema", () => {
    it("fills defaults correctly", () => {
      const result = embodimentSchema.parse({});
      expect(result.morphology).toBe("humanoid");
      expect(result.modalities).toEqual(["gesture", "gaze", "voice", "posture"]);
      expect(result.safety_envelope.max_linear_speed_m_s).toBe(1.5);
    });

    it("accepts all morphology types", () => {
      for (const morph of ["humanoid", "humanoid_upper", "quadruped", "wheeled", "fixed", "swarm_unit", "avatar", "custom"]) {
        const result = embodimentSchema.parse({ morphology: morph });
        expect(result.morphology).toBe(morph);
      }
    });
  });

  describe("safetyEnvelopeSchema", () => {
    it("rejects negative speeds", () => {
      const result = safetyEnvelopeSchema.safeParse({ max_linear_speed_m_s: -1 });
      expect(result.success).toBe(false);
    });

    it("rejects negative force", () => {
      const result = safetyEnvelopeSchema.safeParse({ max_contact_force_n: -5 });
      expect(result.success).toBe(false);
    });

    it("fills sensible defaults", () => {
      const result = safetyEnvelopeSchema.parse({});
      expect(result.max_linear_speed_m_s).toBe(1.5);
      expect(result.min_proximity_m).toBe(0.3);
      expect(result.max_contact_force_n).toBe(10);
      expect(result.emergency_stop_decel_m_s2).toBe(5.0);
    });
  });

  describe("expressionSchema", () => {
    it("round-trips through parse", () => {
      const input = {
        gaze: { contact_ratio: 0.8, aversion_style: "look_down" as const, tracking_mode: "speaker" as const },
        proxemics: { preferred_zone: "social" as const },
        haptics: { touch_permitted: true, allowed_contacts: ["handshake" as const] },
        prosody: { speaking_rate_wpm: 160, pitch_variation: 0.7 },
        facial_expressiveness: 0.8,
      };
      const parsed = expressionSchema.parse(input);
      expect(parsed.gaze.contact_ratio).toBe(0.8);
      expect(parsed.proxemics.preferred_zone).toBe("social");
      expect(parsed.haptics.touch_permitted).toBe(true);
      expect(parsed.prosody.speaking_rate_wpm).toBe(160);
      expect(parsed.facial_expressiveness).toBe(0.8);
    });

    it("fills defaults for empty input", () => {
      const parsed = expressionSchema.parse({});
      expect(parsed.gaze.contact_ratio).toBe(0.6);
      expect(parsed.proxemics.preferred_zone).toBe("personal");
      expect(parsed.haptics.touch_permitted).toBe(false);
      expect(parsed.facial_expressiveness).toBe(0.5);
    });
  });

  describe("physicalSafetySchema", () => {
    it("has sensible defaults", () => {
      const parsed = physicalSafetySchema.parse({});
      expect(parsed.hard_limits.length).toBeGreaterThan(0);
      expect(parsed.collision_response).toBe("stop");
      expect(parsed.unattended_policy).toBe("idle");
      expect(parsed.require_consent_for).toContain("haptic_contact");
    });
  });

  describe("gestureSchema", () => {
    it("validates a gesture", () => {
      const gesture = {
        id: "wave",
        category: "conversational" as const,
        modalities: ["gesture" as const],
      };
      const parsed = gestureSchema.parse(gesture);
      expect(parsed.id).toBe("wave");
      expect(parsed.intensity_range).toEqual([0.3, 0.8]);
      expect(parsed.requires_consent).toBe(false);
    });
  });

  describe("syncProfileSchema", () => {
    it("fills defaults", () => {
      const parsed = syncProfileSchema.parse({});
      expect(parsed.default_gesture_lead_ms).toBe(100);
      expect(parsed.blink_rate_per_min).toBe(17);
      expect(parsed.turn_taking_signals.yield.length).toBeGreaterThan(0);
    });
  });

  describe("motionParametersSchema", () => {
    it("rejects values outside 0-1", () => {
      const params: Record<string, number> = {};
      const keys = [
        "base_speed", "gesture_speed", "gesture_amplitude", "gesture_frequency",
        "approach_distance", "spatial_exploration", "movement_smoothness", "trajectory_variability",
        "response_latency", "idle_animation_frequency", "gaze_contact_ratio", "head_tilt_tendency",
        "postural_openness", "smile_frequency", "voice_volume", "speaking_rate", "pitch_variation", "pause_duration",
      ];
      for (const key of keys) {
        params[key] = 0.5;
      }
      params.base_speed = 1.5; // out of range
      const result = motionParametersSchema.safeParse(params);
      expect(result.success).toBe(false);
    });
  });
});
