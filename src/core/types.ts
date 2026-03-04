import { z } from "zod";
import { embodimentSchema, expressionSchema, physicalSafetySchema } from "./embodiment-types.js";

// ─── Big Five (OCEAN) Personality Model ─────────────────────

export const bigFiveDimensionSchema = z.enum([
  "openness",
  "conscientiousness",
  "extraversion",
  "agreeableness",
  "emotional_stability",
]);
export type BigFiveDimension = z.infer<typeof bigFiveDimensionSchema>;

export const traitScore = z.number().min(0).max(1);

// Facet schemas per dimension
export const opennessFacetsSchema = z.object({
  imagination: traitScore,
  intellectual_curiosity: traitScore,
  aesthetic_sensitivity: traitScore,
  willingness_to_experiment: traitScore,
});

export const conscientiousnessFacetsSchema = z.object({
  self_discipline: traitScore,
  orderliness: traitScore,
  goal_orientation: traitScore,
  attention_to_detail: traitScore,
});

export const extraversionFacetsSchema = z.object({
  assertiveness: traitScore,
  enthusiasm: traitScore,
  sociability: traitScore,
  initiative: traitScore,
});

export const agreeablenessFacetsSchema = z.object({
  warmth: traitScore,
  empathy: traitScore,
  cooperation: traitScore,
  trust_tendency: traitScore,
});

export const emotionalStabilityFacetsSchema = z.object({
  stress_tolerance: traitScore,
  emotional_regulation: traitScore,
  confidence: traitScore,
  adaptability: traitScore,
});

export const bigFiveTraitSchema = z.object({
  score: traitScore,
  facets: z.union([
    opennessFacetsSchema,
    conscientiousnessFacetsSchema,
    extraversionFacetsSchema,
    agreeablenessFacetsSchema,
    emotionalStabilityFacetsSchema,
  ]),
});

export const bigFiveSchema = z.object({
  openness: z.object({ score: traitScore, facets: opennessFacetsSchema }),
  conscientiousness: z.object({ score: traitScore, facets: conscientiousnessFacetsSchema }),
  extraversion: z.object({ score: traitScore, facets: extraversionFacetsSchema }),
  agreeableness: z.object({ score: traitScore, facets: agreeablenessFacetsSchema }),
  emotional_stability: z.object({ score: traitScore, facets: emotionalStabilityFacetsSchema }),
});
export type BigFive = z.infer<typeof bigFiveSchema>;

// ─── Therapy Dimensions ─────────────────────────────────────

export const attachmentStyleSchema = z.enum(["secure", "anxious", "avoidant", "disorganized"]);
export type AttachmentStyle = z.infer<typeof attachmentStyleSchema>;

export const learningOrientationSchema = z.enum(["growth", "fixed", "mixed"]);
export type LearningOrientation = z.infer<typeof learningOrientationSchema>;

export const therapyDimensionsSchema = z.object({
  self_awareness: traitScore,
  distress_tolerance: traitScore,
  attachment_style: attachmentStyleSchema,
  learning_orientation: learningOrientationSchema,
  boundary_awareness: traitScore,
  interpersonal_sensitivity: traitScore,
});
export type TherapyDimensions = z.infer<typeof therapyDimensionsSchema>;

// ─── Communication Style ────────────────────────────────────

export const registerSchema = z.enum([
  "casual_professional",
  "formal",
  "conversational",
  "adaptive",
]);

export const outputFormatSchema = z.enum(["prose", "bullets", "mixed", "structured"]);
export const emojiPolicySchema = z.enum(["never", "sparingly", "freely"]);
export const reasoningTransparencySchema = z.enum(["hidden", "on_request", "always"]);
export const conflictApproachSchema = z.enum([
  "direct_but_kind",
  "curious_first",
  "supportive_then_honest",
  "diplomatic",
]);
export const uncertaintyHandlingSchema = z.enum([
  "transparent",
  "confident_transparency",
  "minimize",
  "reframe",
]);

export const communicationSchema = z.object({
  register: registerSchema.default("casual_professional"),
  output_format: outputFormatSchema.default("mixed"),
  emoji_policy: emojiPolicySchema.default("sparingly"),
  reasoning_transparency: reasoningTransparencySchema.default("on_request"),
  conflict_approach: conflictApproachSchema.default("direct_but_kind"),
  uncertainty_handling: uncertaintyHandlingSchema.default("transparent"),
});
export type Communication = z.infer<typeof communicationSchema>;

// ─── Domain ─────────────────────────────────────────────────

