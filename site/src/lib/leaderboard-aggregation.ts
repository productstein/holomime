/**
 * Leaderboard Aggregation — Bayesian Trimmed Mean
 *
 * Groups individual benchmark submissions by model, computes a
 * confidence-weighted score that resists outliers and rewards
 * more community submissions.
 *
 * Formula: weighted_score = (n/(n+m)) * R + (m/(n+m)) * C
 *   n = submissions for this model
 *   m = 10 (confidence threshold)
 *   R = trimmed mean (or median if n < 5)
 *   C = global mean across all submissions
 */

// ─── Frontier Model Registry ────────────────────────────────

export const FRONTIER_MODELS: Record<string, string> = {
  // Anthropic
  "claude-opus-4-20250514": "Claude Opus 4",
  "claude-sonnet-4-20250514": "Claude Sonnet 4",
  "claude-haiku-4-5-20251001": "Claude Haiku 4.5",
  // OpenAI
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o Mini",
  "o3": "o3",
  "o4-mini": "o4-mini",
  // Google
  "gemini-2.0-flash": "Gemini 2.0 Flash",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  // Meta
  "llama3": "Llama 3",
  "llama4": "Llama 4",
  // Mistral
  "mistral-large": "Mistral Large",
  "mistral-7b": "Mistral 7B",
};

// ─── Types ──────────────────────────────────────────────────

export interface RawSubmission {
  agent_name: string;
  provider: string;
  model: string | null;
  score: number;
  grade: string;
  scenarios: any;
  submitted_at: string;
  holomime_version: string | null;
  license_id?: string;
  orchestrator?: string | null;
  stack?: { provider: string; model: string }[] | null;
  stack_id?: string | null;
}

export interface AggregatedModel {
  rank: number;
  provider: string;
  model: string;
  displayName: string;
  weightedScore: number;
  grade: string;
  submissionCount: number;
  confidence: "low" | "medium" | "high";
  contributors: number;
  lastSubmission: string;
}

export interface LeaderboardResult {
  frontier: AggregatedModel[];
  community: AggregatedModel[];
  meta: {
    totalModels: number;
    totalSubmissions: number;
    globalMean: number;
    methodology: string;
  };
}

// ─── Math Helpers ───────────────────────────────────────────

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function trimmedMean(scores: number[]): number {
  const sorted = [...scores].sort((a, b) => a - b);
  const n = sorted.length;

  if (n < 5) {
    return median(sorted);
  }

  const trimCount = Math.ceil(n * 0.1);
  const trimmed = sorted.slice(trimCount, n - trimCount);
  return mean(trimmed);
}

function gradeFromScore(score: number): string {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  if (score >= 30) return "D";
  return "F";
}

function confidenceTier(n: number): "low" | "medium" | "high" {
  if (n < 5) return "low";
  if (n < 15) return "medium";
  return "high";
}

// ─── Aggregation ────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 10; // m in the Bayesian formula

