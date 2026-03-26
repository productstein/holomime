/**
 * Embodiment Sync — Multi-modal synchronization spec.
 *
 * Defines how voice, gesture, and gaze coordinate in real-time.
 * This is a declarative spec — the runtime (ROS2, Unity, etc.) interprets it.
 * holomime generates the profile; it does not implement the realtime loop.
 */

import { z } from "zod";

// ─── Synchronization Anchors ───────────────────────────────

export const syncAnchorSchema = z.enum([
  "speech_start",   // gesture begins at start of utterance
  "speech_end",     // gesture completes at end of utterance
  "emphasis",       // gesture peaks at emphasized word
  "pause",          // gesture fills conversational pause
  "turn_yield",     // gesture accompanies turn-yielding
  "turn_take",      // gesture accompanies turn-taking
  "free",           // no speech coupling
]);
export type SyncAnchor = z.infer<typeof syncAnchorSchema>;

// ─── Sync Rules ────────────────────────────────────────────

export const syncRuleSchema = z.object({
  gesture_id: z.string(),
  anchor: syncAnchorSchema,
  lead_ms: z.number().default(0),
  gaze_behavior: z.enum(["at_listener", "at_referent", "away", "maintain"]).default("at_listener"),
  facial_action: z.enum(["neutral", "smile", "concern", "thinking", "match_speech"]).default("match_speech"),
});
export type SyncRule = z.infer<typeof syncRuleSchema>;

// ─── Sync Profile ──────────────────────────────────────────

export const syncProfileSchema = z.object({
  rules: z.array(syncRuleSchema).default([]),
  default_gesture_lead_ms: z.number().default(100),
  gaze_during_speech: z.enum(["at_listener", "alternate", "at_referent"]).default("at_listener"),
  gaze_during_listen: z.enum(["at_speaker", "nodding", "ambient"]).default("at_speaker"),
  blink_rate_per_min: z.number().min(0).max(40).default(17),
  turn_taking_signals: z.object({
    yield: z.array(z.string()).default(["gaze_to_listener", "open_palm", "lean_back"]),
    take: z.array(z.string()).default(["lean_forward", "inhale_gesture", "gaze_up"]),
    hold: z.array(z.string()).default(["filled_pause", "gaze_away", "hand_raise"]),
  }).default({}),
});
export type SyncProfile = z.infer<typeof syncProfileSchema>;
