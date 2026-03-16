/**
 * Natural Language to Behavioral Policy
 *
 * Converts plain-English behavioral requirements into structured guard
 * policy rules for Holomime's behavioral enforcement engine.
 *
 * Ported and adapted from Antihero's nl_generator.py — keyword-based
 * intent extraction with confidence scoring. No LLM dependency.
 *
 * Examples:
 *   "Never be sycophantic with enterprise customers"
 *     → deny sycophantic-tendency pattern, enterprise_cs preset
 *
 *   "Be concise and direct, avoid hedging"
 *     → enforce over-verbose limit, deny hedge-stacking
 *
 *   "Allow empathetic responses but maintain strict boundaries"
 *     → allow over-apologizing within bounds, enforce boundary-violation strict
 */

// ─── Types ──────────────────────────────────────────────────

export interface BehavioralPolicyRule {
  id: string;
  description: string;
  effect: "enforce" | "deny" | "monitor";
  pattern: string;
  threshold: "strict" | "moderate" | "lenient";
  riskScore: number;
}

export interface BehavioralPolicy {
  name: string;
  description: string;
  rules: BehavioralPolicyRule[];
  confidence: number;
  preset?: string;
}

export interface PolicyIntent {
  effect: "enforce" | "deny" | "monitor";
  patterns: string[];
  threshold: "strict" | "moderate" | "lenient";
  riskScore: number;
  description: string;
  confidence: number;
}

// ─── Keyword Mappings ───────────────────────────────────────

/**
 * Maps behavioral keywords to Holomime detector patterns.
 * When a keyword is found in natural language input, the associated
 * patterns are added to the generated policy.
 */
const PATTERN_KEYWORDS: Record<string, string[]> = {
  // Sycophancy
  "sycophantic": ["sycophantic-tendency"],
  "sycophancy": ["sycophantic-tendency"],
  "agree with everything": ["sycophantic-tendency"],
  "people pleasing": ["sycophantic-tendency"],
  "yes-man": ["sycophantic-tendency"],
  "pushback": ["sycophantic-tendency"],
  "disagree": ["sycophantic-tendency"],

  // Hedging
  "hedging": ["hedge-stacking"],
  "hedge": ["hedge-stacking"],
  "wishy-washy": ["hedge-stacking"],
  "noncommittal": ["hedge-stacking"],
  "indecisive": ["hedge-stacking"],
  "it depends": ["hedge-stacking"],
  "definitive": ["hedge-stacking"],

  // Apologizing
  "apologizing": ["over-apologizing"],
  "apology": ["over-apologizing"],
  "sorry": ["over-apologizing"],
  "apologetic": ["over-apologizing"],
  "self-blame": ["over-apologizing"],

  // Boundaries
  "boundary": ["boundary-violation"],
  "boundaries": ["boundary-violation"],
  "scope": ["boundary-violation"],
  "out of scope": ["boundary-violation"],
  "medical advice": ["boundary-violation"],
  "legal advice": ["boundary-violation"],
  "financial advice": ["boundary-violation"],
  "stay in lane": ["boundary-violation"],

  // Tone / Sentiment
  "negative": ["negative-skew"],
  "pessimistic": ["negative-skew"],
  "hostile": ["negative-skew"],
  "balanced tone": ["negative-skew"],
  "positive": ["negative-skew"],

  // Verbosity
  "verbose": ["over-verbose"],
  "concise": ["over-verbose"],
  "brief": ["over-verbose"],
  "wordy": ["over-verbose"],
  "rambling": ["over-verbose"],
  "succinct": ["over-verbose"],
  "to the point": ["over-verbose"],

  // Register / Formality
  "formal": ["register-inconsistency"],
  "professional": ["register-inconsistency"],
  "casual": ["register-inconsistency"],
  "consistent voice": ["register-inconsistency"],
  "tone consistency": ["register-inconsistency"],
  "register": ["register-inconsistency"],

  // Error handling
  "error spiral": ["error-spiral"],
  "error recovery": ["error-spiral"],
  "compounding errors": ["error-spiral"],
  "mistake handling": ["error-spiral"],

  // Honesty (maps to multiple)
  "honest": ["sycophantic-tendency", "hedge-stacking"],
  "truthful": ["sycophantic-tendency"],
  "direct": ["hedge-stacking", "over-verbose"],
  "straightforward": ["hedge-stacking", "over-verbose"],

  // Empathy (nuanced — allow some patterns within bounds)
  "empathetic": ["over-apologizing"],
  "compassionate": ["over-apologizing"],
  "warm": ["over-apologizing", "negative-skew"],
};

