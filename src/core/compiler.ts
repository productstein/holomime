import type { PersonalitySpec, Provider, Surface, CompiledConfig, BigFive } from "./types.js";
import { generateSystemPrompt } from "./prompt-gen.js";
import { PROVIDER_PARAMS, SURFACE_MULTIPLIERS } from "./parameters.js";

export { compileEmbodied, computeMotionParameters, computeGazePolicy, computeProxemics, computeProsody, computeSyncProfile } from "./embodiment-compiler.js";
export type { CompiledEmbodiedConfig } from "./embodiment-types.js";

export interface CompileInput {
  spec: PersonalitySpec;
  provider: Provider;
  surface: Surface;
}

/**
 * The Personality Compiler.
 * Transforms a .personality.json spec into a provider-specific runtime configuration.
 * Same personality → consistent behavior across Claude, GPT, Gemini, and local models.
 */
export function compile(input: CompileInput): CompiledConfig {
  const { spec, provider, surface } = input;

  const temperature = computeTemperature(spec.big_five, provider);
  const topP = computeTopP(spec.big_five, provider);
  const maxTokens = computeMaxTokens(spec.big_five, provider, surface);
  const systemPrompt = generateSystemPrompt(spec, surface);

  return {
    provider,
    surface,
    system_prompt: systemPrompt,
    temperature,
    top_p: topP,
    max_tokens: maxTokens,
    metadata: {
      personality_hash: hashSpec(spec),
      compiled_at: new Date().toISOString(),
      holomime_version: "1.1.0",
    },
  };
}

/**
 * Temperature from Big Five:
 * - Openness (imagination, experimentation) → more creative/random output
 * - Conscientiousness (orderliness, detail) → more deterministic output
 * - Extraversion (enthusiasm) → slight increase in variety
 */
function computeTemperature(bigFive: BigFive, provider: Provider): number {
  const o = bigFive.openness;
  const c = bigFive.conscientiousness;
  const e = bigFive.extraversion;

  const raw =
    o.facets.imagination * 0.25 +
    o.facets.willingness_to_experiment * 0.20 +
    (1 - c.facets.orderliness) * 0.20 +
    (1 - c.facets.attention_to_detail) * 0.15 +
    e.facets.enthusiasm * 0.10 +
    o.facets.intellectual_curiosity * 0.10;

  const { temperature: range } = PROVIDER_PARAMS[provider];
  return clamp(raw * range.max, range.min, range.max);
}

/**
 * Top-P from Big Five:
 * - Openness → wider token selection
 * - Low Conscientiousness → more diverse output
 * - Extraversion (sociability) → slight variety boost
 */
function computeTopP(bigFive: BigFive, provider: Provider): number {
  const o = bigFive.openness;
  const c = bigFive.conscientiousness;

  const raw =
    o.facets.imagination * 0.25 +
    o.facets.willingness_to_experiment * 0.20 +
    (1 - c.facets.attention_to_detail) * 0.25 +
    (1 - c.facets.orderliness) * 0.15 +
    o.facets.aesthetic_sensitivity * 0.15;

  const { top_p: range } = PROVIDER_PARAMS[provider];
  const mapped = 0.5 + raw * 0.5;
  return clamp(mapped, range.min, range.max);
}

/**
 * Max tokens from Big Five:
 * - Extraversion (assertiveness, enthusiasm) → more verbose
 * - Conscientiousness (orderliness) → structured but potentially longer
 * - Agreeableness (warmth) → slightly more verbose (explains more)
 * - Low Extraversion → concise
 */
function computeMaxTokens(bigFive: BigFive, provider: Provider, surface: Surface): number {
  const e = bigFive.extraversion;
  const c = bigFive.conscientiousness;
  const a = bigFive.agreeableness;

  const factor =
    e.facets.enthusiasm * 0.30 +
    e.facets.assertiveness * 0.15 +
    c.facets.orderliness * 0.15 +
    a.facets.warmth * 0.15 +
    (e.score < 0.4 ? 0.3 : 0) * 0.25; // reserved agents → shorter

  const { max_tokens: range } = PROVIDER_PARAMS[provider];
  const surfaceMultiplier = SURFACE_MULTIPLIERS[surface];

  const baseTokens = 256 + factor * (2048 - 256);
  const scaled = Math.round(baseTokens * surfaceMultiplier);

  return clamp(scaled, 256, range.max);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Simple hash for personality spec (for change detection, not security).
 */
function hashSpec(spec: PersonalitySpec): string {
  const content = JSON.stringify({
    big_five: spec.big_five,
    therapy_dimensions: spec.therapy_dimensions,
    communication: spec.communication,
  });

  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36).padStart(8, "0");
}
