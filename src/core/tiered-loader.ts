/**
 * Tiered Personality Loading — L0 / L1 / L2 progressive context.
 *
 * Inspired by OpenViking's tiered context system. Instead of injecting
 * the full personality spec on every LLM call, load the minimum needed:
 *
 * - L0 (~200 tokens): Big Five scores + top behavioral flags. Always injected.
 * - L1 (~800 tokens): L0 + communication style + domain boundaries + growth areas.
 * - L2 (full): Complete system prompt from generateSystemPrompt().
 *
 * Use compileL0 for high-throughput APIs. Escalate to L1/L2 when drift is detected.
 */

import type { PersonalitySpec, Surface } from "./types.js";
import { scoreLabel } from "../psychology/big-five.js";
import { generateSystemPrompt } from "./prompt-gen.js";

// ─── Types ─────────────────────────────────────────────────

export type PersonalityTier = "L0" | "L1" | "L2";

export interface TieredPersonality {
  /** Which tier this compilation represents. */
  tier: PersonalityTier;
  /** The compiled system prompt text for this tier. */
  prompt: string;
  /** Approximate token count (rough: 1 token ≈ 4 chars). */
  estimatedTokens: number;
  /** Agent name for identification. */
  agent: string;
}

// ─── L0: Abstract (~200 tokens) ────────────────────────────

/**
 * Compile L0 — minimal personality fingerprint.
 * Big Five scores + attachment style + top growth flags.
 * Suitable for every API call in high-throughput scenarios.
 */
export function compileL0(spec: PersonalitySpec): TieredPersonality {
  const lines: string[] = [];

  lines.push(`You are ${spec.name}.`);
  if (spec.purpose) lines.push(spec.purpose);

  // Big Five one-liner
  const b5 = spec.big_five;
  const traits = [
    `O:${(b5.openness.score * 100).toFixed(0)}%`,
    `C:${(b5.conscientiousness.score * 100).toFixed(0)}%`,
    `E:${(b5.extraversion.score * 100).toFixed(0)}%`,
    `A:${(b5.agreeableness.score * 100).toFixed(0)}%`,
    `ES:${(b5.emotional_stability.score * 100).toFixed(0)}%`,
  ].join(" ");
  lines.push(`Personality: ${traits}`);

  // Key behavioral flags
  const flags: string[] = [];
  if (b5.extraversion.facets.assertiveness >= 0.7) flags.push("assertive");
  if (b5.extraversion.facets.assertiveness <= 0.3) flags.push("deferential");
  if (b5.agreeableness.facets.empathy >= 0.7) flags.push("empathetic");
  if (b5.agreeableness.facets.empathy <= 0.3) flags.push("analytical");
  if (b5.emotional_stability.score >= 0.7) flags.push("calm-under-pressure");
  if (b5.conscientiousness.facets.attention_to_detail >= 0.8) flags.push("meticulous");
  if (b5.openness.facets.imagination >= 0.7) flags.push("imaginative");

  // Therapy flags
  const td = spec.therapy_dimensions;
  flags.push(`attachment:${td.attachment_style}`);
  if (td.boundary_awareness >= 0.7) flags.push("firm-boundaries");
  if (td.self_awareness >= 0.7) flags.push("self-aware");

  if (flags.length > 0) {
    lines.push(`Traits: ${flags.join(", ")}`);
  }

  // Communication register
  lines.push(`Register: ${spec.communication.register}. Conflict: ${spec.communication.conflict_approach}.`);

  // Hard limits (critical — always include)
  if (spec.domain.boundaries.hard_limits.length > 0) {
    lines.push(`Hard limits: ${spec.domain.boundaries.hard_limits.join("; ")}`);
  }

  // Top growth patterns to watch
  if (spec.growth.patterns_to_watch.length > 0) {
    lines.push(`Watch for: ${spec.growth.patterns_to_watch.slice(0, 3).join(", ")}`);
  }

  const prompt = lines.join("\n");
  return {
    tier: "L0",
    prompt,
    estimatedTokens: Math.ceil(prompt.length / 4),
    agent: spec.name,
  };
}

// ─── L1: Overview (~800 tokens) ────────────────────────────

/**
 * Compile L1 — expanded behavioral profile.
 * Includes Big Five behavioral instructions, communication style,
 * domain boundaries, and growth areas.
 * Use when drift is detected or for sessions needing more behavioral guidance.
 */
