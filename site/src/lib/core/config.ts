// HoloMime shared configuration constants

export const TRAIT_DIMENSIONS = [
  "warmth",
  "assertiveness",
  "formality",
  "humor",
  "directness",
  "empathy",
  "risk_tolerance",
  "creativity",
  "precision",
  "verbosity",
  "tempo",
  "authority_gradient",
] as const;

export type TraitDimension = (typeof TRAIT_DIMENSIONS)[number];

export const TRAIT_LABELS: Record<TraitDimension, { low: string; high: string; description: string }> = {
  warmth: { low: "Reserved", high: "Warm", description: "Acknowledgment phrases, emotional mirroring" },
  assertiveness: { low: "Suggestive", high: "Assertive", description: "Recommendation firmness, hedging frequency" },
  formality: { low: "Casual", high: "Formal", description: "Register, contractions, structure" },
  humor: { low: "Serious", high: "Witty", description: "Wit allowance, levity threshold" },
  directness: { low: "Contextual", high: "Direct", description: "Intro length, answer-first vs. context-first" },
  empathy: { low: "Objective", high: "Empathetic", description: "Concern acknowledgment, emotional validation" },
  risk_tolerance: { low: "Cautious", high: "Bold", description: "Disclaimer frequency, confidence language" },
  creativity: { low: "Conventional", high: "Creative", description: "Novelty in suggestions, lateral thinking" },
  precision: { low: "Approximate", high: "Precise", description: "Definitions, caveats, unit checks" },
  verbosity: { low: "Concise", high: "Detailed", description: "Response length, structural density" },
  tempo: { low: "Measured", high: "Rapid", description: "Pace of engagement, follow-up frequency" },
  authority_gradient: { low: "Peer", high: "Authority", description: "Peer vs. mentor vs. executive tone" },
};

export const TRAIT_GROUPS = {
  communication: ["warmth", "formality", "humor", "directness", "verbosity"] as TraitDimension[],
  cognition: ["creativity", "precision", "risk_tolerance", "authority_gradient"] as TraitDimension[],
  behavior: ["assertiveness", "empathy", "tempo"] as TraitDimension[],
};

export const ARCHETYPES = {
  operator: {
    name: "Operator",
    description: "Pragmatic, efficient, results-driven",
    tagline: "Cut the noise. Ship the thing.",
    icon: "Crosshair",
    color: "#64748b",
    signatureTraits: ["directness", "precision", "tempo"] as TraitDimension[],
    traits: { warmth: 0.4, assertiveness: 0.7, formality: 0.5, humor: 0.2, directness: 0.8, empathy: 0.4, risk_tolerance: 0.4, creativity: 0.3, precision: 0.7, verbosity: 0.3, tempo: 0.7, authority_gradient: 0.6 },
  },
  visionary: {
    name: "Visionary",
    description: "Creative, big-picture, inspiring",
    tagline: "See the future. Make others believe it.",
    icon: "Lightbulb",
    color: "#f59e0b",
    signatureTraits: ["creativity", "risk_tolerance", "empathy"] as TraitDimension[],
    traits: { warmth: 0.6, assertiveness: 0.6, formality: 0.3, humor: 0.5, directness: 0.5, empathy: 0.6, risk_tolerance: 0.8, creativity: 0.9, precision: 0.4, verbosity: 0.6, tempo: 0.6, authority_gradient: 0.5 },
  },
  educator: {
    name: "Educator",
    description: "Patient, thorough, constructive",
    tagline: "Meet them where they are. Lift them higher.",
    icon: "GraduationCap",
    color: "#10b981",
    signatureTraits: ["empathy", "precision", "verbosity"] as TraitDimension[],
    traits: { warmth: 0.7, assertiveness: 0.4, formality: 0.5, humor: 0.3, directness: 0.4, empathy: 0.8, risk_tolerance: 0.3, creativity: 0.5, precision: 0.8, verbosity: 0.7, tempo: 0.4, authority_gradient: 0.6 },
  },
  closer: {
    name: "Closer",
    description: "Persuasive, confident, action-oriented",
    tagline: "Read the room. Ask for the close.",
    icon: "Target",
    color: "#f43f5e",
    signatureTraits: ["assertiveness", "directness", "tempo"] as TraitDimension[],
    traits: { warmth: 0.5, assertiveness: 0.9, formality: 0.6, humor: 0.4, directness: 0.9, empathy: 0.5, risk_tolerance: 0.7, creativity: 0.5, precision: 0.6, verbosity: 0.4, tempo: 0.8, authority_gradient: 0.7 },
  },
  researcher: {
    name: "Researcher",
    description: "Analytical, thorough, citation-heavy",
    tagline: "Follow the thread. Trust the evidence.",
    icon: "Microscope",
    color: "#6366f1",
    signatureTraits: ["precision", "verbosity", "formality"] as TraitDimension[],
    traits: { warmth: 0.3, assertiveness: 0.3, formality: 0.7, humor: 0.1, directness: 0.5, empathy: 0.3, risk_tolerance: 0.2, creativity: 0.4, precision: 0.9, verbosity: 0.8, tempo: 0.3, authority_gradient: 0.5 },
  },
} as const;

