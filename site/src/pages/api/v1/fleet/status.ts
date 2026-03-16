import type { APIRoute } from "astro";
import { authenticateApiRequest, requireTier, requireOrg, getServiceClient } from "../../../../lib/api-auth.js";

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

  // Get all agents
  const { data: agents } = await supabase
    .from("fleet_agents")
    .select("id, name, status, last_seen_at, created_at")
    .eq("org_id", orgResult.orgId)
    .order("created_at", { ascending: true });

  const agentList = agents ?? [];

  // Mark agents as inactive if last_seen_at is older than 30 minutes
  const STALE_THRESHOLD_MS = 30 * 60 * 1000;
  const now = Date.now();
  for (const agent of agentList) {
    if (agent.last_seen_at && agent.status === "active") {
      const lastSeen = new Date(agent.last_seen_at).getTime();
      if (now - lastSeen > STALE_THRESHOLD_MS) {
        agent.status = "inactive";
      }
    }
  }

  // Fetch latest snapshots for all agents in one query using distinct on agent_id
  // (Supabase/PostgREST doesn't support DISTINCT ON, so fetch recent snapshots and deduplicate)
  const agentIds = agentList.map(a => a.id);
  const snapshotMap = new Map<string, any>();

  if (agentIds.length > 0) {
    const { data: snapshots } = await supabase
      .from("fleet_snapshots")
      .select("agent_id, drift_events, risk_level, messages_processed, created_at")
      .in("agent_id", agentIds)
      .order("created_at", { ascending: false });

    // Keep only the latest snapshot per agent
    for (const snap of snapshots ?? []) {
      if (!snapshotMap.has(snap.agent_id)) {
        snapshotMap.set(snap.agent_id, {
          drift_events: snap.drift_events,
          risk_level: snap.risk_level,
          messages_processed: snap.messages_processed,
          created_at: snap.created_at,
        });
      }
    }
  }

  const agentsWithSnapshots = agentList.map(agent => ({
    id: agent.id,
    name: agent.name,
    status: agent.status,
    lastSeen: agent.last_seen_at,
    latestSnapshot: snapshotMap.get(agent.id) ?? null,
  }));

  const totalAgents = agentList.length;
  const activeAgents = agentList.filter(a => a.status === "active").length;
  const inactiveAgents = agentList.filter(a => a.status === "inactive").length;
  const alertingAgents = agentList.filter(a => a.status === "alerting").length;

  return new Response(JSON.stringify({
    agents: agentsWithSnapshots,
    summary: { total: totalAgents, active: activeAgents, inactive: inactiveAgents, alerting: alertingAgents },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
};
