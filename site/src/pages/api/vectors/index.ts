import type { APIRoute } from "astro";
import { personalityTraitsSchema, facetsSchema, signaturesSchema, preferencesSchema } from "../../../lib/core/types";
import { computeVectorHash } from "../../../lib/core/hash";
import { createServiceClient } from "../../../lib/supabase.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * POST /api/vectors — Create a new personality vector version for an agent.
 * Auto-increments version, computes hash, updates agent's current_vector_id.
 */
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const user = (locals as any).user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: JSON_HEADERS });
  }

  const clonedRequest = request.clone();
  let body: any;
  try {
    body = await clonedRequest.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: JSON_HEADERS });
  }

  if (!body.agent_id) {
    return new Response(JSON.stringify({ error: "agent_id is required" }), { status: 400, headers: JSON_HEADERS });
  }

  const traitsResult = personalityTraitsSchema.safeParse(body.traits);
  if (!traitsResult.success) {
    return new Response(JSON.stringify({ error: "Invalid traits", details: traitsResult.error.issues }), { status: 400, headers: JSON_HEADERS });
  }

  const facets = facetsSchema.parse(body.facets ?? {});
  const signatures = signaturesSchema.parse(body.signatures ?? { tone_palette: [], taboo_tones: [] });
  const preferences = preferencesSchema.parse(body.preferences ?? {});

  const supabase = createServiceClient(request, cookies);

  // Verify agent ownership
  const { data: agent } = await supabase
    .from("agents")
    .select("id, current_vector_id")
    .eq("id", body.agent_id)
    .eq("user_id", user.id)
    .single();

  if (!agent) {
    return new Response(JSON.stringify({ error: "Agent not found" }), { status: 404, headers: JSON_HEADERS });
  }

  // Get latest version number
  const { data: latestVec } = await supabase
    .from("personality_vectors")
    .select("version")
    .eq("agent_id", agent.id)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (latestVec?.version ?? 0) + 1;

  // Compute hash
  const hash = await computeVectorHash({
    traits: traitsResult.data,
    facets,
    signatures,
    preferences,
  });

  // Check for duplicate hash
  const { data: existingHash } = await supabase
    .from("personality_vectors")
    .select("id")
    .eq("hash", hash)
    .limit(1)
    .single();

  if (existingHash) {
    return new Response(JSON.stringify({ error: "Identical vector already exists", existingId: existingHash.id }), { status: 409, headers: JSON_HEADERS });
  }

  // Create vector
  const { data: vector, error: vecErr } = await supabase
    .from("personality_vectors")
    .insert({
      agent_id: agent.id,
      version: nextVersion,
      traits: traitsResult.data,
      facets,
      signatures,
      preferences,
      hash,
      parent_vector_id: agent.current_vector_id ?? null,
    })
    .select()
    .single();

  if (vecErr || !vector) {
    return new Response(JSON.stringify({ error: "Failed to create vector" }), { status: 500, headers: JSON_HEADERS });
  }

  // Update agent's current vector
  await supabase
    .from("agents")
    .update({ current_vector_id: vector.id, updated_at: new Date().toISOString() })
    .eq("id", agent.id);

  return new Response(JSON.stringify({ vector }), { status: 201, headers: JSON_HEADERS });
};
