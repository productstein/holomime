import type { Provider, Surface } from "@holomime/types";

interface ParameterRange {
  min: number;
  max: number;
}

interface ProviderParams {
  temperature: ParameterRange;
  top_p: ParameterRange;
  max_tokens: ParameterRange;
}

export const PROVIDER_PARAMS: Record<Provider, ProviderParams> = {
  anthropic: {
    temperature: { min: 0.0, max: 1.0 },
    top_p: { min: 0.0, max: 1.0 },
    max_tokens: { min: 1, max: 8192 },
  },
  openai: {
    temperature: { min: 0.0, max: 2.0 },
    top_p: { min: 0.0, max: 1.0 },
    max_tokens: { min: 1, max: 4096 },
  },
  gemini: {
    temperature: { min: 0.0, max: 2.0 },
    top_p: { min: 0.0, max: 1.0 },
    max_tokens: { min: 1, max: 8192 },
  },
  ollama: {
    temperature: { min: 0.0, max: 2.0 },
    top_p: { min: 0.0, max: 1.0 },
    max_tokens: { min: 1, max: 4096 },
  },
};

export const SURFACE_MULTIPLIERS: Record<Surface, number> = {
  chat: 1.0,
  email: 1.5,
  code_review: 2.0,
  slack: 0.8,
  api: 1.0,
};
