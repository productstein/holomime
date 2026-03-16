import { z } from "zod";

// --- Trait Dimensions ---

export const traitDimensionSchema = z.enum([
  "warmth", "assertiveness", "formality", "humor", "directness",
  "empathy", "risk_tolerance", "creativity", "precision",
  "verbosity", "tempo", "authority_gradient",
]);
export type TraitDimension = z.infer<typeof traitDimensionSchema>;

export const traitValueSchema = z.number().min(0).max(1);

export const personalityTraitsSchema = z.object({
  warmth: traitValueSchema,
  assertiveness: traitValueSchema,
  formality: traitValueSchema,
  humor: traitValueSchema,
  directness: traitValueSchema,
  empathy: traitValueSchema,
  risk_tolerance: traitValueSchema,
  creativity: traitValueSchema,
  precision: traitValueSchema,
  verbosity: traitValueSchema,
  tempo: traitValueSchema,
  authority_gradient: traitValueSchema,
});
export type PersonalityTraits = z.infer<typeof personalityTraitsSchema>;

// --- Facets ---

export const facetsSchema = z.object({
  cognitive_style: z.enum(["analytical", "systems_thinking", "narrative", "first_principles"]).optional(),
  persuasion: z.enum(["data_led", "social_proof", "vision_led", "objection_handling"]).optional(),
  collaboration: z.enum(["coach", "pair_programmer", "delegate", "ask_before_acting"]).optional(),
});
export type Facets = z.infer<typeof facetsSchema>;

// --- Signatures ---

export const signaturesSchema = z.object({
  archetype: z.enum(["operator", "visionary", "educator", "closer", "researcher"]).optional(),
  tone_palette: z.array(z.string()).default([]),
  taboo_tones: z.array(z.string()).default([]),
});
export type Signatures = z.infer<typeof signaturesSchema>;

// --- Preferences ---

export const preferencesSchema = z.object({
  output_format: z.enum(["prose", "bullets", "mixed", "structured"]).default("mixed"),
  bullet_density: z.enum(["minimal", "moderate", "heavy"]).default("moderate"),
  emoji_policy: z.enum(["never", "sparingly", "freely"]).default("sparingly"),
  reasoning_transparency: z.enum(["hidden", "on_request", "always"]).default("on_request"),
  citation_behavior: z.enum(["none", "inline", "footnote"]).default("none"),
  decision_mode: z.enum(["recommend_with_tradeoffs", "just_decide"]).default("recommend_with_tradeoffs"),
});
export type Preferences = z.infer<typeof preferencesSchema>;

// --- Policies ---

export const policyRuleSchema = z.object({
  type: z.enum(["brand", "safety", "data", "escalation"]),
  name: z.string().min(1),
  description: z.string().optional(),
  rules: z.array(z.object({
    condition: z.string(),
    action: z.string(),
    severity: z.enum(["info", "warning", "critical"]).default("warning"),
  })),
  allowed_vocabulary: z.array(z.string()).optional(),
  blocked_vocabulary: z.array(z.string()).optional(),
  tone_ceiling: z.record(z.string(), z.number()).optional(),
});
export type PolicyRule = z.infer<typeof policyRuleSchema>;

export const policyDocumentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  name: z.string().min(1),
  rules: z.array(policyRuleSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type PolicyDocument = z.infer<typeof policyDocumentSchema>;

// --- Personality Vector ---

export const personalityVectorSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
  version: z.number().int().positive(),
  traits: personalityTraitsSchema,
  facets: facetsSchema.default({}),
  signatures: signaturesSchema.default({ tone_palette: [], taboo_tones: [] }),
  preferences: preferencesSchema.default({}),
  hash: z.string(),
  parentVectorId: z.string().uuid().nullable().optional(),
  createdAt: z.date(),
});
export type PersonalityVector = z.infer<typeof personalityVectorSchema>;

// --- Agent ---

export const agentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  name: z.string().min(1).max(100),
  handle: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().default(false),
  currentVectorId: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Agent = z.infer<typeof agentSchema>;

// --- Provider & Surface ---

export const providerSchema = z.enum(["anthropic", "openai", "gemini", "ollama"]);
export type Provider = z.infer<typeof providerSchema>;

