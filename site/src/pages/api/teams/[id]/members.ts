import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function getSupabase() {
  const url = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.SUPABASE_URL;
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

/** GET /api/teams/:id/members — List team members with agent details */
export const GET: APIRoute = async ({ params, locals }) => {
  const user = (locals as any).user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: JSON_HEADERS });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: JSON_HEADERS });
  }

  // Verify team ownership
  const { data: team } = await supabase
    .from("teams")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!team) {
    return new Response(JSON.stringify({ error: "Team not found" }), { status: 404, headers: JSON_HEADERS });
  }

  const { data: members } = await supabase
    .from("team_members")
    .select("agent_id, role, added_at")
    .eq("team_id", params.id);

  // Fetch agent details
  const agentIds = (members ?? []).map((m: any) => m.agent_id);
  let agents: any[] = [];
  if (agentIds.length > 0) {
    const { data } = await supabase
      .from("agents")
      .select("id, name, handle, description, current_vector_id")
      .in("id", agentIds);
    agents = data ?? [];
  }

  const agentMap = new Map(agents.map((a: any) => [a.id, a]));
  const enriched = (members ?? []).map((m: any) => ({
    ...m,
    agent: agentMap.get(m.agent_id) ?? null,
  }));

  return new Response(JSON.stringify({ members: enriched }), { status: 200, headers: JSON_HEADERS });
};

/** POST /api/teams/:id/members — Add agent to team */
export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = (locals as any).user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: JSON_HEADERS });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: JSON_HEADERS });
  }

  if (!body.agent_id) {
    return new Response(JSON.stringify({ error: "agent_id is required" }), { status: 400, headers: JSON_HEADERS });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: JSON_HEADERS });
  }

  // Verify team ownership
  const { data: team } = await supabase
    .from("teams")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!team) {
    return new Response(JSON.stringify({ error: "Team not found" }), { status: 404, headers: JSON_HEADERS });
  }

  const { error } = await supabase
    .from("team_members")
    .insert({
      team_id: params.id,
      agent_id: body.agent_id,
      role: body.role ?? "member",
    });

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to add member" }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ added: true }), { status: 201, headers: JSON_HEADERS });
};

/** DELETE /api/teams/:id/members — Remove agent from team */
export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const user = (locals as any).user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: JSON_HEADERS });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: JSON_HEADERS });
  }

  if (!body.agent_id) {
    return new Response(JSON.stringify({ error: "agent_id is required" }), { status: 400, headers: JSON_HEADERS });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: JSON_HEADERS });
  }

  // Verify team ownership
  const { data: team } = await supabase
    .from("teams")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!team) {
    return new Response(JSON.stringify({ error: "Team not found" }), { status: 404, headers: JSON_HEADERS });
  }

  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("team_id", params.id)
    .eq("agent_id", body.agent_id);

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to remove member" }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ removed: true }), { status: 200, headers: JSON_HEADERS });
};
