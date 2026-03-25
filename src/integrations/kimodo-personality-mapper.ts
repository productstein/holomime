/**
 * Kimodo Personality Mapper — Maps Big Five personality dimensions
 * to NVIDIA Kimodo motion style parameters.
 *
 * Kimodo generates humanoid motion from text descriptions.
 * This mapper translates abstract personality traits into concrete
 * motion constraints: how fast, how smooth, how expressive.
 *
 * Released: March 25, 2026
 * Supports: G1 (Unitree), SOMA, SMPL-X body models
 */

import type { BigFive } from "../core/types.js";

// ─── Motion Style Parameters ──────────────────────────────

export interface KimodoMotionStyle {
  /** 0-1. From agreeableness. Higher = slower, gentler approach to humans. */
  approachGentleness: number;
  /** 0-1. From conscientiousness. Higher = more precise, deliberate movements. */
  movementPrecision: number;
  /** 0-1. From extraversion. Higher = larger, more expressive gestures. */
  gestureAmplitude: number;
  /** 0-1. From emotional_stability. Higher = smoother transitions, less jitter. */
  motionSmoothness: number;
  /** 0-1. From openness. Higher = more varied movement patterns. */
  movementVariety: number;
  /** Overall pace multiplier. 0.5 = half speed, 1.0 = normal, 1.5 = fast. */
  paceMultiplier: number;
}

// ─── Kimodo Constraint Types ──────────────────────────────

export interface KimodoConstraint {
  type: "full_body_joint" | "root_waypoint_2d" | "end_effector";
  description: string;
  parameters: Record<string, number>;
}

export interface KimodoMotionRequest {
  /** Natural language motion description. */
  prompt: string;
  /** Body model to use. */
  model: "G1" | "SOMA" | "SMPL-X";
  /** Motion style derived from personality. */
  style: KimodoMotionStyle;
  /** Physical constraints from body.api safety envelope. */
  constraints: KimodoConstraint[];
  /** Duration in seconds. */
  duration?: number;
}

// ─── Mapping Function ─────────────────────────────────────

/**
 * Map Big Five personality scores to Kimodo motion style parameters.
 *
 * The mapping controls HOW the robot moves, not WHAT it does.
 * A high-agreeableness robot approaches gently. A high-extraversion
 * robot gestures broadly. A high-conscientiousness robot moves precisely.
 *
 * @param bigFive - Big Five personality scores from PersonalitySpec
 * @returns Motion style parameters for Kimodo
 */
export function mapPersonalityToMotionStyle(bigFive: BigFive): KimodoMotionStyle {
  // ── Agreeableness → Approach Gentleness ──────────────────
  // Higher agreeableness = slower, more careful approach to people/objects.
  const agreeFacets = bigFive.agreeableness.facets;
  const gentleness = (agreeFacets.cooperation + agreeFacets.warmth) / 2;
  const approachGentleness = Math.sqrt(gentleness); // Gentle by default

  // ── Conscientiousness → Movement Precision ────────────────
  // Higher conscientiousness = more deliberate, precise movements.
  const consFacets = bigFive.conscientiousness.facets;
  const precisionDrive = (consFacets.attention_to_detail + consFacets.orderliness) / 2;
  const movementPrecision = 0.3 + (precisionDrive * 0.7);

  // ── Extraversion → Gesture Amplitude ──────────────────────
  // Higher extraversion = bigger, more expressive gestures.
  const extraFacets = bigFive.extraversion.facets;
  const expressiveness = (extraFacets.enthusiasm + extraFacets.assertiveness) / 2;
  const gestureAmplitude = 0.2 + (expressiveness * 0.8);

  // ── Emotional Stability → Motion Smoothness ────────────────
  // Higher stability = smoother transitions, less reactive jitter.
  const stabilityFacets = bigFive.emotional_stability.facets;
  const smoothnessDrive = (stabilityFacets.stress_tolerance + stabilityFacets.adaptability) / 2;
  const motionSmoothness = 0.4 + (smoothnessDrive * 0.6);

  // ── Openness → Movement Variety ────────────────────────────
  // Higher openness = more varied, less repetitive movement patterns.
  const openFacets = bigFive.openness.facets;
  const varietyDrive = (openFacets.willingness_to_experiment + openFacets.imagination) / 2;
  const movementVariety = 0.1 + (varietyDrive * 0.6); // Capped — safety first

  // ── Pace Multiplier ─────────────────────────────────────────
  // Derived from extraversion (speed) modulated by agreeableness (caution).
  const rawPace = 0.7 + (extraFacets.initiative * 0.6);
  const paceMultiplier = rawPace * (1 - (approachGentleness * 0.3)); // Gentle agents are slower

  return {
    approachGentleness,
    movementPrecision,
    gestureAmplitude,
    motionSmoothness,
    movementVariety,
    paceMultiplier: Math.max(0.3, Math.min(1.5, paceMultiplier)),
  };
}

/**
 * Generate Kimodo-compatible constraints from personality + safety envelope.
 *
 * Combines behavioral intent (from personality) with physical limits
 * (from body.api safety envelope) into Kimodo constraint format.
 */
export function generateMotionConstraints(
  style: KimodoMotionStyle,
  safetyEnvelope?: {
    max_linear_speed_m_s?: number;
    max_contact_force_n?: number;
    min_proximity_m?: number;
  },
): KimodoConstraint[] {
  const constraints: KimodoConstraint[] = [];

  // Speed constraint from personality + safety
  const maxSpeed = safetyEnvelope?.max_linear_speed_m_s ?? 2.0;
  constraints.push({
    type: "root_waypoint_2d",
    description: "Personality-adjusted movement speed",
    parameters: {
      max_speed: maxSpeed * style.paceMultiplier,
      smoothing: style.motionSmoothness,
    },
  });

  // Approach constraint from gentleness
  if (safetyEnvelope?.min_proximity_m) {
    constraints.push({
      type: "end_effector",
      description: "Personality-adjusted approach distance",
      parameters: {
        min_distance: safetyEnvelope.min_proximity_m * (1 + (style.approachGentleness * 0.5)),
        approach_speed_scale: 1 - (style.approachGentleness * 0.6),
      },
    });
  }

  // Gesture constraint from amplitude
  constraints.push({
    type: "full_body_joint",
    description: "Personality-adjusted gesture range",
    parameters: {
      amplitude_scale: style.gestureAmplitude,
      precision_scale: style.movementPrecision,
      variety_scale: style.movementVariety,
    },
  });

  return constraints;
}

/**
 * Build a complete Kimodo motion request from personality + intent.
 */
export function buildMotionRequest(
  prompt: string,
  bigFive: BigFive,
  options?: {
    model?: "G1" | "SOMA" | "SMPL-X";
    duration?: number;
    safetyEnvelope?: Record<string, unknown>;
  },
): KimodoMotionRequest {
  const style = mapPersonalityToMotionStyle(bigFive);
  const constraints = generateMotionConstraints(style, options?.safetyEnvelope as any);

  return {
    prompt,
    model: options?.model ?? "G1",
    style,
    constraints,
    duration: options?.duration,
  };
}