export const surfaceSchema = z.enum(["chat", "email", "code_review", "slack", "api"]);
export type Surface = z.infer<typeof surfaceSchema>;

// --- Compiled Output ---

export const compiledConfigSchema = z.object({
  provider: providerSchema,
  surface: surfaceSchema,
  system_prompt: z.string(),
  temperature: z.number().min(0).max(2),
  top_p: z.number().min(0).max(1),
  max_tokens: z.number().int().positive(),
  stop_sequences: z.array(z.string()).optional(),
  metadata: z.object({
    vector_hash: z.string(),
    compiled_at: z.string(),
    archetype: z.string().optional(),
  }),
});
export type CompiledConfig = z.infer<typeof compiledConfigSchema>;

// --- Telemetry ---

export const telemetryEventSchema = z.object({
  id: z.string().uuid().optional(),
  agentId: z.string().uuid(),
  eventType: z.enum([
    "message.completed", "message.failed", "policy.violation",
    "drift.detected", "eval.completed", "compile.requested",
  ]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.date().optional(),
});
export type TelemetryEvent = z.infer<typeof telemetryEventSchema>;

export const healthScoreSchema = z.object({
  agentId: z.string().uuid(),
  overall: z.number().min(0).max(100),
  consistency: z.number().min(0).max(100),
  policyCompliance: z.number().min(0).max(100),
  performanceScore: z.number().min(0).max(100),
  driftLevel: z.enum(["none", "low", "moderate", "high"]),
  lastUpdated: z.date(),
});
export type HealthScore = z.infer<typeof healthScoreSchema>;

// --- Evaluation ---

export const evalScenarioSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  expectedBehavior: z.string(),
  rubric: z.object({
    criteria: z.array(z.object({
      name: z.string(),
      weight: z.number().min(0).max(1),
      description: z.string(),
    })),
  }),
  category: z.string().optional(),
});
export type EvalScenario = z.infer<typeof evalScenarioSchema>;

export const evalResultSchema = z.object({
  scenarioId: z.string(),
  score: z.number().min(0).max(100),
  response: z.string(),
  criteriaScores: z.record(z.string(), z.number()),
  feedback: z.string().optional(),
});
export type EvalResult = z.infer<typeof evalResultSchema>;

export const evalRunSchema = z.object({
  id: z.string().uuid(),
  suiteId: z.string().uuid(),
  vectorId: z.string().uuid(),
  results: z.array(evalResultSchema),
  overallScore: z.number().min(0).max(100),
  status: z.enum(["pending", "running", "completed", "failed"]),
  startedAt: z.date(),
  completedAt: z.date().nullable(),
});
export type EvalRun = z.infer<typeof evalRunSchema>;

// --- Avatar ---

export const avatarStyleSchema = z.enum(["pixel", "illustrated", "sculpted", "cinematic"]);
export type AvatarStyle = z.infer<typeof avatarStyleSchema>;

export const agentAvatarSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
  vectorId: z.string().uuid(),
  svgData: z.string(),
  style: avatarStyleSchema,
  createdAt: z.date(),
});
export type AgentAvatar = z.infer<typeof agentAvatarSchema>;

// --- API Key ---

export const apiKeySchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  keyHash: z.string(),
  prefix: z.string(),
  name: z.string().min(1).max(100),
  lastUsedAt: z.date().nullable(),
  createdAt: z.date(),
});
export type ApiKey = z.infer<typeof apiKeySchema>;

// --- User ---

export const planSchema = z.enum(["free", "pro", "team", "enterprise"]);
export type Plan = z.infer<typeof planSchema>;

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  username: z.string().min(3).max(50),
  displayName: z.string().max(100).optional(),
  avatarUrl: z.string().url().optional(),
  bio: z.string().max(500).optional(),
  plan: planSchema.default("free"),
  stripeCustomerId: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type User = z.infer<typeof userSchema>;

// --- API Input Schemas ---

