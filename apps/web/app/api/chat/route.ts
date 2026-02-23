import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { compile, computeVectorHash } from "@holomime/core";
import type { PersonalityTraits, Facets, Signatures, Preferences, Provider } from "@holomime/types";

const providerModels: Record<string, { create: () => any; model: string }> = {
  anthropic: {
    create: () => createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }),
    model: "claude-sonnet-4-20250514",
  },
  openai: {
    create: () => createOpenAI({ apiKey: process.env.OPENAI_API_KEY! }),
    model: "gpt-4o-mini",
  },
};

export async function POST(req: Request) {
  const body = await req.json();
  const {
    messages,
    traits,
    facets,
    signatures,
    preferences,
    provider = "anthropic",
  } = body as {
    messages: { role: "user" | "assistant"; content: string }[];
    traits: PersonalityTraits;
    facets: Facets;
    signatures: Signatures;
    preferences: Preferences;
    provider: Provider;
  };

  // Compile the personality vector into a system prompt + parameters
  const hash = computeVectorHash({ traits, facets, signatures, preferences });
  const compiled = compile({
    traits,
    facets,
    signatures,
    preferences,
    provider,
    surface: "chat",
    vectorHash: hash,
  });

  // Pick provider — fall back to anthropic if the selected one has no key
  const resolvedProvider = providerModels[provider] && getEnvKey(provider)
    ? provider
    : "anthropic";

  const config = providerModels[resolvedProvider];
  if (!config || !getEnvKey(resolvedProvider)) {
    return Response.json(
      { error: "No API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in your environment." },
      { status: 503 },
    );
  }

  const sdk = config.create();

  const result = streamText({
    model: sdk(config.model),
    system: compiled.system_prompt,
    messages,
    temperature: compiled.temperature,
    topP: compiled.top_p,
    maxOutputTokens: Math.min(compiled.max_tokens, 1024), // cap for chat preview
  });

  return result.toTextStreamResponse();
}

function getEnvKey(provider: string): string | undefined {
  switch (provider) {
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "openai":
      return process.env.OPENAI_API_KEY;
    default:
      return undefined;
  }
}
