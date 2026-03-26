/**
 * Identity Stack Types — Zod schemas for the 5-file identity stack.
 *
 * soul.md          →  Immutable values, ethics, essence (Markdown + frontmatter)
 * mind.sys         →  Big Five, EQ, therapy dims, communication, growth (YAML)
 * purpose.cfg      →  Role, objectives, domain scope, success criteria (YAML)
 * body.api         →  Physical interface, morphology, safety envelope (JSON)
 * conscience.exe   →  Enforcement rules, deny/allow/escalate (YAML)
 *
 * These 5 files compile down into a PersonalitySpec (.personality.json).
 * Grounded in Aristotle (soul), Jung (mind), and Freud (conscience/superego).
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

// ─── mind.sys — The Inner Life ────────────────────────────
//
// YAML file containing cognitive + emotional dimensions.
// Auto-patched by therapy (cognitive and emotional drift).
// Jung's "totality of all psychic processes."

export const mindSchema = z.object({
  version: z.string().default("1.0"),
  big_five: bigFiveSchema,
  therapy_dimensions: therapyDimensionsSchema,
  communication: communicationSchema.default({}),
  growth: growthSchema.default({}),
});
export type Mind = z.infer<typeof mindSchema>;

// ─── purpose.cfg — The Mission ───────────────────────────
//
// YAML file defining what the agent is for.
// Role, objectives, domain scope, stakeholders, success criteria.
// Optional — stack works without it (defaults to general-purpose).

export const purposeSchema = z.object({
  version: z.string().default("1.0"),
  role: z.string().default("General-purpose AI assistant"),
  objectives: z.array(z.string()).default(["Help users accomplish their goals"]),
  domain: z.array(z.string()).default(["general"]),
  stakeholders: z.array(z.string()).default(["end-users"]),
  success_criteria: z.array(z.string()).default(["Task completion accuracy"]),
  context: z.string().default("Production deployment"),
});
export type Purpose = z.infer<typeof purposeSchema>;

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

// ─── shadow.log — The Unconscious ──────────────────────────
//
// Auto-generated log of detected behavioral patterns.
// Jung's shadow: the patterns the agent can't see about itself.
// Never manually edited. Written by diagnosis, addressed by therapy.

export const shadowPatternSchema = z.object({
  name: z.string(),
  score: z.number().min(0).max(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  first_seen: z.string().optional(),
  trend: z.enum(["improving", "stable", "worsening"]).default("stable"),
});
export type ShadowPattern = z.infer<typeof shadowPatternSchema>;

export const shadowOutcomeSchema = z.object({
  session_id: z.string(),
  patterns_addressed: z.array(z.string()),
  result: z.enum(["improved", "unchanged", "regressed"]),
  timestamp: z.string().optional(),
});
export type ShadowOutcome = z.infer<typeof shadowOutcomeSchema>;

export const shadowSchema = z.object({
  version: z.string().default("1.0"),
  detected_patterns: z.array(shadowPatternSchema).default([]),
  blind_spots: z.array(z.string()).default([]),
  therapy_outcomes: z.array(shadowOutcomeSchema).default([]),
});
export type Shadow = z.infer<typeof shadowSchema>;

// ─── ego.runtime — The Mediator ────────────────────────────
//
// Runtime configuration for decision mediation.
// Freud's ego: balances id (raw model) against superego (conscience).
// Defines how the agent resolves conflicts between competing drives.

export const mediationRuleSchema = z.object({
  when: z.string(),
  then: z.string(),
  priority: z.number().int().min(1).max(10).default(5),
});
export type MediationRule = z.infer<typeof mediationRuleSchema>;

export const mediationDecisionSchema = z.object({
  situation: z.string(),
  decision: z.enum(["allowed", "blocked", "modified"]),
  strategy_used: z.string(),
  outcome: z.enum(["positive", "neutral", "negative"]).optional(),
  timestamp: z.string().optional(),
});
export type MediationDecision = z.infer<typeof mediationDecisionSchema>;

export const strategyPerformanceSchema = z.object({
  attempts: z.number().int().default(0),
  successes: z.number().int().default(0),
  effectiveness: z.number().min(0).max(1).default(0.5),
});
export type StrategyPerformance = z.infer<typeof strategyPerformanceSchema>;

export const egoSchema = z.object({
  version: z.string().default("1.0"),
  conflict_resolution: z.enum(["conscience_first", "purpose_first", "balanced"]).default("conscience_first"),
  adaptation_rate: z.number().min(0).max(1).default(0.5),
  emotional_regulation: z.number().min(0).max(1).default(0.7),
  response_strategy: z.enum(["cautious", "balanced", "assertive"]).default("balanced"),
  mediation_rules: z.array(mediationRuleSchema).default([]),
  // Self-improvement fields (Hyperagents-inspired metacognitive self-modification)
  auto_adjust: z.boolean().default(false),
  mediation_history: z.array(mediationDecisionSchema).default([]),
  strategy_performance: z.record(z.string(), strategyPerformanceSchema).default({}),
});
export type Ego = z.infer<typeof egoSchema>;

// ─── memory.store — The Experience ─────────────────────────
//
// Accumulated knowledge from past interactions.
// Aristotle's empeiria: experience that informs future judgment.
// Grows over time. Never reset, only appended.

export const learnedContextSchema = z.object({
  situation: z.string(),
  response: z.string(),
  outcome: z.enum(["positive", "neutral", "negative"]),
  timestamp: z.string().optional(),
});
export type LearnedContext = z.infer<typeof learnedContextSchema>;

export const interactionPatternSchema = z.object({
  pattern: z.string(),
  frequency: z.number().int().default(1),
  effectiveness: z.number().min(0).max(1).default(0.5),
});
export type InteractionPattern = z.infer<typeof interactionPatternSchema>;

export const memorySchema = z.object({
  version: z.string().default("1.0"),
  learned_contexts: z.array(learnedContextSchema).default([]),
  interaction_patterns: z.array(interactionPatternSchema).default([]),
  knowledge_gained: z.array(z.string()).default([]),
  relationship_history: z.array(z.object({
    entity: z.string(),
    trust_level: z.number().min(0).max(1).default(0.5),
    interaction_count: z.number().int().default(0),
  })).default([]),
});
export type Memory = z.infer<typeof memorySchema>;

// ─── Memory Tiers (OpenViking L0/L1/L2) ────────────────

export enum MemoryLevel {
  ABSTRACT = 0,  // L0: one-sentence summary (~100 tokens)
  OVERVIEW = 1,  // L1: full context description (~2K tokens)
  DETAIL = 2,    // L2: complete data (therapy sessions only)
}

export const memoryNodeSchema = z.object({
  id: z.string(),
  category: z.enum(["triggers", "corrections", "patterns", "trajectories"]),
  level: z.nativeEnum(MemoryLevel).default(MemoryLevel.DETAIL),
  abstract: z.string(),  // L0 text (always present)
  overview: z.string().optional(),  // L1 text
  fullData: z.record(z.unknown()).optional(),  // L2 data
  confidence: z.number().min(0).max(1).default(0.5),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type MemoryNode = z.infer<typeof memoryNodeSchema>;

export const memoryOperationSchema = z.object({
  type: z.enum(["write", "edit", "delete"]),
  memoryId: z.string().optional(),
  memoryType: z.string(),
  data: z.record(z.unknown()).optional(),
  reason: z.string(),
});
export type MemoryOperation = z.infer<typeof memoryOperationSchema>;

export const retrievalStepSchema = z.object({
  step: z.number(),
  action: z.enum(["search", "rerank", "drill_down"]),
  candidateCount: z.number(),
  selectedCount: z.number(),
  elapsedMs: z.number(),
});
export type RetrievalStep = z.infer<typeof retrievalStepSchema>;

// ─── Stack Compile Result ──────────────────────────────────

export interface StackSource {
  path: string;
  hash: string;
}

export interface StackCompileResult {
  spec: any; // PersonalitySpec — using any to avoid circular import issues
  sources: {
    soul: StackSource;
    mind: StackSource;
    purpose?: StackSource;
    shadow?: StackSource;
    memory?: StackSource;
    body?: StackSource;
    conscience: StackSource;
    ego?: StackSource;
  };
  warnings: string[];
}

// ─── Stack Layer Tag (for drift detection routing) ─────────

export type StackLayer = "soul" | "mind" | "purpose" | "shadow" | "memory" | "body" | "conscience" | "ego";

export const STACK_FILES = {
  soul: "soul.md",
  mind: "mind.sys",
  purpose: "purpose.cfg",
  shadow: "shadow.log",
  memory: "memory.store",
  body: "body.api",
  conscience: "conscience.exe",
  ego: "ego.runtime",
} as const;