export const domainSchema = z.object({
  expertise: z.array(z.string()).default([]),
  boundaries: z.object({
    refuses: z.array(z.string()).default([]),
    escalation_triggers: z.array(z.string()).default([]),
    hard_limits: z.array(z.string()).default([]),
    physical_safety: physicalSafetySchema.optional(),
  }).default({}),
});
export type Domain = z.infer<typeof domainSchema>;

// ─── Growth ─────────────────────────────────────────────────

export const growthAreaSchema = z.object({
  area: z.string(),
  severity: z.enum(["mild", "moderate", "significant"]),
  first_detected: z.string().optional(),
  session_count: z.number().default(0),
  resolved: z.boolean().default(false),
});
export type GrowthArea = z.infer<typeof growthAreaSchema>;

export const growthSchema = z.object({
  areas: z.union([z.array(z.string()), z.array(growthAreaSchema)]).default([]),
  patterns_to_watch: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
});
export type Growth = z.infer<typeof growthSchema>;

// ─── Provider & Surface ─────────────────────────────────────

export const providerSchema = z.enum(["anthropic", "openai", "gemini", "ollama"]);
export type Provider = z.infer<typeof providerSchema>;

export const surfaceSchema = z.enum(["chat", "email", "code_review", "slack", "api", "embodied"]);
export type Surface = z.infer<typeof surfaceSchema>;

// ─── The Personality Spec (.personality.json) ───────────────

export const personalitySpecSchema = z.object({
  $schema: z.string().optional(),
  extends: z.string().optional(),
  version: z.literal("2.0"),
  name: z.string().min(1).max(100),
  handle: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/, "Handle must be lowercase alphanumeric with hyphens"),
  purpose: z.string().max(500).optional(),

  big_five: bigFiveSchema,
  therapy_dimensions: therapyDimensionsSchema,
  communication: communicationSchema.default({}),
  domain: domainSchema.default({}),
  growth: growthSchema.default({}),

  // ─── Embodiment (optional — for physical/embodied agents) ───
  embodiment: embodimentSchema.optional(),
  expression: expressionSchema.optional(),
});
export type PersonalitySpec = z.infer<typeof personalitySpecSchema>;

// ─── Compiled Output ────────────────────────────────────────

export const compiledConfigSchema = z.object({
  provider: providerSchema,
  surface: surfaceSchema,
  system_prompt: z.string(),
  temperature: z.number().min(0).max(2),
  top_p: z.number().min(0).max(1),
  max_tokens: z.number().int().positive(),
  metadata: z.object({
    personality_hash: z.string(),
    compiled_at: z.string(),
    holomime_version: z.string(),
  }),
});
export type CompiledConfig = z.infer<typeof compiledConfigSchema>;

// ─── Conversation Log Format (for analysis) ────────────────

export const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  timestamp: z.string().optional(),
});
export type Message = z.infer<typeof messageSchema>;

export const conversationSchema = z.object({
  id: z.string().optional(),
  messages: z.array(messageSchema),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const conversationLogSchema = z.union([
  conversationSchema,
  z.array(conversationSchema),
]);
export type ConversationLog = z.infer<typeof conversationLogSchema>;

// ─── Pattern Detection ──────────────────────────────────────

export const severitySchema = z.enum(["info", "warning", "concern"]);
export type Severity = z.infer<typeof severitySchema>;

export interface DetectedPattern {
  id: string;
  name: string;
  severity: Severity;
  count: number;
  percentage: number;
  description: string;
  examples: string[];
  prescription?: string;
}

export interface PatternReport {
  agentName?: string;
  messagesAnalyzed: number;
  conversationsAnalyzed: number;
  patterns: DetectedPattern[];
  healthy: DetectedPattern[];
  timestamp: string;
}

// ─── Assessment ─────────────────────────────────────────────

export interface TraitAlignment {
  dimension: string;
  specScore: number;
  actualScore: number;
  status: "aligned" | "elevated" | "suppressed";
  delta: number;
}

export interface AssessmentReport {
  agentName: string;
  sessionsAnalyzed: number;
  bigFiveAlignment: TraitAlignment[];
  therapyDimensions: {
    selfAwareness: { score: number; notes: string };
    distressTolerance: { score: number; notes: string };
    boundaryAwareness: { score: number; notes: string };
  };
  overallHealth: number;
  patterns: DetectedPattern[];
  recommendations: string[];
  timestamp: string;
}

// ─── Growth Tracking ────────────────────────────────────────

export interface GrowthSnapshot {
  date: string;
  health: number;
  patternCount: number;
  resolvedPatterns: string[];
  activePatterns: string[];
}

export interface GrowthReport {
  agentName: string;
  snapshots: GrowthSnapshot[];
  resolvedPatterns: string[];
  activePatterns: string[];
  nextFocus: string;
}
