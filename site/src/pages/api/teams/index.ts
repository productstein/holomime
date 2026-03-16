import type { APIRoute } from "astro";
import { createServiceClient } from "../../../lib/supabase.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

/** GET /api/teams — List user's teams with member count */
export const GET: APIRoute = async ({ request, cookies, locals }) => {
  const user = (locals as any).user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: JSON_HEADERS });
  }

  const supabase = createServiceClient(request, cookies);

  const { data: teams, error } = await supabase
    .from("teams")
    .select("*, team_members(count)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to fetch teams" }), { status: 500, headers: JSON_HEADERS });
  }

  const enriched = (teams ?? []).map((t: any) => ({
    ...t,
    member_count: t.team_members?.[0]?.count ?? 0,
    team_members: undefined,
  }));

  return new Response(JSON.stringify({ teams: enriched }), { status: 200, headers: JSON_HEADERS });
};

/** POST /api/teams — Create a new team, optionally with initial members */
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

  if (!body.name || typeof body.name !== "string") {
    return new Response(JSON.stringify({ error: "name is required" }), { status: 400, headers: JSON_HEADERS });
  }

  const supabase = createServiceClient(request, cookies);

  const { data: team, error: teamErr } = await supabase
    .from("teams")
    .insert({
      user_id: user.id,
      name: body.name.slice(0, 100),
      description: body.description?.slice(0, 500) ?? null,
      config: body.config ?? {},
    })
    .select()
    .single();

  if (teamErr || !team) {
    return new Response(JSON.stringify({ error: "Failed to create team" }), { status: 500, headers: JSON_HEADERS });
  }

  // Add initial members if provided
  if (Array.isArray(body.members) && body.members.length > 0) {
    const memberRows = body.members.map((m: any) => ({
      team_id: team.id,
      agent_id: m.agent_id ?? m.agentId,
      role: m.role ?? "member",
    }));

    await supabase.from("team_members").insert(memberRows);
  }

  return new Response(JSON.stringify({ team }), { status: 201, headers: JSON_HEADERS });
};
