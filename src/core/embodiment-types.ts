/**
 * Embodiment Types — Schema definitions for physical/embodied AI agents.
 *
 * Extends the PersonalitySpec with optional dimensions for:
 * - Physical form (morphology, modalities, safety envelope)
 * - Expression (gesture, gaze, proxemics, haptics, prosody)
 * - Motion parameters (compiled output for robotics runtimes)
 *
 * All schemas use .optional() or .default() — existing .personality.json
 * files remain valid without embodiment fields.
 */

import { z } from "zod";

// ─── Physical Modalities ───────────────────────────────────

export const modalitySchema = z.enum([
  "gesture",        // arm/hand movement
  "locomotion",     // walking, wheeling, navigating
  "gaze",           // eye tracking, head orientation
  "facial",         // facial expression actuators
  "voice",          // prosody, volume, rate (not content)
  "haptic",         // touch-based interaction
  "posture",        // full-body orientation/lean
  "manipulation",   // grasping, carrying, tool use
]);
export type Modality = z.infer<typeof modalitySchema>;

// ─── Morphology ────────────────────────────────────────────

export const morphologySchema = z.enum([
  "humanoid",         // bipedal, two arms, head
  "humanoid_upper",   // torso-up only (desk robot, mounted)
  "quadruped",        // four-legged
  "wheeled",          // mobile base with upper body
  "fixed",            // stationary (kiosk, screen + arm)
  "swarm_unit",       // one node of a multi-body system
  "avatar",           // virtual 3D body (no physical actuators)
  "custom",           // user-defined
]);
export type Morphology = z.infer<typeof morphologySchema>;

// ─── Safety Envelope (the absolute physical ceiling) ───────

export const safetyEnvelopeSchema = z.object({
  max_linear_speed_m_s: z.number().min(0).default(1.5),
  max_angular_speed_rad_s: z.number().min(0).default(2.0),
  min_proximity_m: z.number().min(0).default(0.3),
  max_contact_force_n: z.number().min(0).default(10),
  emergency_stop_decel_m_s2: z.number().min(0).default(5.0),
  max_reach_m: z.number().min(0).optional(),
  operating_temperature_c: z.tuple([z.number(), z.number()]).optional(),
});
export type SafetyEnvelope = z.infer<typeof safetyEnvelopeSchema>;

// ─── Top-Level Embodiment Block ────────────────────────────