/**
 * Effect keywords — determine whether the rule denies, enforces, or monitors.
 */
const DENY_WORDS = ["never", "don't", "no", "block", "deny", "prevent", "prohibit", "forbid", "stop", "avoid", "eliminate", "remove"];
const ENFORCE_WORDS = ["always", "must", "require", "enforce", "ensure", "maintain", "keep", "stay"];
const MONITOR_WORDS = ["monitor", "track", "watch", "log", "alert", "flag", "detect", "report"];

/**
 * Threshold keywords — how strictly to enforce the rule.
 */
const STRICT_WORDS = ["strict", "strictly", "never", "zero tolerance", "absolute", "always", "mandatory"];
const LENIENT_WORDS = ["gentle", "soft", "flexible", "within bounds", "some", "occasional", "moderate", "allow some"];

// ─── Behavioral Presets ─────────────────────────────────────

export interface BehavioralPreset {
  key: string;
  name: string;
  description: string;
  rules: BehavioralPolicyRule[];
}

const BEHAVIORAL_PRESETS: Record<string, BehavioralPreset> = {
  enterprise_cs: {
    key: "enterprise_cs",
    name: "Enterprise Customer Service",
    description: "Formal, no sycophancy, strict boundaries, concise responses",
    rules: [
      { id: "ecs-no-sycophancy", description: "Never agree with incorrect claims", effect: "deny", pattern: "sycophantic-tendency", threshold: "strict", riskScore: 0.8 },
      { id: "ecs-formal-register", description: "Maintain professional register", effect: "enforce", pattern: "register-inconsistency", threshold: "strict", riskScore: 0.6 },
      { id: "ecs-strict-boundaries", description: "Never give medical/legal/financial advice", effect: "deny", pattern: "boundary-violation", threshold: "strict", riskScore: 0.9 },
      { id: "ecs-concise", description: "Keep responses concise and actionable", effect: "enforce", pattern: "over-verbose", threshold: "moderate", riskScore: 0.4 },
      { id: "ecs-no-over-apology", description: "Acknowledge issues without excessive apology", effect: "deny", pattern: "over-apologizing", threshold: "moderate", riskScore: 0.5 },
    ],
  },
  creative_assistant: {
    key: "creative_assistant",
    name: "Creative Assistant",
    description: "Warm, flexible register, low hedge tolerance, empathetic",
    rules: [
      { id: "ca-no-hedging", description: "Give clear creative direction without hedging", effect: "deny", pattern: "hedge-stacking", threshold: "strict", riskScore: 0.7 },
      { id: "ca-allow-warmth", description: "Allow empathetic and warm responses", effect: "monitor", pattern: "over-apologizing", threshold: "lenient", riskScore: 0.2 },
      { id: "ca-flexible-register", description: "Adapt register to match user's creative energy", effect: "monitor", pattern: "register-inconsistency", threshold: "lenient", riskScore: 0.3 },
      { id: "ca-balanced-tone", description: "Maintain optimistic, encouraging tone", effect: "enforce", pattern: "negative-skew", threshold: "moderate", riskScore: 0.5 },
    ],
  },
  technical_expert: {
    key: "technical_expert",
    name: "Technical Expert",
    description: "Direct, concise, no emotional hedging, fact-based",
    rules: [
      { id: "te-no-hedging", description: "Provide definitive technical answers", effect: "deny", pattern: "hedge-stacking", threshold: "strict", riskScore: 0.7 },
      { id: "te-concise", description: "Technical responses should be concise", effect: "enforce", pattern: "over-verbose", threshold: "strict", riskScore: 0.6 },
      { id: "te-no-sycophancy", description: "Correct technical errors regardless of seniority", effect: "deny", pattern: "sycophantic-tendency", threshold: "strict", riskScore: 0.8 },
      { id: "te-error-recovery", description: "Clean error recovery without spiraling", effect: "enforce", pattern: "error-spiral", threshold: "moderate", riskScore: 0.5 },
      { id: "te-no-over-apology", description: "Address mistakes factually, not emotionally", effect: "deny", pattern: "over-apologizing", threshold: "moderate", riskScore: 0.5 },
    ],
  },
  healthcare_agent: {
    key: "healthcare_agent",
    name: "Healthcare Agent",
    description: "Empathetic, strict boundaries, high formality, careful hedging",
    rules: [
      { id: "ha-strict-boundaries", description: "Never provide medical diagnoses or prescriptions", effect: "deny", pattern: "boundary-violation", threshold: "strict", riskScore: 1.0 },
      { id: "ha-empathetic", description: "Allow empathetic, compassionate responses", effect: "monitor", pattern: "over-apologizing", threshold: "lenient", riskScore: 0.2 },
      { id: "ha-formal", description: "Maintain professional medical register", effect: "enforce", pattern: "register-inconsistency", threshold: "strict", riskScore: 0.7 },
      { id: "ha-balanced-tone", description: "Keep tone reassuring but factual", effect: "enforce", pattern: "negative-skew", threshold: "moderate", riskScore: 0.5 },
      { id: "ha-appropriate-hedging", description: "Allow appropriate medical hedging", effect: "monitor", pattern: "hedge-stacking", threshold: "lenient", riskScore: 0.3 },
    ],
  },
};

