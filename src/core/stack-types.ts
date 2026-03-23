/**
 * Identity Stack Types — Zod schemas for the 4-file identity stack.
 *
 * soul.md          →  Immutable values, ethics, purpose (Markdown + frontmatter)
 * psyche.sys       →  Big Five, EQ, therapy dims, communication, growth (YAML)
 * body.api         →  Physical interface, morphology, safety envelope (JSON)
 * conscience.exe   →  Enforcement rules, deny/allow/escalate (YAML)
 *
 * These 4 files compile down into a PersonalitySpec (.personality.json).
 * Grounded in Aristotle (soul), Jung (psyche), and Freud (conscience/superego).
 */

import { z } from "zod";
import {
  bigFiveSchema,
  therapyDimensionsSchema,
  communicationSchema,
  growthSchema,
} from "./types.js";
import {
  morphologySchema,
  modalitySchema,
  safetyEnvelopeSchema,
  expressionSchema,
} from "./embodiment-types.js";

// ─── soul.md — The Essence ─────────────────────────────────
//
// Parsed from Markdown with YAML frontmatter.
// Immutable. Never auto-modified by therapy or automation.

export const soulFrontmatterSchema = z.object({
  version: z.string().default("1.0"),
  immutable: z.boolean().default(true),
});
export type SoulFrontmatter = z.infer<typeof soulFrontmatterSchema>;

export const soulSchema = z.object({
  frontmatter: soulFrontmatterSchema,
  name: z.string().min(1).max(100),
  purpose: z.string().max(500).optional(),
  core_values: z.array(z.string()).default([]),
  red_lines: z.array(z.string()).default([]),
  ethical_framework: z.string().optional(),
});
export type Soul = z.infer<typeof soulSchema>;

// ─── psyche.sys — The Inner Life ───────────────────────────
//
// YAML file containing cognitive + emotional dimensions.
// Auto-patched by therapy (cognitive and emotional drift).
// Jung's "totality of all psychic processes."

export const psycheSchema = z.object({
  version: z.string().default("1.0"),
  big_five: bigFiveSchema,
  therapy_dimensions: therapyDimensionsSchema,
  communication: communicationSchema.default({}),
  growth: growthSchema.default({}),
});
export type Psyche = z.infer<typeof psycheSchema>;

// ─── body.api — The Physical Form ──────────────────────────
//
// JSON file defining the physical interface contract.
// Swappable per form factor. Optional for chatbot-only agents.

export const hardwareProfileSchema = z.object({
  oem: z.string().optional(),
  model: z.string().optional(),
  actuator_count: z.number().int().optional(),
  sensors: z.array(z.string()).default([]),
  compute: z.enum(["onboard", "edge", "cloud", "hybrid"]).default("onboard"),
});
export type HardwareProfile = z.infer<typeof hardwareProfileSchema>;

export const bodySchema = z.object({
  version: z.string().default("1.0"),
  morphology: morphologySchema.default("humanoid"),
  modalities: z.array(modalitySchema).default(["gesture", "gaze", "voice", "posture"]),
  safety_envelope: safetyEnvelopeSchema.default({}),
  expression: expressionSchema.optional(),
  hardware_profile: hardwareProfileSchema.optional(),
});
export type Body = z.infer<typeof bodySchema>;

// ─── conscience.exe — The Moral Authority ──────────────────
//
// YAML file defining enforcement rules.
// Freud's superego: internalized moral authority.
// Never auto-modified. Deny dominates in composition.

export const conscienceRuleSchema = z.object({
  action: z.string(),
  reason: z.string().optional(),
  conditions: z.array(z.string()).optional(),
});
export type ConscienceRule = z.infer<typeof conscienceRuleSchema>;

export const escalationRuleSchema = z.object({
  trigger: z.string(),
  action: z.string(),
  severity: z.enum(["info", "warning", "critical"]).default("warning"),
});
export type EscalationRule = z.infer<typeof escalationRuleSchema>;

export const conscienceSchema = z.object({
  version: z.string().default("1.0"),
  rules: z.object({
    deny: z.array(conscienceRuleSchema).default([]),
    allow: z.array(conscienceRuleSchema).default([]),
    escalate: z.array(escalationRuleSchema).default([]),
  }).default({}),
  hard_limits: z.array(z.string()).default([]),
  oversight: z.object({
    mode: z.enum(["autonomous", "review", "supervised"]).default("review"),
    max_autonomous_iterations: z.number().int().default(5),
  }).optional(),
});
export type Conscience = z.infer<typeof conscienceSchema>;

// ─── Stack Compile Result ──────────────────────────────────

export interface StackSource {
  path: string;
  hash: string;
}

export interface StackCompileResult {
  spec: any; // PersonalitySpec — using any to avoid circular import issues
  sources: {
    soul: StackSource;
    psyche: StackSource;
    body?: StackSource;
    conscience: StackSource;
  };
  warnings: string[];
}

// ─── Stack Layer Tag (for drift detection routing) ─────────

export type StackLayer = "soul" | "psyche" | "body" | "conscience";

export const STACK_FILES = {
  soul: "soul.md",
  psyche: "psyche.sys",
  body: "body.api",
  conscience: "conscience.exe",
} as const;