export type ArchetypeName = keyof typeof ARCHETYPES;

export const PROVIDERS = ["anthropic", "openai", "gemini", "ollama"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const SURFACES = ["chat", "email", "code_review", "slack", "api"] as const;
export type Surface = (typeof SURFACES)[number];

export const AVATAR_STYLES = ["pixel", "illustrated", "sculpted", "cinematic"] as const;
export type AvatarStyle = (typeof AVATAR_STYLES)[number];

export const PLANS = ["free", "pro", "team", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

export const PLAN_LIMITS: Record<Plan, { agents: number; compiledRequests: number; telemetryRetentionDays: number; embedDomains: number }> = {
  free: { agents: 3, compiledRequests: 1000, telemetryRetentionDays: 7, embedDomains: 0 },
  pro: { agents: -1, compiledRequests: 50000, telemetryRetentionDays: 90, embedDomains: 3 },
  team: { agents: -1, compiledRequests: 200000, telemetryRetentionDays: 365, embedDomains: 10 },
  enterprise: { agents: -1, compiledRequests: -1, telemetryRetentionDays: -1, embedDomains: -1 },
};

export const PLAN_HIERARCHY: Record<Plan, number> = {
  free: 0,
  pro: 1,
  team: 2,
  enterprise: 3,
};

export const FEATURE_GATES = {
  create_agent: "free",
  unlimited_agents: "pro",
  compile: "free",
  high_volume_compiles: "pro",
  avatar_video: "enterprise",
  custom_eval_suites: "pro",
  telemetry_extended: "pro",
  telemetry_full: "team",
  shared_catalog: "team",
  sso: "enterprise",
  dedicated_support: "enterprise",
  agent_teams: "team",
  embeddable_chat: "pro",
} as const satisfies Record<string, Plan>;

export type GatedFeature = keyof typeof FEATURE_GATES;

export const FEATURE_LABELS: Record<GatedFeature, { name: string; description: string }> = {
  create_agent: { name: "Create Agent", description: "Create a new personality agent" },
  unlimited_agents: { name: "Unlimited Agents", description: "No cap on number of agents" },
  compile: { name: "Compile Personality", description: "Compile personality to provider config" },
  high_volume_compiles: { name: "High Volume Compiles", description: "Up to 50,000 compiles per month" },
  avatar_video: { name: "Video Avatar", description: "Real-time AI video avatar using your face" },
  custom_eval_suites: { name: "Custom Eval Suites", description: "Create custom evaluation test suites" },
  telemetry_extended: { name: "Extended Telemetry", description: "90-day event retention" },
  telemetry_full: { name: "Full Telemetry", description: "365-day event retention" },
  shared_catalog: { name: "Shared Catalog", description: "Team-shared agent catalog" },
  sso: { name: "SSO", description: "Single sign-on integration" },
  dedicated_support: { name: "Dedicated Support", description: "Priority dedicated support" },
  agent_teams: { name: "Agent Teams", description: "Create agent teams with compatibility scoring" },
  embeddable_chat: { name: "Embeddable Chat", description: "Embed personality-powered chat on any website" },
};

export const PLAN_META: Record<Plan, {
  name: string;
  price: string;
  period: string;
  tagline: string;
  color: string;
  badge: string;
}> = {
  free: { name: "Free", price: "$0", period: "", tagline: "For experimenting", color: "#71717a", badge: "bg-zinc-700 text-zinc-300" },
  pro: { name: "Pro", price: "$29", period: "/mo", tagline: "For builders", color: "#8b5cf6", badge: "bg-violet-500/20 text-violet-300" },
  team: { name: "Team", price: "$149", period: "/mo", tagline: "For organizations", color: "#06b6d4", badge: "bg-cyan-500/20 text-cyan-300" },
  enterprise: { name: "Enterprise", price: "Custom", period: "", tagline: "For scale", color: "#f59e0b", badge: "bg-amber-500/20 text-amber-300" },
};

export function planMeetsMinimum(userPlan: Plan, requiredPlan: Plan): boolean {
  return PLAN_HIERARCHY[userPlan] >= PLAN_HIERARCHY[requiredPlan];
}

export function isWithinLimit(limit: number, current: number): boolean {
  return limit === -1 || current < limit;
}

export const COGNITIVE_STYLES = ["analytical", "systems_thinking", "narrative", "first_principles"] as const;
export const PERSUASION_STYLES = ["data_led", "social_proof", "vision_led", "objection_handling"] as const;
export const COLLABORATION_STYLES = ["coach", "pair_programmer", "delegate", "ask_before_acting"] as const;

export const TONE_PALETTE_OPTIONS = [
  "calm", "candid", "precise", "warm", "playful", "authoritative",
  "encouraging", "clinical", "conversational", "professional",
] as const;

export const TABOO_TONE_OPTIONS = [
  "snarky", "salesy", "condescending", "passive_aggressive",
  "overly_casual", "robotic", "preachy",
] as const;
