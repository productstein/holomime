import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";
import { TRAIT_DIMENSIONS } from "../../../../lib/core/config";
import type { PersonalityTraits } from "../../../../lib/core/types";

const JSON_HEADERS = { "Content-Type": "application/json" };

function getSupabase() {
  const url = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.SUPABASE_URL;
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

/** GET /api/teams/:id/compatibility — Compute team compatibility score */
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

  // Get team members' agent IDs
  const { data: members } = await supabase
    .from("team_members")
    .select("agent_id")
    .eq("team_id", params.id);

  if (!members || members.length < 2) {
    return new Response(JSON.stringify({ error: "Need at least 2 members for compatibility" }), { status: 400, headers: JSON_HEADERS });
  }

  // Get current vectors for all agents
  const agentIds = members.map((m: any) => m.agent_id);
  const { data: agents } = await supabase
    .from("agents")
    .select("id, current_vector_id")
    .in("id", agentIds);

  const vectorIds = (agents ?? []).filter((a: any) => a.current_vector_id).map((a: any) => a.current_vector_id);
  if (vectorIds.length < 2) {
    return new Response(JSON.stringify({ error: "Need at least 2 agents with personality vectors" }), { status: 400, headers: JSON_HEADERS });
  }

  const { data: vectors } = await supabase
    .from("personality_vectors")
    .select("id, agent_id, traits")
    .in("id", vectorIds);

  if (!vectors || vectors.length < 2) {
    return new Response(JSON.stringify({ error: "Could not fetch personality vectors" }), { status: 500, headers: JSON_HEADERS });
  }

  const traitsList = vectors.map((v: any) => v.traits as PersonalityTraits);

  // Compute diversity score (std deviation across traits)
  const diversityScore = computeDiversity(traitsList);

  // Compute coverage score (max value per trait)
  const { coverageScore, gapAnalysis } = computeCoverage(traitsList);

  // Compute pairwise complementarity
  const pairScores = computePairScores(vectors);

  // Compute aggregate traits (average)
  const aggregateTraits = computeAggregate(traitsList);

  const overallScore = Math.round(diversityScore * 0.4 + coverageScore * 0.4 + averagePairScore(pairScores) * 0.2);

  return new Response(JSON.stringify({
    overallScore,
    diversityScore: Math.round(diversityScore),
    coverageScore: Math.round(coverageScore),
    gapAnalysis,
    pairScores,
    aggregateTraits,
  }), { status: 200, headers: JSON_HEADERS });
};

function computeDiversity(traitsList: PersonalityTraits[]): number {
  let totalStdDev = 0;
  for (const dim of TRAIT_DIMENSIONS) {
    const values = traitsList.map((t) => t[dim]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    totalStdDev += Math.sqrt(variance);
  }
  // Normalize: max std dev for 0-1 range is 0.5 (values at 0 and 1)
  const maxPossible = TRAIT_DIMENSIONS.length * 0.5;
  return (totalStdDev / maxPossible) * 100;
}

function computeCoverage(traitsList: PersonalityTraits[]) {
  const gapAnalysis: any[] = [];
  let totalCoverage = 0;

  for (const dim of TRAIT_DIMENSIONS) {
    const maxValue = Math.max(...traitsList.map((t) => t[dim]));
    let coverage: string;
    if (maxValue >= 0.7) coverage = "strong";
    else if (maxValue >= 0.5) coverage = "moderate";
    else if (maxValue >= 0.3) coverage = "weak";
    else coverage = "missing";

    totalCoverage += maxValue;
    gapAnalysis.push({
      dimension: dim,
      coverage,
      maxValue,
      recommendation: coverage === "missing" || coverage === "weak"
        ? `Consider adding an agent strong in ${dim}`
        : undefined,
    });
  }

  const coverageScore = (totalCoverage / TRAIT_DIMENSIONS.length) * 100;
  return { coverageScore, gapAnalysis };
}

function computePairScores(vectors: any[]) {
  const pairs: any[] = [];
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      const a = vectors[i].traits as PersonalityTraits;
      const b = vectors[j].traits as PersonalityTraits;

      // Complementarity: how much do they differ (cover different areas)?
      let diffSum = 0;
      for (const dim of TRAIT_DIMENSIONS) {
        diffSum += Math.abs(a[dim] - b[dim]);
      }
      const complementarity = diffSum / TRAIT_DIMENSIONS.length;

      pairs.push({
        agentA: vectors[i].agent_id,
        agentB: vectors[j].agent_id,
        complementarity: Math.round(complementarity * 100) / 100,
      });
    }
  }
  return pairs;
}

function averagePairScore(pairScores: any[]): number {
  if (pairScores.length === 0) return 50;
  const avg = pairScores.reduce((s, p) => s + p.complementarity, 0) / pairScores.length;
  return avg * 100;
}

function computeAggregate(traitsList: PersonalityTraits[]): PersonalityTraits {
  const result: any = {};
  for (const dim of TRAIT_DIMENSIONS) {
    result[dim] = Math.round((traitsList.reduce((s, t) => s + t[dim], 0) / traitsList.length) * 100) / 100;
  }
  return result as PersonalityTraits;
}
