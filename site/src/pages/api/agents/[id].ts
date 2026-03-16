import type { APIRoute } from "astro";
import { createServiceClient } from "../../../lib/supabase.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

/** GET /api/agents/:id — Fetch agent + current vector */
export const GET: APIRoute = async ({ params, request, cookies, locals }) => {
  const user = (locals as any).user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: JSON_HEADERS });
  }

  const supabase = createServiceClient(request, cookies);

  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!agent) {
    return new Response(JSON.stringify({ error: "Agent not found" }), { status: 404, headers: JSON_HEADERS });
  }

  let currentVector = null;
  if (agent.current_vector_id) {
    const { data } = await supabase
      .from("personality_vectors")
      .select("*")
      .eq("id", agent.current_vector_id)
      .single();
    currentVector = data;
  }

  // Fetch version history
  const { data: versions } = await supabase
    .from("personality_vectors")
    .select("id, version, hash, created_at")
    .eq("agent_id", agent.id)
    .order("version", { ascending: false });

  return new Response(JSON.stringify({ agent, currentVector, versions: versions ?? [] }), { status: 200, headers: JSON_HEADERS });
};

/** PUT /api/agents/:id — Update agent metadata */
export const PUT: APIRoute = async ({ params, request, cookies, locals }) => {
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

  const supabase = createServiceClient(request, cookies);

  const updates: any = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string") updates.name = body.name.slice(0, 100);
  if (typeof body.description === "string") updates.description = body.description.slice(0, 500);
  if (typeof body.is_public === "boolean") updates.is_public = body.is_public;

  const { data, error } = await supabase
    .from("agents")
    .update(updates)
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error || !data) {
    return new Response(JSON.stringify({ error: "Failed to update agent" }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ agent: data }), { status: 200, headers: JSON_HEADERS });
};

/** DELETE /api/agents/:id — Delete agent (cascades vectors, snapshots) */
export const DELETE: APIRoute = async ({ params, request, cookies, locals }) => {
  const user = (locals as any).user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: JSON_HEADERS });
  }

  const supabase = createServiceClient(request, cookies);

  const { error } = await supabase
    .from("agents")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to delete agent" }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ deleted: true }), { status: 200, headers: JSON_HEADERS });
};
