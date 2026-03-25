import { describe, it, expect } from "vitest";
import {
  mapPersonalityToMotionStyle,
  generateMotionConstraints,
  buildMotionRequest,
} from "../integrations/kimodo-personality-mapper.js";
import type { BigFive } from "../core/types.js";

const mockBigFive: BigFive = {
  openness: {
    score: 0.7,
    facets: {
      imagination: 0.8,
      intellectual_curiosity: 0.75,
      aesthetic_sensitivity: 0.6,
      willingness_to_experiment: 0.65,
    },
  },
  conscientiousness: {
    score: 0.8,
    facets: {
      self_discipline: 0.85,
      orderliness: 0.9,
      goal_orientation: 0.75,
      attention_to_detail: 0.8,
    },
  },
  extraversion: {
    score: 0.5,
    facets: {
      assertiveness: 0.45,
      enthusiasm: 0.55,
      sociability: 0.5,
      initiative: 0.5,
    },
  },
  agreeableness: {
    score: 0.75,
    facets: {
      warmth: 0.8,
      empathy: 0.7,
      cooperation: 0.75,
      trust_tendency: 0.7,
    },
  },
  emotional_stability: {
    score: 0.7,
    facets: {
      stress_tolerance: 0.65,
      emotional_regulation: 0.75,
      confidence: 0.7,
      adaptability: 0.7,
    },
  },
};

describe("kimodo-personality-mapper", () => {
  it("maps Big Five to motion style", () => {
    const style = mapPersonalityToMotionStyle(mockBigFive);

    expect(style.approachGentleness).toBeGreaterThan(0);
    expect(style.approachGentleness).toBeLessThanOrEqual(1);
    expect(style.movementPrecision).toBeGreaterThan(0.3);
    expect(style.gestureAmplitude).toBeGreaterThan(0.2);
    expect(style.motionSmoothness).toBeGreaterThan(0.4);
    expect(style.paceMultiplier).toBeGreaterThan(0.3);
    expect(style.paceMultiplier).toBeLessThanOrEqual(1.5);
  });

  it("high agreeableness produces gentler approach", () => {
    const gentle = { ...mockBigFive, agreeableness: { score: 0.95, facets: { warmth: 0.95, empathy: 0.9, cooperation: 0.95, trust_tendency: 0.9 } } };
    const harsh = { ...mockBigFive, agreeableness: { score: 0.2, facets: { warmth: 0.15, empathy: 0.2, cooperation: 0.15, trust_tendency: 0.2 } } };

    const gentleStyle = mapPersonalityToMotionStyle(gentle);
    const harshStyle = mapPersonalityToMotionStyle(harsh);

    expect(gentleStyle.approachGentleness).toBeGreaterThan(harshStyle.approachGentleness);
  });

  it("high extraversion produces larger gestures", () => {
    const expressive = { ...mockBigFive, extraversion: { score: 0.9, facets: { assertiveness: 0.9, enthusiasm: 0.9, sociability: 0.85, initiative: 0.85 } } };
    const reserved = { ...mockBigFive, extraversion: { score: 0.1, facets: { assertiveness: 0.1, enthusiasm: 0.1, sociability: 0.15, initiative: 0.1 } } };

    const expressiveStyle = mapPersonalityToMotionStyle(expressive);
    const reservedStyle = mapPersonalityToMotionStyle(reserved);

    expect(expressiveStyle.gestureAmplitude).toBeGreaterThan(reservedStyle.gestureAmplitude);
  });

  it("generates motion constraints", () => {
    const style = mapPersonalityToMotionStyle(mockBigFive);
    const constraints = generateMotionConstraints(style, {
      max_linear_speed_m_s: 2.0,
      max_contact_force_n: 30,
      min_proximity_m: 0.5,
    });

    expect(constraints.length).toBeGreaterThanOrEqual(2);
    expect(constraints.some((c) => c.type === "root_waypoint_2d")).toBe(true);
    expect(constraints.some((c) => c.type === "full_body_joint")).toBe(true);
  });

  it("builds a complete motion request", () => {
    const request = buildMotionRequest(
      "Walk to the patient and offer medication",
      mockBigFive,
      { model: "G1", duration: 5 },
    );

    expect(request.prompt).toBe("Walk to the patient and offer medication");
    expect(request.model).toBe("G1");
    expect(request.duration).toBe(5);
    expect(request.style.approachGentleness).toBeGreaterThan(0);
    expect(request.constraints.length).toBeGreaterThan(0);
  });

  it("respects safety envelope in constraints", () => {
    const style = mapPersonalityToMotionStyle(mockBigFive);
    const constraints = generateMotionConstraints(style, {
      max_linear_speed_m_s: 1.5,
      min_proximity_m: 0.8,
    });

    const speedConstraint = constraints.find((c) => c.type === "root_waypoint_2d");
    expect(speedConstraint!.parameters.max_speed).toBeLessThanOrEqual(1.5 * 1.5); // max_speed * max pace
  });
});
