import type { APIRoute } from "astro";
import { compile } from "../../lib/core/compiler";
import { personalityTraitsSchema, facetsSchema, signaturesSchema, preferencesSchema, providerSchema, surfaceSchema } from "../../lib/core/types";
import { computeVectorHash } from "../../lib/core/hash";

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * POST /api/compile — Compile a personality vector into a provider-specific config.
 * Pure computation, no DB required. Auth optional (rate-limit by IP for anon).
 */
export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: JSON_HEADERS });
  }

  const traitsResult = personalityTraitsSchema.safeParse(body.traits);
  if (!traitsResult.success) {
    return new Response(JSON.stringify({ error: "Invalid traits", details: traitsResult.error.issues }), { status: 400, headers: JSON_HEADERS });
  }

  const providerResult = providerSchema.safeParse(body.provider);
  if (!providerResult.success) {
    return new Response(JSON.stringify({ error: "Invalid provider. Must be: anthropic, openai, gemini, or ollama" }), { status: 400, headers: JSON_HEADERS });
  }

  const surface = surfaceSchema.parse(body.surface ?? "chat");
  const facets = facetsSchema.parse(body.facets ?? {});
  const signatures = signaturesSchema.parse(body.signatures ?? { tone_palette: [], taboo_tones: [] });
  const preferences = preferencesSchema.parse(body.preferences ?? {});

  const vectorHash = await computeVectorHash({
    traits: traitsResult.data,
    facets,
    signatures,
    preferences,
  });

  const compiled = compile({
    traits: traitsResult.data,
    facets,
    signatures,
    preferences,
    provider: providerResult.data,
    surface,
    vectorHash,
    policies: body.policies,
  });

  return new Response(JSON.stringify(compiled), { status: 200, headers: JSON_HEADERS });
};
