import type { APIRoute } from "astro";
import { authenticateApiRequest, requireTier, isDemoUser, requireOrg, requireOrgAdmin, logAudit, getServiceClient } from "../../../../lib/api-auth.js";
import { registerAgentSchema, removeAgentSchema, parseBody } from "../../../../lib/validation.js";

function generateAgentKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `fleet_${Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")}`;
}

export const GET: APIRoute = async ({ request }) => {
  const auth = await authenticateApiRequest(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const tierCheck = requireTier(auth.license!, "enterprise");
  if (tierCheck) return tierCheck;

  const orgResult = await requireOrg(auth.license!);
  if (orgResult instanceof Response) return orgResult;

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const { data: agents } = await supabase
    .from("fleet_agents")
    .select("id, name, agent_key, status, last_seen_at, created_at")
    .eq("org_id", orgResult.orgId)
    .order("created_at", { ascending: true });

  return new Response(JSON.stringify({ agents: agents ?? [] }), { status: 200, headers: { "Content-Type": "application/json" } });
};

export const POST: APIRoute = async ({ request }) => {
  const auth = await authenticateApiRequest(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const tierCheck = requireTier(auth.license!, "enterprise");
  if (tierCheck) return tierCheck;
  if (isDemoUser(auth.license!)) {
    return new Response(JSON.stringify({ error: "Demo mode — read only. Create an account to use this feature." }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const orgResult = await requireOrg(auth.license!);
  if (orgResult instanceof Response) return orgResult;

  const parsed = await parseBody(request, registerAgentSchema);
  if ("error" in parsed) return parsed.error;

  const { name, spec } = parsed.data;
  const agentKey = generateAgentKey();

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const { data: agent, error: err } = await supabase
    .from("fleet_agents")
    .insert({
      org_id: orgResult.orgId,
      name,
      agent_key: agentKey,
      spec: spec ?? null,
    })
    .select("id, name, agent_key, status, created_at")
    .single();

  if (err || !agent) {
    return new Response(JSON.stringify({ error: "Failed to register agent" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  await logAudit(orgResult.orgId, auth.license!.id, "fleet.register", {
    resourceType: "fleet_agent",
    resourceId: agent.id,
    metadata: { name },
  });

  return new Response(JSON.stringify({ agent }), { status: 201, headers: { "Content-Type": "application/json" } });
};

export const DELETE: APIRoute = async ({ request }) => {
  const auth = await authenticateApiRequest(request);
  if (!auth.valid) {
    return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const tierCheck = requireTier(auth.license!, "enterprise");
  if (tierCheck) return tierCheck;
  if (isDemoUser(auth.license!)) {
    return new Response(JSON.stringify({ error: "Demo mode — read only. Create an account to use this feature." }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const orgResult = await requireOrg(auth.license!);
  if (orgResult instanceof Response) return orgResult;

  const adminCheck = requireOrgAdmin(orgResult.role);
  if (adminCheck) return adminCheck;

  const parsed = await parseBody(request, removeAgentSchema);
  if ("error" in parsed) return parsed.error;

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  const { error: delErr } = await supabase
    .from("fleet_agents")
    .delete()
    .eq("id", parsed.data.agentId)
    .eq("org_id", orgResult.orgId);

  if (delErr) {
    return new Response(JSON.stringify({ error: "Failed to remove agent" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  await logAudit(orgResult.orgId, auth.license!.id, "fleet.remove", {
    resourceType: "fleet_agent",
    resourceId: parsed.data.agentId,
  });

  return new Response(JSON.stringify({ removed: true }), { status: 200, headers: { "Content-Type": "application/json" } });
};