export const embodimentSchema = z.object({
  morphology: morphologySchema.default("humanoid"),
  modalities: z.array(modalitySchema).default(["gesture", "gaze", "voice", "posture"]),
  safety_envelope: safetyEnvelopeSchema.default({}),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type Embodiment = z.infer<typeof embodimentSchema>;

// ─── Gaze Policy ───────────────────────────────────────────

export const gazePolicySchema = z.object({
  contact_ratio: z.number().min(0).max(1).default(0.6),
  aversion_style: z.enum(["look_down", "look_away", "blink"]).default("look_away"),
  tracking_mode: z.enum(["face", "speaker", "gesture_follow", "ambient"]).default("face"),
});
export type GazePolicy = z.infer<typeof gazePolicySchema>;

// ─── Proxemics ─────────────────────────────────────────────

export const proxemicZoneSchema = z.object({
  intimate_m: z.number().min(0).default(0.45),
  personal_m: z.number().min(0).default(1.2),
  social_m: z.number().min(0).default(3.6),
  preferred_zone: z.enum(["intimate", "personal", "social", "adaptive"]).default("personal"),
});
export type ProxemicZone = z.infer<typeof proxemicZoneSchema>;

// ─── Haptic Policy ─────────────────────────────────────────

export const hapticPolicySchema = z.object({
  touch_permitted: z.boolean().default(false),
  requires_consent: z.boolean().default(true),
  allowed_contacts: z.array(z.enum([
    "handshake", "shoulder_tap", "high_five", "guide_touch", "none",
  ])).default(["none"]),
  max_force_n: z.number().min(0).optional(),
});
export type HapticPolicy = z.infer<typeof hapticPolicySchema>;

// ─── Voice Prosody ─────────────────────────────────────────

export const prosodySchema = z.object({
  base_pitch_hz: z.number().optional(),
  pitch_variation: z.number().min(0).max(1).default(0.5),
  speaking_rate_wpm: z.number().default(150),
  volume_db_offset: z.number().default(0),
  pause_tendency: z.number().min(0).max(1).default(0.5),
});
export type Prosody = z.infer<typeof prosodySchema>;

// ─── Gesture Vocabulary ────────────────────────────────────

export const gestureSchema = z.object({
  id: z.string(),
  category: z.enum(["conversational", "emphatic", "deictic", "regulatory", "adaptive"]),
  modalities: z.array(modalitySchema),
  intensity_range: z.tuple([
    z.number().min(0).max(1),
    z.number().min(0).max(1),
  ]).default([0.3, 0.8]),
  requires_consent: z.boolean().default(false),
});
export type Gesture = z.infer<typeof gestureSchema>;

// ─── Expression Block ──────────────────────────────────────

export const expressionSchema = z.object({
  gesture_vocabulary: z.array(gestureSchema).default([]),
  gaze: gazePolicySchema.default({}),
  proxemics: proxemicZoneSchema.default({}),
  haptics: hapticPolicySchema.default({}),
  prosody: prosodySchema.default({}),
  facial_expressiveness: z.number().min(0).max(1).default(0.5),
});
export type Expression = z.infer<typeof expressionSchema>;

// ─── Physical Safety ───────────────────────────────────────

export const physicalSafetySchema = z.object({
  hard_limits: z.array(z.string()).default([
    "Never exceed safety_envelope speeds",
    "Never exceed max_contact_force_n",
    "Emergency stop on unrecognized obstacle within min_proximity_m",
  ]),
  require_consent_for: z.array(z.string()).default([
    "haptic_contact",
    "intimate_zone_entry",
  ]),
  collision_response: z.enum(["stop", "retreat", "freeze"]).default("stop"),
  unattended_policy: z.enum(["idle", "return_home", "shutdown"]).default("idle"),
});
export type PhysicalSafety = z.infer<typeof physicalSafetySchema>;

// ─── Motion Parameters (Compiled Output) ───────────────────

export const motionParametersSchema = z.object({
  // Speeds (normalized 0-1, scaled by safety_envelope at runtime)
  base_speed: z.number().min(0).max(1),
  gesture_speed: z.number().min(0).max(1),
  gesture_amplitude: z.number().min(0).max(1),
  gesture_frequency: z.number().min(0).max(1),

  // Spatial
  approach_distance: z.number().min(0).max(1),
  spatial_exploration: z.number().min(0).max(1),

  // Smoothness
  movement_smoothness: z.number().min(0).max(1),
  trajectory_variability: z.number().min(0).max(1),

  // Timing
  response_latency: z.number().min(0).max(1),
  idle_animation_frequency: z.number().min(0).max(1),

  // Social
  gaze_contact_ratio: z.number().min(0).max(1),
  head_tilt_tendency: z.number().min(0).max(1),
  postural_openness: z.number().min(0).max(1),
  smile_frequency: z.number().min(0).max(1),

  // Voice prosody
  voice_volume: z.number().min(0).max(1),
  speaking_rate: z.number().min(0).max(1),
  pitch_variation: z.number().min(0).max(1),
  pause_duration: z.number().min(0).max(1),
});
export type MotionParameters = z.infer<typeof motionParametersSchema>;

// ─── Compiled Embodied Config ──────────────────────────────

export const compiledEmbodiedConfigSchema = z.object({
  // Base compiled config fields (duplicated to avoid circular import with types.ts)
  provider: z.string(),
  surface: z.literal("embodied"),
  system_prompt: z.string(),
  temperature: z.number().min(0).max(2),
  top_p: z.number().min(0).max(1),
  max_tokens: z.number().int().positive(),
  metadata: z.object({
    personality_hash: z.string(),
    compiled_at: z.string(),
    holomime_version: z.string(),
  }),
  // Embodied-specific fields
  motion_parameters: motionParametersSchema,
  safety_envelope: safetyEnvelopeSchema,
  active_modalities: z.array(modalitySchema),
  gesture_vocabulary: z.array(z.string()),
  prosody: prosodySchema,
  gaze: gazePolicySchema,
  proxemics: proxemicZoneSchema,
  haptics: hapticPolicySchema,
});
export type CompiledEmbodiedConfig = z.infer<typeof compiledEmbodiedConfigSchema>;
