import type { APIRoute } from "astro";
import { authenticateApiRequest, isDemoUser, logApiUsage, getServiceClient } from "../../../../lib/api-auth.js";
import { computeStackId } from "../../../../lib/leaderboard-aggregation.js";

export const POST: APIRoute = async ({ request }) => {
  const auth = await authenticateApiRequest(request);
  if (!auth.valid) {
    return new Response(
      JSON.stringify({ error: auth.error }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  if (isDemoUser(auth.license!)) {
    return new Response(
      JSON.stringify({ error: "Demo mode — read only." }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { agentName, provider, model, score, grade, scenarios, specHash, version,
          orchestrator, stack } = body;

  if (!agentName || !provider || score == null || !grade) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: agentName, provider, score, grade" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Validate optional stack field
  if (stack != null) {
    if (!Array.isArray(stack) || stack.length < 2 || !stack.every((s: any) => s.provider && s.model)) {
      return new Response(
        JSON.stringify({ error: "stack must be an array of 2+ {provider, model} objects" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // Validate optional orchestrator field
  if (orchestrator != null && (typeof orchestrator !== "string" || orchestrator.length > 100)) {
    return new Response(
      JSON.stringify({ error: "orchestrator must be a string (max 100 chars)" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Compute stack_id if stack provided
  let stackId: string | null = null;
  if (stack && Array.isArray(stack) && stack.length >= 2) {
    stackId = await computeStackId(stack);
  }

  // Score bounds — reject likely gaming
  const roundedScore = Math.round(score);
  if (roundedScore < 5 || roundedScore > 99) {
    return new Response(
      JSON.stringify({ error: "Score must be between 5 and 99. Extreme scores indicate likely gaming." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return new Response(
      JSON.stringify({ error: "Service unavailable" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  // Rate limit — max 3 submissions per license + model (or stack) per 24h
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let rateLimitQuery = supabase
    .from("leaderboard")
    .select("id", { count: "exact", head: true })
    .eq("license_id", auth.license!.id)
    .gte("submitted_at", oneDayAgo);

  if (stackId) {
    rateLimitQuery = rateLimitQuery.eq("stack_id", stackId);
  } else {
    rateLimitQuery = rateLimitQuery.eq("model", model ?? "");
  }

  const { count } = await rateLimitQuery;

  if (count !== null && count >= 3) {
    return new Response(
      JSON.stringify({ error: "Rate limit: max 3 submissions per model/stack per 24 hours" }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const entry = {
    license_id: auth.license!.id,
    agent_name: agentName,
    provider,
    model: model ?? null,
    score: roundedScore,
    grade,
    scenarios: scenarios ?? null,
    spec_hash: specHash ?? null,
    holomime_version: version ?? null,
    orchestrator: orchestrator ?? null,
    stack: stack ?? null,
    stack_id: stackId,
    submitted_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("leaderboard").insert(entry);
  if (error) {
    return new Response(
      JSON.stringify({ error: "Failed to submit: " + error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  await logApiUsage(auth.license!.id, "leaderboard.submit", { agentName, score, grade });

  return new Response(
    JSON.stringify({ success: true, message: "Benchmark published to leaderboard" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