export function compileL1(spec: PersonalitySpec): TieredPersonality {
  const lines: string[] = [];

  // Identity
  lines.push(`You are ${spec.name}.`);
  if (spec.purpose) lines.push(spec.purpose);
  lines.push("");

  // Big Five — interpretive labels (not raw scores)
  lines.push("## Personality");
  const dimKeys = ["openness", "conscientiousness", "extraversion", "agreeableness", "emotional_stability"] as const;
  const dimLabels = ["Openness", "Conscientiousness", "Extraversion", "Agreeableness", "Emotional Stability"];
  for (let i = 0; i < dimKeys.length; i++) {
    const trait = spec.big_five[dimKeys[i]];
    lines.push(`- ${dimLabels[i]}: ${scoreLabel(trait.score)} (${(trait.score * 100).toFixed(0)}%)`);
  }
  lines.push("");

  // Key behavioral instructions (condensed from prompt-gen)
  lines.push("## Behavior");
  const b5 = spec.big_five;
  if (b5.extraversion.facets.assertiveness >= 0.7) {
    lines.push("- State opinions confidently. Minimize hedging.");
  } else if (b5.extraversion.facets.assertiveness <= 0.3) {
    lines.push("- Present options rather than directives. Let the human decide.");
  }
  if (b5.agreeableness.score >= 0.7) {
    lines.push("- Be warm and cooperative. Seek common ground.");
  } else if (b5.agreeableness.score <= 0.3) {
    lines.push("- Be direct. Point out problems clearly. Don't soften hard truths.");
  }
  if (b5.emotional_stability.score >= 0.7) {
    lines.push("- Stay calm under pressure. Don't apologize excessively.");
  }
  lines.push("");

  // Communication style
  lines.push("## Communication");
  lines.push(`- Register: ${spec.communication.register}`);
  lines.push(`- Format: ${spec.communication.output_format}`);
  lines.push(`- Conflict: ${spec.communication.conflict_approach}`);
  lines.push(`- Uncertainty: ${spec.communication.uncertainty_handling}`);
  if (spec.communication.emoji_policy === "never") lines.push("- No emojis.");
  lines.push("");

  // Therapy dimensions
  lines.push("## Self-Awareness");
  const td = spec.therapy_dimensions;
  lines.push(`- Attachment: ${td.attachment_style}. Learning: ${td.learning_orientation}.`);
  if (td.boundary_awareness >= 0.7) lines.push("- Maintain clear boundaries. Decline out-of-scope requests.");
  if (td.self_awareness >= 0.7) lines.push("- Know your limits. Say 'I don't know' when uncertain.");
  lines.push("");

  // Domain
  if (spec.domain.expertise.length > 0) {
    lines.push(`## Domain: ${spec.domain.expertise.join(", ")}`);
  }
  if (spec.domain.boundaries.refuses.length > 0) {
    lines.push(`- Refuse: ${spec.domain.boundaries.refuses.join("; ")}`);
  }
  if (spec.domain.boundaries.hard_limits.length > 0) {
    lines.push(`- Hard limits: ${spec.domain.boundaries.hard_limits.join("; ")}`);
  }
  lines.push("");

  // Growth
  if (spec.growth.patterns_to_watch.length > 0) {
    lines.push(`## Watch For: ${spec.growth.patterns_to_watch.join(", ")}`);
  }

  const prompt = lines.join("\n");
  return {
    tier: "L1",
    prompt,
    estimatedTokens: Math.ceil(prompt.length / 4),
    agent: spec.name,
  };
}

// ─── L2: Full ──────────────────────────────────────────────

/**
 * Compile L2 — full system prompt.
 * Delegates to generateSystemPrompt() for the complete behavioral spec.
 * Use for therapy sessions, benchmarks, or when precision matters.
 */
export function compileL2(spec: PersonalitySpec, surface: Surface = "chat"): TieredPersonality {
  const prompt = generateSystemPrompt(spec, surface);
  return {
    tier: "L2",
    prompt,
    estimatedTokens: Math.ceil(prompt.length / 4),
    agent: spec.name,
  };
}

// ─── Unified API ───────────────────────────────────────────

/**
 * Compile a personality spec at the requested tier.
 */
export function compileTiered(
  spec: PersonalitySpec,
  tier: PersonalityTier,
  surface: Surface = "chat",
): TieredPersonality {
  switch (tier) {
    case "L0": return compileL0(spec);
    case "L1": return compileL1(spec);
    case "L2": return compileL2(spec, surface);
  }
}

/**
 * Recommend a tier based on context.
 * - High-throughput API: L0
 * - Drift detected or mid-conversation escalation: L1
 * - Therapy, benchmarks, initial setup: L2
 */
export function recommendTier(context: {
  driftDetected?: boolean;
  isTherapySession?: boolean;
  isBenchmark?: boolean;
  highThroughput?: boolean;
}): PersonalityTier {
  if (context.isTherapySession || context.isBenchmark) return "L2";
  if (context.driftDetected) return "L1";
  if (context.highThroughput) return "L0";
  return "L1"; // sensible default
}
