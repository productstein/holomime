import type { APIRoute } from "astro";
import { createAgentInputSchema } from "../../../lib/core/types";
import { ARCHETYPES } from "../../../lib/core/config";
import { computeVectorHash } from "../../../lib/core/hash";
import { createServiceClient } from "../../../lib/supabase.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

/** GET /api/agents — List current user's agents with current vector traits */
export const GET: APIRoute = async ({ request, cookies, locals }) => {
  const user = (locals as any).user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: JSON_HEADERS });
  }

  const supabase = createServiceClient(request, cookies);

  const { data: agents, error } = await supabase
    .from("agents")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to fetch agents" }), { status: 500, headers: JSON_HEADERS });
  }

  // Fetch current vectors for agents that have one
  const agentIds = (agents ?? []).filter((a: any) => a.current_vector_id).map((a: any) => a.current_vector_id);
  let vectors: any[] = [];
  if (agentIds.length > 0) {
    const { data } = await supabase
      .from("personality_vectors")
      .select("*")
      .in("id", agentIds);
    vectors = data ?? [];
  }

  const vectorMap = new Map(vectors.map((v: any) => [v.id, v]));
  const enriched = (agents ?? []).map((a: any) => ({
    ...a,
    currentVector: vectorMap.get(a.current_vector_id) ?? null,
  }));

  return new Response(JSON.stringify({ agents: enriched }), { status: 200, headers: JSON_HEADERS });
};

/** POST /api/agents — Create a new agent */
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

  const parsed = createAgentInputSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid input", details: parsed.error.issues }), { status: 400, headers: JSON_HEADERS });
  }

  const supabase = createServiceClient(request, cookies);

  // Check handle uniqueness
  const { data: existing } = await supabase
    .from("agents")
    .select("id")
    .eq("handle", parsed.data.handle)
    .limit(1)
    .single();

  if (existing) {
    return new Response(JSON.stringify({ error: "Handle already taken" }), { status: 409, headers: JSON_HEADERS });
  }

  // Create agent
  const { data: agent, error: agentErr } = await supabase
    .from("agents")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      handle: parsed.data.handle,
      description: parsed.data.description ?? null,
    })
    .select()
    .single();

  if (agentErr || !agent) {
    return new Response(JSON.stringify({ error: "Failed to create agent" }), { status: 500, headers: JSON_HEADERS });
  }

  // If archetype provided, create initial vector
  if (parsed.data.archetype && parsed.data.archetype in ARCHETYPES) {
    const archetype = ARCHETYPES[parsed.data.archetype as keyof typeof ARCHETYPES];
    const traits = { ...archetype.traits };
    const facets = {};
    const signatures = { archetype: parsed.data.archetype, tone_palette: [] as string[], taboo_tones: [] as string[] };
    const preferences = {};

    const hash = await computeVectorHash({ traits, facets, signatures, preferences });

    const { data: vector, error: vecErr } = await supabase
      .from("personality_vectors")
      .insert({
        agent_id: agent.id,
        version: 1,
        traits,
        facets,
        signatures,
        preferences,
        hash,
      })
      .select()
      .single();

    if (vector && !vecErr) {
      await supabase
        .from("agents")
        .update({ current_vector_id: vector.id })
        .eq("id", agent.id);

      return new Response(JSON.stringify({ agent: { ...agent, current_vector_id: vector.id }, vector }), { status: 201, headers: JSON_HEADERS });
    }
  }

  return new Response(JSON.stringify({ agent }), { status: 201, headers: JSON_HEADERS });
};
