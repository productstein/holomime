import type { PersonalityTraits, Facets, Signatures, Preferences, Provider, Surface, CompiledConfig } from "@holomime/types";
import { generateSystemPrompt } from "./prompt-generator";
import { PROVIDER_PARAMS, SURFACE_MULTIPLIERS } from "./parameters";

export interface CompileInput {
  traits: PersonalityTraits;
  facets: Facets;
  signatures: Signatures;
  preferences: Preferences;
  provider: Provider;
  surface: Surface;
  vectorHash: string;
  policies?: Array<{ type: string; name: string; rules: Array<{ condition: string; action: string }> }>;
}

/**
 * The Compatibility Compiler — HoloMime's core differentiator.
 *
 * Transforms a personality vector into a provider-specific runtime configuration.
 * Same personality vector → consistent behavior across Claude, GPT, Gemini, and local models.
 */
export function compile(input: CompileInput): CompiledConfig {
  const { traits, facets, signatures, preferences, provider, surface, vectorHash, policies } = input;

  // 1. Derive model parameters from trait dimensions
  const temperature = computeTemperature(traits, provider);
  const topP = computeTopP(traits, provider);
  const maxTokens = computeMaxTokens(traits, provider, surface);

  // 2. Generate the system prompt from traits + facets + signatures + preferences + policies
  const systemPrompt = generateSystemPrompt({
    traits,
    facets,
    signatures,
    preferences,
    surface,
    policies,
  });

  return {
    provider,
    surface,
    system_prompt: systemPrompt,
    temperature,
    top_p: topP,
    max_tokens: maxTokens,
    metadata: {
      vector_hash: vectorHash,
      compiled_at: new Date().toISOString(),
      archetype: signatures.archetype,
    },
  };
}

/**
 * Temperature controls randomness/creativity in responses.
 * Formula weights creativity, risk_tolerance, humor, and inverse precision.
 */
function computeTemperature(traits: PersonalityTraits, provider: Provider): number {
  const raw =
    traits.creativity * 0.35 +
    traits.risk_tolerance * 0.25 +
    traits.humor * 0.15 +
    (1 - traits.precision) * 0.25;

  const { temperature: range } = PROVIDER_PARAMS[provider];
  return clamp(raw * range.max, range.min, range.max);
}

/**
 * Top-P (nucleus sampling) controls diversity of token selection.
 */
function computeTopP(traits: PersonalityTraits, provider: Provider): number {
  const raw =
    traits.creativity * 0.30 +
    traits.verbosity * 0.20 +
    traits.risk_tolerance * 0.20 +
    (1 - traits.precision) * 0.30;

  const { top_p: range } = PROVIDER_PARAMS[provider];
  // Map to a narrower effective range (0.5-1.0) to avoid incoherence
  const mapped = 0.5 + raw * 0.5;
  return clamp(mapped, range.min, range.max);
}

/**
 * Max tokens controls response length.
 * Weighted by verbosity, precision, and inverse directness.
 * Scaled by surface type (emails are longer, chat is shorter).
 */
function computeMaxTokens(traits: PersonalityTraits, provider: Provider, surface: Surface): number {
  const factor =
    traits.verbosity * 0.50 +
    traits.precision * 0.20 +
    (1 - traits.directness) * 0.30;

  const { max_tokens: range } = PROVIDER_PARAMS[provider];
  const surfaceMultiplier = SURFACE_MULTIPLIERS[surface];

  // Base range: 256-4096 for chat, scaled by surface
  const baseTokens = 256 + factor * (2048 - 256);
  const scaled = Math.round(baseTokens * surfaceMultiplier);

  return clamp(scaled, 256, range.max);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Explains the compilation decisions for debugging and transparency.
 */
export function explainCompilation(input: CompileInput): {
  temperature: { value: number; reasoning: string };
  top_p: { value: number; reasoning: string };
  max_tokens: { value: number; reasoning: string };
  prompt_sections: string[];
} {
  const compiled = compile(input);
  const { traits, surface } = input;

  return {
    temperature: {
      value: compiled.temperature,
      reasoning: `Derived from creativity (${traits.creativity}), risk_tolerance (${traits.risk_tolerance}), humor (${traits.humor}), precision (${traits.precision}). Higher creativity and risk tolerance increase temperature; higher precision decreases it.`,
    },
    top_p: {
      value: compiled.top_p,
      reasoning: `Derived from creativity (${traits.creativity}), verbosity (${traits.verbosity}), risk_tolerance (${traits.risk_tolerance}), precision (${traits.precision}). Controls diversity of token selection.`,
    },
    max_tokens: {
      value: compiled.max_tokens,
      reasoning: `Derived from verbosity (${traits.verbosity}), precision (${traits.precision}), directness (${traits.directness}). Surface "${surface}" applies a ${SURFACE_MULTIPLIERS[surface]}x multiplier.`,
    },
    prompt_sections: [
      "Core behavioral instructions (from trait dimensions)",
      "Cognitive style directive (from facets)",
      "Tone and voice constraints (from signatures)",
      "Output format preferences",
      "Policy enforcement rules",
    ],
  };
}
