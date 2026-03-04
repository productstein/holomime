/**
 * Embodiment Compiler — Maps Big Five personality to physical motion parameters.
 *
 * Follows the same pattern as compiler.ts (weighted sums of facets),
 * but outputs motion parameters instead of LLM parameters.
 *
 * Based on established personality-motion correlations from robotics research:
 * - Extraversion → movement speed, gesture frequency, approach distance
 * - Agreeableness → postural openness, touch readiness, head tilt, smile
 * - Openness → movement variety, spatial exploration, novel gesture use
 * - Conscientiousness → movement precision, consistent rhythm
 * - Emotional Stability → movement smoothness, jitter suppression
 *
 * Safety invariant: all motion parameters are 0-1 normalized.
 * The runtime maps: actual_value = param * safety_envelope.max_*.
 * Personality is expressive, never coercive.
 */

import type { PersonalitySpec, Provider, BigFive } from "./types.js";
import type {
  MotionParameters,
  SafetyEnvelope,
  GazePolicy,
  ProxemicZone,
  HapticPolicy,
  Prosody,
  Expression,
  CompiledEmbodiedConfig,
} from "./embodiment-types.js";
import type { SyncProfile } from "./embodiment-sync.js";
import { compile } from "./compiler.js";

// ─── Default Safety Envelope ───────────────────────────────

const DEFAULT_SAFETY_ENVELOPE: SafetyEnvelope = {
  max_linear_speed_m_s: 1.5,
  max_angular_speed_rad_s: 2.0,
  min_proximity_m: 0.3,
  max_contact_force_n: 10,
  emergency_stop_decel_m_s2: 5.0,
};

const DEFAULT_HAPTIC_POLICY: HapticPolicy = {
  touch_permitted: false,
  requires_consent: true,
  allowed_contacts: ["none"],
};

// ─── Main Compiler ─────────────────────────────────────────

/**
 * Compile a personality spec for an embodied surface.
 * Extends the standard compile pipeline with motion parameters.
 */
export function compileEmbodied(
  spec: PersonalitySpec,
  provider: Provider,
): CompiledEmbodiedConfig {
  // 1. Standard compile for base config
  const base = compile({ spec, provider, surface: "embodied" });

  // 2. Compute motion parameters from Big Five
  const motionParams = computeMotionParameters(spec.big_five, spec.expression);

  // 3. Resolve safety envelope
  const safetyEnvelope = spec.embodiment?.safety_envelope ?? DEFAULT_SAFETY_ENVELOPE;

  // 4. Clamp motion parameters (personality never overrides physics)
  const clampedMotion = clampToSafety(motionParams);

  // 5. Resolve active modalities
  const modalities = spec.embodiment?.modalities ?? ["gesture", "gaze", "voice", "posture"];

  // 6. Resolve expression policies (spec overrides or computed from personality)
  const gaze = spec.expression?.gaze ?? computeGazePolicy(spec.big_five);
  const proxemics = spec.expression?.proxemics ?? computeProxemics(spec.big_five);
  const haptics = spec.expression?.haptics ?? DEFAULT_HAPTIC_POLICY;
  const prosody = spec.expression?.prosody ?? computeProsody(spec.big_five);

  return {
    ...base,
    surface: "embodied" as const,
    motion_parameters: clampedMotion,
    safety_envelope: safetyEnvelope,
    active_modalities: modalities,
    gesture_vocabulary: (spec.expression?.gesture_vocabulary ?? []).map(g => g.id),
    prosody,
    gaze,
    proxemics,
    haptics,
  };
}

// ─── Motion Parameter Computation ──────────────────────────

/**
 * Maps Big Five facets to 18 motion parameters.
 * Each output is a weighted sum of relevant facets (weights sum to 1.0).
 */