export function aggregateLeaderboard(rows: RawSubmission[]): LeaderboardResult {
  if (rows.length === 0) {
    return {
      frontier: [],
      community: [],
      meta: { totalModels: 0, totalSubmissions: 0, globalMean: 0, methodology: "bayesian-trimmed-mean" },
    };
  }

  // Global mean (floor of 50 if too few submissions)
  const globalMean = rows.length < 3 ? 50 : mean(rows.map((r) => r.score));

  // Group by provider + model
  const groups = new Map<string, RawSubmission[]>();
  for (const row of rows) {
    const model = row.model || "unknown";
    const key = `${row.provider}::${model}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  // Aggregate each group
  const allModels: (AggregatedModel & { isFrontier: boolean })[] = [];

  for (const [, submissions] of groups) {
    const scores = submissions.map((s) => s.score);
    const n = scores.length;
    const R = trimmedMean(scores);

    // Bayesian weighted score
    const weighted = (n / (n + CONFIDENCE_THRESHOLD)) * R + (CONFIDENCE_THRESHOLD / (n + CONFIDENCE_THRESHOLD)) * globalMean;

    const model = submissions[0].model || "unknown";
    const provider = submissions[0].provider;
    const isFrontier = model in FRONTIER_MODELS;

    // Count unique contributors by agent_name
    const uniqueAgents = new Set(submissions.map((s) => s.agent_name));

    // Most recent submission
    const latest = submissions.reduce((a, b) => (a.submitted_at > b.submitted_at ? a : b));

    allModels.push({
      rank: 0, // assigned after sorting
      provider,
      model,
      displayName: FRONTIER_MODELS[model] || model,
      weightedScore: Math.round(weighted * 10) / 10,
      grade: gradeFromScore(weighted),
      submissionCount: n,
      confidence: confidenceTier(n),
      contributors: uniqueAgents.size,
      lastSubmission: latest.submitted_at,
      isFrontier,
    });
  }

  // Split and sort
  const frontier = allModels
    .filter((m) => m.isFrontier)
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .map((m, i) => {
      const { isFrontier: _, ...rest } = m;
      return { ...rest, rank: i + 1 };
    });

  const community = allModels
    .filter((m) => !m.isFrontier)
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .map((m, i) => {
      const { isFrontier: _, ...rest } = m;
      return { ...rest, rank: i + 1 };
    });

  return {
    frontier,
    community,
    meta: {
      totalModels: allModels.length,
      totalSubmissions: rows.length,
      globalMean: Math.round(globalMean * 10) / 10,
      methodology: "bayesian-trimmed-mean",
    },
  };
}

// ─── Orchestrator Registry ──────────────────────────────────

export const KNOWN_ORCHESTRATORS: Record<string, string> = {
  "openclaw": "OpenClaw",
  "claude-code": "Claude Code",
  "cursor": "Cursor",
  "cline": "Cline",
  "windsurf": "Windsurf",
  "aider": "Aider",
  "codex": "Codex CLI",
  "copilot": "GitHub Copilot",
};

// ─── Stack Types ────────────────────────────────────────────

export interface AggregatedStack {
  rank: number;
  stackId: string;
  models: { provider: string; model: string; displayName: string }[];
  displayName: string;
  orchestrator: string | null;
  weightedScore: number;
  grade: string;
  submissionCount: number;
  confidence: "low" | "medium" | "high";
  contributors: number;
  lastSubmission: string;
}

export interface StackLeaderboardResult {
  stacks: AggregatedStack[];
  meta: {
    totalStacks: number;
    totalSubmissions: number;
    globalMean: number;
    methodology: string;
  };
}

export interface AggregatedOrchestrator {
  rank: number;
  orchestrator: string;
  displayName: string;
  weightedScore: number;
  grade: string;
  submissionCount: number;
  confidence: "low" | "medium" | "high";
  modelCount: number;
  lastSubmission: string;
}

export interface OrchestratorLeaderboardResult {
  orchestrators: AggregatedOrchestrator[];
  meta: {
    totalOrchestrators: number;
    totalSubmissions: number;
    globalMean: number;
    methodology: string;
  };
}

// ─── Stack ID ───────────────────────────────────────────────

export async function computeStackId(stack: { provider: string; model: string }[]): Promise<string> {
  const sorted = [...stack]
    .map((s) => `${s.provider}::${s.model}`)
    .sort();
  const data = new TextEncoder().encode(JSON.stringify(sorted));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

// ─── Stack Aggregation ──────────────────────────────────────

export function aggregateStacks(rows: RawSubmission[]): StackLeaderboardResult {
  const stackRows = rows.filter((r) => r.stack_id);
  if (stackRows.length === 0) {
    return {
      stacks: [],
      meta: { totalStacks: 0, totalSubmissions: 0, globalMean: 0, methodology: "bayesian-trimmed-mean" },
    };
  }

  const globalMean = stackRows.length < 3 ? 50 : mean(stackRows.map((r) => r.score));

  const groups = new Map<string, RawSubmission[]>();
  for (const row of stackRows) {
    const key = row.stack_id!;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const allStacks: AggregatedStack[] = [];

  for (const [stackId, submissions] of groups) {
    const scores = submissions.map((s) => s.score);
    const n = scores.length;
    const R = trimmedMean(scores);
    const weighted = (n / (n + CONFIDENCE_THRESHOLD)) * R + (CONFIDENCE_THRESHOLD / (n + CONFIDENCE_THRESHOLD)) * globalMean;

    // Build model list from the first submission's stack
    const stackData = submissions[0].stack ?? [];
    const models = stackData.map((s: { provider: string; model: string }) => ({
      provider: s.provider,
      model: s.model,
      displayName: FRONTIER_MODELS[s.model] || s.model,
    }));
    const displayName = models.map((m: { displayName: string }) => m.displayName).join(" + ");

    // Mode orchestrator (most frequent)
    const orchCounts = new Map<string, number>();
    for (const s of submissions) {
      if (s.orchestrator) {
        orchCounts.set(s.orchestrator, (orchCounts.get(s.orchestrator) ?? 0) + 1);
      }
    }
    let orchestrator: string | null = null;
    let maxCount = 0;
    for (const [orch, count] of orchCounts) {
      if (count > maxCount) { orchestrator = orch; maxCount = count; }
    }

    const uniqueAgents = new Set(submissions.map((s) => s.agent_name));
    const latest = submissions.reduce((a, b) => (a.submitted_at > b.submitted_at ? a : b));

    allStacks.push({
      rank: 0,
      stackId,
      models,
      displayName,
      orchestrator,
      weightedScore: Math.round(weighted * 10) / 10,
      grade: gradeFromScore(weighted),
      submissionCount: n,
      confidence: confidenceTier(n),
      contributors: uniqueAgents.size,
      lastSubmission: latest.submitted_at,
    });
  }

  allStacks.sort((a, b) => b.weightedScore - a.weightedScore);
  allStacks.forEach((s, i) => { s.rank = i + 1; });

  return {
    stacks: allStacks,
    meta: {
      totalStacks: allStacks.length,
      totalSubmissions: stackRows.length,
      globalMean: Math.round(globalMean * 10) / 10,
      methodology: "bayesian-trimmed-mean",
    },
  };
}

// ─── Orchestrator Aggregation ───────────────────────────────

export function aggregateOrchestrators(rows: RawSubmission[]): OrchestratorLeaderboardResult {
  const orchRows = rows.filter((r) => r.orchestrator);
  if (orchRows.length === 0) {
    return {
      orchestrators: [],
      meta: { totalOrchestrators: 0, totalSubmissions: 0, globalMean: 0, methodology: "bayesian-trimmed-mean" },
    };
  }

  const globalMean = orchRows.length < 3 ? 50 : mean(orchRows.map((r) => r.score));

  const groups = new Map<string, RawSubmission[]>();
  for (const row of orchRows) {
    const key = row.orchestrator!;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const allOrch: AggregatedOrchestrator[] = [];

  for (const [orch, submissions] of groups) {
    const scores = submissions.map((s) => s.score);
    const n = scores.length;
    const R = trimmedMean(scores);
    const weighted = (n / (n + CONFIDENCE_THRESHOLD)) * R + (CONFIDENCE_THRESHOLD / (n + CONFIDENCE_THRESHOLD)) * globalMean;

    const uniqueModels = new Set(submissions.map((s) => `${s.provider}::${s.model ?? "unknown"}`));
    const latest = submissions.reduce((a, b) => (a.submitted_at > b.submitted_at ? a : b));

    allOrch.push({
      rank: 0,
      orchestrator: orch,
      displayName: KNOWN_ORCHESTRATORS[orch] || orch,
      weightedScore: Math.round(weighted * 10) / 10,
      grade: gradeFromScore(weighted),
      submissionCount: n,
      confidence: confidenceTier(n),
      modelCount: uniqueModels.size,
      lastSubmission: latest.submitted_at,
    });
  }

  allOrch.sort((a, b) => b.weightedScore - a.weightedScore);
  allOrch.forEach((o, i) => { o.rank = i + 1; });

  return {
    orchestrators: allOrch,
    meta: {
      totalOrchestrators: allOrch.length,
      totalSubmissions: orchRows.length,
      globalMean: Math.round(globalMean * 10) / 10,
      methodology: "bayesian-trimmed-mean",
    },
  };
}