export const createAgentInputSchema = z.object({
  name: z.string().min(1).max(100),
  handle: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/, "Handle must be lowercase alphanumeric with hyphens"),
  description: z.string().max(500).optional(),
  archetype: z.enum(["operator", "visionary", "educator", "closer", "researcher"]).optional(),
});
export type CreateAgentInput = z.infer<typeof createAgentInputSchema>;

export const updateTraitsInputSchema = z.object({
  agentId: z.string().uuid(),
  traits: personalityTraitsSchema.partial(),
  facets: facetsSchema.optional(),
  signatures: signaturesSchema.optional(),
  preferences: preferencesSchema.optional(),
});
export type UpdateTraitsInput = z.infer<typeof updateTraitsInputSchema>;

export const compileInputSchema = z.object({
  vectorId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  provider: providerSchema,
  surface: surfaceSchema.default("chat"),
});
export type CompileInput = z.infer<typeof compileInputSchema>;

export const forkInputSchema = z.object({
  sourceAgentId: z.string().uuid(),
  name: z.string().min(1).max(100),
  handle: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/),
});
export type ForkInput = z.infer<typeof forkInputSchema>;

export const discoverInputSchema = z.object({
  query: z.string().optional(),
  archetype: z.enum(["operator", "visionary", "educator", "closer", "researcher"]).optional(),
  provider: providerSchema.optional(),
  sortBy: z.enum(["trending", "most_forked", "highest_rated", "newest"]).default("trending"),
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type DiscoverInput = z.infer<typeof discoverInputSchema>;

// --- Teams ---

export const teamMemberRoleSchema = z.enum(["lead", "member", "specialist"]);
export type TeamMemberRole = z.infer<typeof teamMemberRoleSchema>;

export const teamMemberSchema = z.object({
  agentId: z.string().uuid(),
  role: teamMemberRoleSchema.default("member"),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const createTeamInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  members: z.array(teamMemberSchema).optional(),
});
export type CreateTeamInput = z.infer<typeof createTeamInputSchema>;

export const teamCompatibilitySchema = z.object({
  overallScore: z.number().min(0).max(100),
  diversityScore: z.number().min(0).max(100),
  coverageScore: z.number().min(0).max(100),
  gapAnalysis: z.array(z.object({
    dimension: traitDimensionSchema,
    coverage: z.enum(["strong", "moderate", "weak", "missing"]),
    maxValue: z.number().min(0).max(1),
    recommendation: z.string().optional(),
  })),
  pairScores: z.array(z.object({
    agentA: z.string().uuid(),
    agentB: z.string().uuid(),
    complementarity: z.number().min(0).max(1),
  })),
  aggregateTraits: personalityTraitsSchema,
});
export type TeamCompatibility = z.infer<typeof teamCompatibilitySchema>;

// --- Personality Evolution ---

export const snapshotTriggerSchema = z.enum([
  "manual", "auto", "fork", "archetype_load", "drift_detected",
]);
export type SnapshotTrigger = z.infer<typeof snapshotTriggerSchema>;

export const personalitySnapshotSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string().uuid(),
  vectorId: z.string().uuid(),
  trigger: snapshotTriggerSchema,
  traits: personalityTraitsSchema,
  facets: facetsSchema.default({}),
  signatures: signaturesSchema.default({ tone_palette: [], taboo_tones: [] }),
  preferences: preferencesSchema.default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.date(),
});
export type PersonalitySnapshot = z.infer<typeof personalitySnapshotSchema>;

export const driftReportSchema = z.object({
  agentId: z.string().uuid(),
  currentTraits: personalityTraitsSchema,
  baselineTraits: personalityTraitsSchema,
  driftPerTrait: z.record(traitDimensionSchema, z.number()),
  totalDrift: z.number(),
  driftLevel: z.enum(["none", "low", "moderate", "high"]),
  periodDays: z.number(),
});
export type DriftReport = z.infer<typeof driftReportSchema>;

// --- Embed Config ---

export const embedConfigSchema = z.object({
  handle: z.string(),
  theme: z.enum(["light", "dark"]).default("dark"),
  position: z.enum(["bottom-right", "bottom-left"]).default("bottom-right"),
  greeting: z.string().max(200).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  provider: providerSchema.default("anthropic"),
});
export type EmbedConfig = z.infer<typeof embedConfigSchema>;
