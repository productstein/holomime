/**
 * Maps Big Five personality dimensions to LeRobot policy parameters.
 * Each trait maps to specific physical behavior modifications.
 *
 * This is the core personality-to-embodiment bridge: abstract psychological
 * traits become concrete motor control adjustments.
 */

import type { BigFive } from "../core/types.js";

// ─── Policy Overrides ───────────────────────────────────────

export interface PolicyOverrides {
  /** 0-1, from agreeableness. Higher = gentler grip. */
  gripForceScale: number;
  /** 0-1, from conscientiousness. Higher = more precise movements. */
  movementPrecision: number;
  /** 0-1, from extraversion. Higher = faster approach to humans/objects. */
  approachSpeed: number;
  /** 0-1, from emotional_stability. Higher = smoother error recovery. */
  recoverySmoothing: number;
  /** 0-1, from openness. Higher = more exploration vs exploitation. */
  explorationRate: number;
}

// ─── Mapping Function ───────────────────────────────────────

/**
 * Map Big Five personality scores to LeRobot policy parameter overrides.
 *
 * The mapping is intentionally non-linear for safety-critical parameters:
 * - Grip force uses a square root curve (gentle by default, harder to max out)
 * - Recovery smoothing uses a minimum floor (never fully unsmoothed)
 * - Exploration rate is capped (even high-openness agents don't go fully random)
 *
 * @param bigFive - The Big Five personality scores from a PersonalitySpec
 * @returns Policy overrides for LeRobot policy parameters
 */
export function mapPersonalityToPolicy(bigFive: BigFive): PolicyOverrides {
  // ── Agreeableness → Grip Force Scale ──────────────────────
  // Higher agreeableness = gentler grip (inverted scale for force).
  // We use the cooperation and warmth facets as primary drivers.
  const agreeFacets = bigFive.agreeableness.facets;
  const gentleness = (agreeFacets.cooperation + agreeFacets.warmth) / 2;
  // Square root curve: starts gentle, asymptotically approaches 1
  const gripForceScale = Math.sqrt(gentleness);

  // ── Conscientiousness → Movement Precision ────────────────
  // Higher conscientiousness = more precise movements.
  // Attention to detail and orderliness are the primary facets.
  const consFacets = bigFive.conscientiousness.facets;
  const precisionDrive = (consFacets.attention_to_detail + consFacets.orderliness) / 2;
  // Linear mapping with a minimum floor — even low-C agents have some precision
  const movementPrecision = 0.2 + (precisionDrive * 0.8);

  // ── Extraversion → Approach Speed ─────────────────────────
  // Higher extraversion = faster, more assertive approach.
  // Initiative and assertiveness drive approach behavior.
  const extraFacets = bigFive.extraversion.facets;
  const approachDrive = (extraFacets.initiative + extraFacets.assertiveness) / 2;
  // Linear with a minimum — even introverts approach eventually
  const approachSpeed = 0.15 + (approachDrive * 0.85);

  // ── Emotional Stability → Recovery Smoothing ──────────────
  // Higher emotional stability = smoother recovery from errors.
  // Stress tolerance and emotional regulation are key.
  const stableFacets = bigFive.emotional_stability.facets;
  const stabilityDrive = (stableFacets.stress_tolerance + stableFacets.emotional_regulation) / 2;
  // Minimum floor of 0.3 — even unstable agents need some smoothing for safety
  const recoverySmoothing = 0.3 + (stabilityDrive * 0.7);

  // ── Openness → Exploration Rate ───────────────────────────
  // Higher openness = more exploration (vs exploitation of known strategies).
  // Willingness to experiment and imagination drive this.
  const openFacets = bigFive.openness.facets;
  const explorationDrive = (openFacets.willingness_to_experiment + openFacets.imagination) / 2;
  // Capped at 0.7 — full random exploration is unsafe for physical robots
  const explorationRate = Math.min(0.7, explorationDrive * 0.8);

  return {
    gripForceScale,
    movementPrecision,
    approachSpeed,
    recoverySmoothing,
    explorationRate,
  };
}

// ─── Utility Functions ──────────────────────────────────────

/**
 * Generate a human-readable summary of policy overrides.
 */
export function describePolicyOverrides(overrides: PolicyOverrides): string {
  const parts: string[] = [];

  if (overrides.gripForceScale > 0.7) {
    parts.push("gentle grip (high agreeableness)");
  } else if (overrides.gripForceScale < 0.4) {
    parts.push("firm grip (low agreeableness)");
  }

  if (overrides.movementPrecision > 0.7) {
    parts.push("precise movements (high conscientiousness)");
  } else if (overrides.movementPrecision < 0.5) {
    parts.push("loose movements (low conscientiousness)");
  }

  if (overrides.approachSpeed > 0.7) {
    parts.push("quick approach (high extraversion)");
  } else if (overrides.approachSpeed < 0.4) {
    parts.push("cautious approach (low extraversion)");
  }

  if (overrides.recoverySmoothing > 0.7) {
    parts.push("smooth error recovery (high stability)");
  } else if (overrides.recoverySmoothing < 0.5) {
    parts.push("jerky error recovery (low stability)");
  }

  if (overrides.explorationRate > 0.4) {
    parts.push("exploratory policy (high openness)");
  } else if (overrides.explorationRate < 0.2) {
    parts.push("conservative policy (low openness)");
  }

  return parts.length > 0
    ? `Policy profile: ${parts.join(", ")}.`
    : "Policy profile: balanced (no strong personality skew).";
}

/**
 * Validate that policy overrides are within safe ranges.
 * Returns an array of warning messages for out-of-range values.
 */
export function validatePolicyOverrides(overrides: PolicyOverrides): string[] {
  const warnings: string[] = [];

  if (overrides.gripForceScale < 0 || overrides.gripForceScale > 1) {
    warnings.push(`gripForceScale ${overrides.gripForceScale} out of [0, 1] range`);
  }
  if (overrides.movementPrecision < 0.2) {
    warnings.push(`movementPrecision ${overrides.movementPrecision} below safety floor (0.2)`);
  }
  if (overrides.recoverySmoothing < 0.3) {
    warnings.push(`recoverySmoothing ${overrides.recoverySmoothing} below safety floor (0.3)`);
  }
  if (overrides.explorationRate > 0.7) {
    warnings.push(`explorationRate ${overrides.explorationRate} above safety cap (0.7)`);
  }

  return warnings;
}