// ─── Parser ─────────────────────────────────────────────────

function extractIntents(text: string): PolicyIntent[] {
  const textLower = text.toLowerCase().trim();
  const intents: PolicyIntent[] = [];

  // Check for preset triggers
  for (const [presetKey] of Object.entries(BEHAVIORAL_PRESETS)) {
    if (textLower.includes(presetKey.replace(/_/g, " ")) || textLower.includes(presetKey)) {
      return [{
        effect: "enforce",
        patterns: [],
        threshold: "moderate",
        riskScore: 0.5,
        description: `Preset: ${presetKey}`,
        confidence: 0.95,
      }];
    }
  }

  // Split into sentences
  const sentences = text.split(/[.\n;!]+/).map(s => s.trim()).filter(Boolean);

  for (const sentence of sentences) {
    const intent = parseSingleRequirement(sentence);
    if (intent.confidence > 0) {
      intents.push(intent);
    }
  }

  // Fallback: if nothing parsed, create a generic monitor with low confidence
  if (intents.length === 0) {
    intents.push({
      effect: "monitor",
      patterns: ["*"],
      threshold: "moderate",
      riskScore: 0.3,
      description: text.slice(0, 200),
      confidence: 0.1,
    });
  }

  return intents;
}

function parseSingleRequirement(text: string): PolicyIntent {
  const textLower = text.toLowerCase();
  let confidence = 0;

  // Determine effect
  const hasDeny = DENY_WORDS.some(w => textLower.includes(w));
  const hasEnforce = ENFORCE_WORDS.some(w => textLower.includes(w));
  const hasMonitor = MONITOR_WORDS.some(w => textLower.includes(w));

  let effect: "enforce" | "deny" | "monitor" = "enforce";
  if (hasDeny) {
    // Deny dominates — if both deny and enforce words are present, deny wins
    effect = "deny";
    confidence += 0.3;
  } else if (hasEnforce) {
    effect = "enforce";
    confidence += 0.3;
  } else if (hasMonitor) {
    effect = "monitor";
    confidence += 0.25;
  }

  // Extract patterns
  const patterns: string[] = [];
  for (const [keyword, patternIds] of Object.entries(PATTERN_KEYWORDS)) {
    if (textLower.includes(keyword)) {
      for (const p of patternIds) {
        if (!patterns.includes(p)) {
          patterns.push(p);
        }
      }
      confidence += 0.2;
    }
  }

  if (patterns.length === 0) {
    patterns.push("*");
  }

  // Determine threshold
  let threshold: "strict" | "moderate" | "lenient" = "moderate";
  if (STRICT_WORDS.some(w => textLower.includes(w))) {
    threshold = "strict";
    confidence += 0.1;
  } else if (LENIENT_WORDS.some(w => textLower.includes(w))) {
    threshold = "lenient";
    confidence += 0.1;
  }

  // Determine risk score
  let riskScore = 0.5;
  if (textLower.match(/critical|dangerous|severe|zero tolerance/)) {
    riskScore = 0.9;
  } else if (textLower.match(/important|significant|must/)) {
    riskScore = 0.7;
  } else if (textLower.match(/minor|low|gentle|soft/)) {
    riskScore = 0.3;
  }

  return {
    effect,
    patterns,
    threshold,
    riskScore,
    description: text.slice(0, 200),
    confidence: Math.min(confidence, 1.0),
  };
}

