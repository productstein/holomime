import type { APIRoute } from "astro";
import { aggregateLeaderboard, aggregateStacks, aggregateOrchestrators, type RawSubmission } from "../../../../lib/leaderboard-aggregation.js";

export const GET: APIRoute = async ({ url }) => {
  const { createClient } = await import("@supabase/supabase-js");

  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.SUPABASE_URL;
  const supabaseKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: "Service unavailable" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const view = url.searchParams.get("view");

  // Legacy flat view
  if (view === "submissions") {
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);
    const provider = url.searchParams.get("provider");

    let query = supabase
      .from("leaderboard")
      .select("agent_name, provider, model, score, grade, scenarios, submitted_at, holomime_version")
      .order("score", { ascending: false })
      .limit(limit);

    if (provider) query = query.eq("provider", provider);

    const { data, error } = await query;
    if (error) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch leaderboard" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const entries = (data ?? []).map((row: any) => ({
      agentName: row.agent_name,
      provider: row.provider,
      model: row.model,
      score: row.score,
      grade: row.grade,
      scenarios: row.scenarios,
      submittedAt: row.submitted_at,
      version: row.holomime_version,
    }));

    return new Response(
      JSON.stringify({ entries, total: entries.length }),
      { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } },
    );
  }

  // Extended select for stack/orchestrator views
  const extendedSelect = "agent_name, provider, model, score, grade, scenarios, submitted_at, holomime_version, orchestrator, stack, stack_id";

  // Stacks view
  if (view === "stacks") {
    const { data, error } = await supabase
      .from("leaderboard")
      .select(extendedSelect)
      .order("submitted_at", { ascending: false })
      .limit(5000);

    if (error) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch leaderboard" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const result = aggregateStacks((data ?? []) as RawSubmission[]);
    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } },
    );
  }

  // Orchestrators view
  if (view === "orchestrators") {
    const { data, error } = await supabase
      .from("leaderboard")
      .select(extendedSelect)
      .order("submitted_at", { ascending: false })
      .limit(5000);

    if (error) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch leaderboard" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const result = aggregateOrchestrators((data ?? []) as RawSubmission[]);
    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } },
    );
  }

  // Default: aggregated model view
  const { data, error } = await supabase
    .from("leaderboard")
    .select(extendedSelect)
    .order("submitted_at", { ascending: false })
    .limit(5000);

  if (error) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch leaderboard" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const result = aggregateLeaderboard((data ?? []) as RawSubmission[]);

  return new Response(
    JSON.stringify(result),
    { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } },
  );
};
