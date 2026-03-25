import { describe, it, expect } from "vitest";
import {
  BehavioralFeedbackController,
  DEFAULT_CONTROLLER_CONFIG,
} from "../core/feedback-controller.js";
import type { BigFive } from "../core/types.js";

// ─── Test Fixtures ──────────────────────────────────────────

function createTargetPersonality(overrides: Partial<Record<string, number>> = {}): BigFive {
  const defaults = {
    openness: 0.7,
    conscientiousness: 0.8,
    extraversion: 0.5,
    agreeableness: 0.6,
    emotional_stability: 0.75,
  };
  const scores = { ...defaults, ...overrides };

  return {
    openness: {
      score: scores.openness,
      facets: { imagination: 0.7, intellectual_curiosity: 0.7, aesthetic_sensitivity: 0.7, willingness_to_experiment: 0.7 },
    },
    conscientiousness: {
      score: scores.conscientiousness,
      facets: { self_discipline: 0.8, orderliness: 0.8, goal_orientation: 0.8, attention_to_detail: 0.8 },
    },
    extraversion: {
      score: scores.extraversion,
      facets: { assertiveness: 0.5, enthusiasm: 0.5, sociability: 0.5, initiative: 0.5 },
    },
    agreeableness: {
      score: scores.agreeableness,
      facets: { warmth: 0.6, empathy: 0.6, cooperation: 0.6, trust_tendency: 0.6 },
    },
    emotional_stability: {
      score: scores.emotional_stability,
      facets: { stress_tolerance: 0.75, emotional_regulation: 0.75, confidence: 0.75, adaptability: 0.75 },
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe("BehavioralFeedbackController", () => {
  describe("error computation", () => {
    it("computes zero error when measured matches set point", () => {
      const personality = createTargetPersonality();
      const controller = new BehavioralFeedbackController(personality);

      // Feed measurements that exactly match the target
      controller.update({
        openness: 0.7,
        conscientiousness: 0.8,
        extraversion: 0.5,
        agreeableness: 0.6,
        emotional_stability: 0.75,
      });

      const state = controller.getControllerState();
      expect(state.error.openness).toBeCloseTo(0, 10);
      expect(state.error.conscientiousness).toBeCloseTo(0, 10);
      expect(state.error.extraversion).toBeCloseTo(0, 10);
      expect(state.error.agreeableness).toBeCloseTo(0, 10);
      expect(state.error.emotional_stability).toBeCloseTo(0, 10);
      expect(state.correctionSignal).toBeCloseTo(0, 10);
    });

    it("computes positive error when trait is suppressed (below target)", () => {
      const personality = createTargetPersonality();
      const controller = new BehavioralFeedbackController(personality);

      controller.update({
        openness: 0.4, // target 0.7 -> error = +0.3
        conscientiousness: 0.8,
        extraversion: 0.5,
        agreeableness: 0.6,
        emotional_stability: 0.75,
      });

      const state = controller.getControllerState();
      expect(state.error.openness).toBeCloseTo(0.3, 5);
    });

    it("computes negative error when trait is elevated (above target)", () => {
      const personality = createTargetPersonality();
      const controller = new BehavioralFeedbackController(personality);

      controller.update({
        openness: 0.7,
        conscientiousness: 0.8,
        extraversion: 0.9, // target 0.5 -> error = -0.4
        agreeableness: 0.6,
        emotional_stability: 0.75,
      });

      const state = controller.getControllerState();
      expect(state.error.extraversion).toBeCloseTo(-0.4, 5);
    });

    it("produces nonzero correction signal for drifted traits", () => {
      const personality = createTargetPersonality();
      const controller = new BehavioralFeedbackController(personality);

      controller.update({
        openness: 0.4,
        conscientiousness: 0.4,
        extraversion: 0.9,
        agreeableness: 0.2,
        emotional_stability: 0.3,
      });

      const state = controller.getControllerState();
      expect(state.correctionSignal).toBeGreaterThan(0);
    });
  });

  describe("threshold triggers therapy", () => {
    it("does not trigger therapy when all traits match", () => {
      const personality = createTargetPersonality();
      const controller = new BehavioralFeedbackController(personality);

      controller.update({
        openness: 0.7,
        conscientiousness: 0.8,
        extraversion: 0.5,
        agreeableness: 0.6,
        emotional_stability: 0.75,
      });

      expect(controller.shouldTriggerTherapy()).toBe(false);
    });

    it("triggers therapy when drift exceeds threshold", () => {
      const personality = createTargetPersonality();
      const controller = new BehavioralFeedbackController(personality, {
        correctionThreshold: 0.1,
      });

      // Large drift across all traits
      controller.update({
        openness: 0.2,
        conscientiousness: 0.3,
        extraversion: 0.9,
        agreeableness: 0.1,
        emotional_stability: 0.2,
      });

      expect(controller.shouldTriggerTherapy()).toBe(true);
    });

    it("does not trigger therapy for small drift below threshold", () => {
      const personality = createTargetPersonality();
      const controller = new BehavioralFeedbackController(personality, {
        correctionThreshold: 0.5,
      });

      // Small drift
      controller.update({
        openness: 0.68,
        conscientiousness: 0.78,
        extraversion: 0.52,
        agreeableness: 0.58,
        emotional_stability: 0.73,
      });

      expect(controller.shouldTriggerTherapy()).toBe(false);
    });
  });

  describe("integral accumulation", () => {
    it("accumulates integral error over repeated updates", () => {
      const personality = createTargetPersonality();
      const controller = new BehavioralFeedbackController(personality);

      const driftedMeasurements = {
        openness: 0.4,
        conscientiousness: 0.8,
        extraversion: 0.5,
        agreeableness: 0.6,
        emotional_stability: 0.75,
      };

      // First update
      controller.update(driftedMeasurements);
      const state1 = controller.getControllerState();
      const integral1 = state1.integralError.openness;

      // Second update with same drift
      controller.update(driftedMeasurements);
      const state2 = controller.getControllerState();
      const integral2 = state2.integralError.openness;

      // Integral should accumulate
      expect(integral2).toBeGreaterThan(integral1);
    });

    it("integral error is clamped to prevent windup", () => {
      const personality = createTargetPersonality();
      const controller = new BehavioralFeedbackController(personality);

      // Feed extreme drift many times
      for (let i = 0; i < 100; i++) {
        controller.update({
          openness: 0.0,
          conscientiousness: 0.8,
          extraversion: 0.5,
          agreeableness: 0.6,
          emotional_stability: 0.75,
        });
      }

      const state = controller.getControllerState();
      // Integral should be clamped at 1.0
      expect(state.integralError.openness).toBeLessThanOrEqual(1.0);
      expect(state.integralError.openness).toBeGreaterThanOrEqual(-1.0);
    });
  });

  describe("reset", () => {
    it("clears all error and integral state", () => {
      const personality = createTargetPersonality();
      const controller = new BehavioralFeedbackController(personality);

      // Drift and accumulate errors
      controller.update({
        openness: 0.2,
        conscientiousness: 0.3,
        extraversion: 0.9,
        agreeableness: 0.1,
        emotional_stability: 0.2,
      });
      controller.update({
        openness: 0.2,
        conscientiousness: 0.3,
        extraversion: 0.9,
        agreeableness: 0.1,
        emotional_stability: 0.2,
      });

      expect(controller.shouldTriggerTherapy()).toBe(true);
      expect(controller.getUpdateCount()).toBe(2);

      // Reset
      controller.reset();

      const state = controller.getControllerState();
      expect(state.correctionSignal).toBe(0);
      expect(state.shouldCorrect).toBe(false);
      expect(state.error.openness).toBe(0);
      expect(state.integralError.openness).toBe(0);
      expect(state.previousError.openness).toBe(0);
      expect(controller.getUpdateCount()).toBe(0);
    });
  });

  describe("correction priorities", () => {
    it("returns traits sorted by error magnitude", () => {
      const personality = createTargetPersonality();
      const controller = new BehavioralFeedbackController(personality);

      controller.update({
        openness: 0.4,          // delta = 0.3
        conscientiousness: 0.8, // delta = 0
        extraversion: 0.1,      // delta = 0.4
        agreeableness: 0.5,     // delta = 0.1
        emotional_stability: 0.75, // delta = 0
      });

      const priorities = controller.getCorrectionPriorities();

      // Should be sorted by magnitude descending
      expect(priorities.length).toBeGreaterThanOrEqual(2);
      expect(priorities[0].trait).toBe("extraversion");
      expect(priorities[0].errorMagnitude).toBeCloseTo(0.4, 5);
      expect(priorities[0].direction).toBe("suppressed");
      expect(priorities[1].trait).toBe("openness");
      expect(priorities[1].errorMagnitude).toBeCloseTo(0.3, 5);
    });

    it("labels elevated traits correctly", () => {
      const personality = createTargetPersonality();
      const controller = new BehavioralFeedbackController(personality);

      controller.update({
        openness: 0.7,
        conscientiousness: 0.8,
        extraversion: 0.95, // target 0.5 -> elevated
        agreeableness: 0.6,
        emotional_stability: 0.75,
      });

      const priorities = controller.getCorrectionPriorities();
      const ext = priorities.find(p => p.trait === "extraversion");
      expect(ext).toBeDefined();
      expect(ext!.direction).toBe("elevated");
    });

    it("omits traits with negligible error", () => {
      const personality = createTargetPersonality();
      const controller = new BehavioralFeedbackController(personality);

      controller.update({
        openness: 0.7,
        conscientiousness: 0.8,
        extraversion: 0.5,
        agreeableness: 0.6,
        emotional_stability: 0.75,
      });

      const priorities = controller.getCorrectionPriorities();
      expect(priorities).toHaveLength(0);
    });
  });

  describe("controller state", () => {
    it("returns set point matching target personality", () => {
      const personality = createTargetPersonality({ openness: 0.9 });
      const controller = new BehavioralFeedbackController(personality);

      const state = controller.getControllerState();
      expect(state.setPoint.openness).toBe(0.9);
      expect(state.setPoint.conscientiousness).toBe(0.8);
    });

    it("clamps measured values to 0-1", () => {
      const personality = createTargetPersonality();
      const controller = new BehavioralFeedbackController(personality);

      controller.update({ openness: 1.5, conscientiousness: -0.3 });

      const state = controller.getControllerState();
      expect(state.measured.openness).toBe(1.0);
      expect(state.measured.conscientiousness).toBe(0.0);
    });
  });

  describe("derivative sensitivity", () => {
    it("produces different correction signals for sudden vs gradual drift", () => {
      const personality = createTargetPersonality();

      // Sudden drift controller
      const sudden = new BehavioralFeedbackController(personality, { derivativeGain: 0.5 });
      sudden.update({
        openness: 0.7, conscientiousness: 0.8, extraversion: 0.5,
        agreeableness: 0.6, emotional_stability: 0.75,
      });
      sudden.update({
        openness: 0.2, conscientiousness: 0.8, extraversion: 0.5,
        agreeableness: 0.6, emotional_stability: 0.75,
      });
      const suddenSignal = sudden.getControllerState().correctionSignal;

      // Gradual drift controller
      const gradual = new BehavioralFeedbackController(personality, { derivativeGain: 0.5 });
      gradual.update({
        openness: 0.6, conscientiousness: 0.8, extraversion: 0.5,
        agreeableness: 0.6, emotional_stability: 0.75,
      });
      gradual.update({
        openness: 0.5, conscientiousness: 0.8, extraversion: 0.5,
        agreeableness: 0.6, emotional_stability: 0.75,
      });
      const gradualSignal = gradual.getControllerState().correctionSignal;

      // Sudden drift should produce a stronger correction signal
      expect(suddenSignal).toBeGreaterThan(gradualSignal);
    });
  });

  describe("config", () => {
    it("uses default config when none provided", () => {
      const controller = new BehavioralFeedbackController(createTargetPersonality());
      const config = controller.getConfig();
      expect(config.proportionalGain).toBe(DEFAULT_CONTROLLER_CONFIG.proportionalGain);
      expect(config.integralGain).toBe(DEFAULT_CONTROLLER_CONFIG.integralGain);
      expect(config.derivativeGain).toBe(DEFAULT_CONTROLLER_CONFIG.derivativeGain);
      expect(config.correctionThreshold).toBe(DEFAULT_CONTROLLER_CONFIG.correctionThreshold);
    });

    it("allows partial config override", () => {
      const controller = new BehavioralFeedbackController(
        createTargetPersonality(),
        { proportionalGain: 0.9, correctionThreshold: 0.5 },
      );
      const config = controller.getConfig();
      expect(config.proportionalGain).toBe(0.9);
      expect(config.correctionThreshold).toBe(0.5);
      // Others remain default
      expect(config.integralGain).toBe(DEFAULT_CONTROLLER_CONFIG.integralGain);
    });
  });
});