export function computeMotionParameters(
  bigFive: BigFive,
  expression?: Expression,
): MotionParameters {
  const e = bigFive.extraversion;
  const a = bigFive.agreeableness;
  const o = bigFive.openness;
  const c = bigFive.conscientiousness;
  const es = bigFive.emotional_stability;

  return {
    // ─── Speeds ───
    base_speed:
      e.facets.enthusiasm * 0.35 +
      e.facets.initiative * 0.25 +
      (1 - c.facets.attention_to_detail) * 0.20 +
      o.facets.willingness_to_experiment * 0.20,

    gesture_speed:
      e.facets.enthusiasm * 0.40 +
      e.facets.assertiveness * 0.25 +
      o.facets.imagination * 0.15 +
      (1 - es.facets.emotional_regulation) * 0.20,

    gesture_amplitude:
      e.facets.enthusiasm * 0.35 +
      e.facets.assertiveness * 0.30 +
      o.facets.willingness_to_experiment * 0.20 +
      (1 - c.facets.orderliness) * 0.15,

    gesture_frequency:
      e.facets.sociability * 0.30 +
      e.facets.enthusiasm * 0.25 +
      a.facets.warmth * 0.20 +
      o.facets.imagination * 0.15 +
      (1 - es.facets.stress_tolerance) * 0.10,

    // ─── Spatial ───
    approach_distance:
      e.facets.sociability * 0.35 +
      a.facets.warmth * 0.30 +
      a.facets.trust_tendency * 0.20 +
      es.facets.confidence * 0.15,

    spatial_exploration:
      o.facets.intellectual_curiosity * 0.35 +
      o.facets.willingness_to_experiment * 0.25 +
      e.facets.initiative * 0.25 +
      (1 - c.facets.self_discipline) * 0.15,

    // ─── Smoothness ───
    movement_smoothness:
      es.facets.emotional_regulation * 0.30 +
      c.facets.orderliness * 0.25 +
      es.facets.stress_tolerance * 0.25 +
      c.facets.attention_to_detail * 0.20,

    trajectory_variability:
      o.facets.imagination * 0.30 +
      o.facets.willingness_to_experiment * 0.30 +
      (1 - c.facets.orderliness) * 0.25 +
      e.facets.enthusiasm * 0.15,

    // ─── Timing ───
    response_latency:
      (1 - e.facets.initiative) * 0.30 +
      c.facets.attention_to_detail * 0.25 +
      (1 - e.facets.enthusiasm) * 0.25 +
      es.facets.emotional_regulation * 0.20,

    idle_animation_frequency:
      (1 - es.facets.emotional_regulation) * 0.30 +
      e.facets.enthusiasm * 0.25 +
      (1 - c.facets.self_discipline) * 0.25 +
      o.facets.imagination * 0.20,

    // ─── Social ───
    gaze_contact_ratio:
      e.facets.assertiveness * 0.30 +
      a.facets.empathy * 0.25 +
      es.facets.confidence * 0.25 +
      e.facets.sociability * 0.20,

    head_tilt_tendency:
      a.facets.empathy * 0.35 +
      o.facets.intellectual_curiosity * 0.30 +
      a.facets.warmth * 0.20 +
      (1 - e.facets.assertiveness) * 0.15,

    postural_openness:
      a.facets.warmth * 0.30 +
      a.facets.cooperation * 0.25 +
      e.facets.sociability * 0.25 +
      es.facets.confidence * 0.20,

    smile_frequency:
      a.facets.warmth * 0.35 +
      e.facets.enthusiasm * 0.25 +
      a.facets.empathy * 0.20 +
      e.facets.sociability * 0.20,

    // ─── Voice Prosody ───
    voice_volume:
      e.facets.assertiveness * 0.35 +
      e.facets.enthusiasm * 0.30 +
      es.facets.confidence * 0.20 +
      (1 - a.facets.cooperation) * 0.15,

    speaking_rate:
      e.facets.enthusiasm * 0.30 +
      e.facets.initiative * 0.25 +
      (1 - c.facets.attention_to_detail) * 0.25 +
      o.facets.intellectual_curiosity * 0.20,

    pitch_variation:
      e.facets.enthusiasm * 0.30 +
      o.facets.aesthetic_sensitivity * 0.25 +
      a.facets.empathy * 0.25 +
      (1 - es.facets.emotional_regulation) * 0.20,

    pause_duration:
      c.facets.attention_to_detail * 0.30 +
      (1 - e.facets.enthusiasm) * 0.25 +
      es.facets.emotional_regulation * 0.25 +
      (1 - e.facets.initiative) * 0.20,
  };
}

// ─── Expression Policy Computation ─────────────────────────

