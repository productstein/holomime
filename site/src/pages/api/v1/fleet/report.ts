import type { APIRoute } from "astro";
import { getServiceClient } from "../../../../lib/api-auth.js";
import { fleetReportSchema, parseBody } from "../../../../lib/validation.js";

/**
 * Fleet agent health report endpoint.
 * Authenticated via X-Agent-Key header (not Bearer license token).
 * Called by the CLI fleet monitor to push periodic snapshots.
 */
export const POST: APIRoute = async ({ request }) => {
  const agentKey = request.headers.get("X-Agent-Key");
  if (!agentKey?.startsWith("fleet_")) {
    return new Response(JSON.stringify({ error: "Missing or invalid X-Agent-Key header" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  // Validate agent key
  const { data: agent } = await supabase
    .from("fleet_agents")
    .select("id, org_id, status")
    .eq("agent_key", agentKey)
    .limit(1)
    .single();

  if (!agent) {
    return new Response(JSON.stringify({ error: "Invalid agent key" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const parsed = await parseBody(request, fleetReportSchema);
  if ("error" in parsed) return parsed.error;

  const { driftEvents, patterns, riskLevel, messagesProcessed } = parsed.data;

  // Insert snapshot
  const { error: snapErr } = await supabase.from("fleet_snapshots").insert({
    agent_id: agent.id,
    drift_events: driftEvents,
    patterns: patterns ?? null,
    risk_level: riskLevel,
    messages_processed: messagesProcessed,
  });

  if (snapErr) {
    return new Response(JSON.stringify({ error: "Failed to record snapshot" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  // Update agent last_seen_at and status based on risk
  const newStatus = riskLevel === "high" ? "alerting" : "active";
  await supabase
    .from("fleet_agents")
    .update({ last_seen_at: new Date().toISOString(), status: newStatus })
    .eq("id", agent.id);

  return new Response(JSON.stringify({ recorded: true }), { status: 200, headers: { "Content-Type": "application/json" } });
};