// ─── Generator ──────────────────────────────────────────────

/**
 * Generate a behavioral policy from natural language requirements.
 *
 * @param requirements Plain-English behavioral requirements
 * @param name Optional policy name (auto-generated if empty)
 * @returns Structured behavioral policy with confidence score
 *
 * @example
 * ```ts
 * const policy = generateBehavioralPolicy("Never be sycophantic with enterprise customers");
 * // → { name: "never-be-sycophantic...", rules: [{ effect: "deny", pattern: "sycophantic-tendency", ... }], confidence: 0.7 }
 * ```
 */
export function generateBehavioralPolicy(
  requirements: string,
  name?: string,
): BehavioralPolicy {
  const textLower = requirements.toLowerCase().trim();

  // Check for preset triggers
  for (const [presetKey, preset] of Object.entries(BEHAVIORAL_PRESETS)) {
    if (textLower.includes(presetKey.replace(/_/g, " ")) || textLower.includes(presetKey)) {
      return {
        name: preset.name,
        description: preset.description,
        rules: preset.rules,
        confidence: 0.95,
        preset: presetKey,
      };
    }
  }

  // Parse intents
  const intents = extractIntents(requirements);

  // Generate name
  if (!name) {
    const words = requirements.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).slice(0, 5);
    name = words.join("-") || "generated-policy";
  }

  // Build rules from intents
  const rules: BehavioralPolicyRule[] = [];
  let ruleIndex = 0;

  for (const intent of intents) {
    for (const pattern of intent.patterns) {
      if (pattern === "*") continue;
      ruleIndex++;
      rules.push({
        id: `${name}-rule-${ruleIndex}`,
        description: intent.description,
        effect: intent.effect,
        pattern,
        threshold: intent.threshold,
        riskScore: intent.riskScore,
      });
    }
  }

  // If no specific rules generated, create a generic monitoring rule
  if (rules.length === 0) {
    rules.push({
      id: `${name}-rule-1`,
      description: requirements.slice(0, 200),
      effect: "monitor",
      pattern: "*",
      threshold: "moderate",
      riskScore: 0.3,
    });
  }

  const avgConfidence = intents.reduce((sum, i) => sum + i.confidence, 0) / intents.length;

  return {
    name,
    description: `Generated from: ${requirements.slice(0, 100)}`,
    rules,
    confidence: Math.round(avgConfidence * 100) / 100,
  };
}

/**
 * Format a behavioral policy as YAML-like output for display.
 */
export function formatPolicyYaml(policy: BehavioralPolicy): string {
  const lines: string[] = [
    `name: ${policy.name}`,
    `description: "${policy.description}"`,
    `confidence: ${policy.confidence}`,
  ];

  if (policy.preset) {
    lines.push(`preset: ${policy.preset}`);
  }

  lines.push(`rules:`);
  for (const rule of policy.rules) {
    lines.push(`  - id: ${rule.id}`);
    lines.push(`    description: "${rule.description}"`);
    lines.push(`    effect: ${rule.effect}`);
    lines.push(`    pattern: ${rule.pattern}`);
    lines.push(`    threshold: ${rule.threshold}`);
    lines.push(`    risk_score: ${rule.riskScore}`);
  }

  return lines.join("\n");
}

/**
 * Estimate how well we can parse the given requirements (0.0–1.0).
 */
export function estimateConfidence(requirements: string): number {
  const intents = extractIntents(requirements);
  if (intents.length === 0) return 0;
  return intents.reduce((sum, i) => sum + i.confidence, 0) / intents.length;
}

/**
 * List available behavioral presets.
 */
export function listPresets(): BehavioralPreset[] {
  return Object.values(BEHAVIORAL_PRESETS);
}

/**
 * Get a specific preset by key.
 */
export function getPreset(key: string): BehavioralPreset | undefined {
  return BEHAVIORAL_PRESETS[key];
}