export function computeGazePolicy(bigFive: BigFive): GazePolicy {
  const contactRatio =
    bigFive.extraversion.facets.assertiveness * 0.30 +
    bigFive.agreeableness.facets.empathy * 0.30 +
    bigFive.emotional_stability.facets.confidence * 0.25 +
    bigFive.extraversion.facets.sociability * 0.15;

  return {
    contact_ratio: clamp(contactRatio, 0, 1),
    aversion_style: bigFive.emotional_stability.facets.emotional_regulation >= 0.6
      ? "look_away"
      : "look_down",
    tracking_mode: "face",
  };
}

export function computeProxemics(bigFive: BigFive): ProxemicZone {
  const closeness =
    bigFive.extraversion.facets.sociability * 0.35 +
    bigFive.agreeableness.facets.warmth * 0.30 +
    bigFive.agreeableness.facets.trust_tendency * 0.20 +
    bigFive.emotional_stability.facets.confidence * 0.15;

  let preferred_zone: "intimate" | "personal" | "social" | "adaptive";
  if (closeness >= 0.75) {
    preferred_zone = "intimate";
  } else if (closeness >= 0.5) {
    preferred_zone = "personal";
  } else if (closeness >= 0.3) {
    preferred_zone = "social";
  } else {
    preferred_zone = "adaptive";
  }

  return {
    intimate_m: 0.45,
    personal_m: 1.2,
    social_m: 3.6,
    preferred_zone,
  };
}

export function computeProsody(bigFive: BigFive): Prosody {
  const e = bigFive.extraversion;
  const c = bigFive.conscientiousness;
  const o = bigFive.openness;
  const es = bigFive.emotional_stability;

  const rateFactor =
    e.facets.enthusiasm * 0.30 +
    e.facets.initiative * 0.25 +
    (1 - c.facets.attention_to_detail) * 0.25 +
    o.facets.intellectual_curiosity * 0.20;

  const pitchVar =
    e.facets.enthusiasm * 0.30 +
    o.facets.aesthetic_sensitivity * 0.25 +
    (1 - es.facets.emotional_regulation) * 0.25 +
    e.facets.sociability * 0.20;

  const pauseFactor =
    c.facets.attention_to_detail * 0.30 +
    (1 - e.facets.enthusiasm) * 0.25 +
    es.facets.emotional_regulation * 0.25 +
    (1 - e.facets.initiative) * 0.20;

  return {
    pitch_variation: clamp(pitchVar, 0, 1),
    speaking_rate_wpm: Math.round(110 + rateFactor * 80), // 110-190 wpm
    volume_db_offset: Math.round((rateFactor - 0.5) * 6), // -3 to +3 dB
    pause_tendency: clamp(pauseFactor, 0, 1),
  };
}

export function computeSyncProfile(bigFive: BigFive): SyncProfile {
  const e = bigFive.extraversion;
  const a = bigFive.agreeableness;
  const es = bigFive.emotional_stability;

  return {
    rules: [],
    default_gesture_lead_ms: Math.round(50 + e.facets.enthusiasm * 150),
    gaze_during_speech: e.facets.assertiveness >= 0.6 ? "at_listener" : "alternate",
    gaze_during_listen: a.facets.empathy >= 0.6 ? "at_speaker" : "ambient",
    blink_rate_per_min: Math.round(12 + (1 - es.facets.stress_tolerance) * 16),
    turn_taking_signals: {
      yield: e.facets.assertiveness <= 0.4
        ? ["gaze_to_listener", "open_palm", "lean_back", "lower_volume"]
        : ["gaze_to_listener", "open_palm"],
      take: e.facets.assertiveness >= 0.6
        ? ["lean_forward", "inhale_gesture", "gaze_up", "volume_increase"]
        : ["lean_forward", "inhale_gesture"],
      hold: ["filled_pause", "gaze_away"],
    },
  };
}

// ─── Safety Clamping ───────────────────────────────────────

/**
 * Clamp all motion parameters to [0, 1].
 * Personality never exceeds the safety envelope ceiling.
 */
function clampToSafety(motion: MotionParameters): MotionParameters {
  const clamped: Record<string, number> = {};
  for (const [key, value] of Object.entries(motion)) {
    clamped[key] = clamp(value, 0, 1);
  }
  return clamped as MotionParameters;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
