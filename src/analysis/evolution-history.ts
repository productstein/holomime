/**
 * Evolution History — persistent cross-session alignment memory.
 *
 * Tracks alignment progress across evolve runs in `.holomime/evolution.json`.
 * Each entry records patterns detected/resolved, health scores, DPO yield,
 * and changes applied — enabling longitudinal trend analysis.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

// ─── Types ─────────────────────────────────────────────────

export interface EvolutionEntry {
  timestamp: string;
  iteration: number;
  patternsDetected: string[];
  patternsResolved: string[];
  health: number;
  grade: string;
  dpoPairsExtracted: number;
  changesApplied: string[];
}

export interface EvolutionHistory {
  agent: string;
  entries: EvolutionEntry[];
  totalSessions: number;
  totalDPOPairs: number;
  firstSession: string;
  lastSession: string;
}

export interface EvolutionSummary {
  totalEntries: number;
  totalDPOPairs: number;
  totalPatternsResolved: number;
  averageHealth: number;
  healthTrend: number[]; // for sparkline
  latestGrade: string;
  uniquePatternsResolved: string[];
  averageIterationsPerRun: number;
}

// ─── File Path ─────────────────────────────────────────────

function getEvolutionPath(): string {
  return resolve(process.cwd(), ".holomime", "evolution.json");
}

// ─── Load / Save ───────────────────────────────────────────

/**
 * Load evolution history from `.holomime/evolution.json`.
 * Returns null if file doesn't exist or is invalid.
 */
export function loadEvolution(agentName?: string): EvolutionHistory | null {
  const filepath = getEvolutionPath();
  if (!existsSync(filepath)) return null;

  try {
    const raw = readFileSync(filepath, "utf-8");
    return JSON.parse(raw) as EvolutionHistory;
  } catch {
    return null;
  }
}

/**
 * Append an evolution entry and write to disk.
 */
export function appendEvolution(entry: EvolutionEntry, agentName?: string): void {
  const filepath = getEvolutionPath();
  const dir = resolve(process.cwd(), ".holomime");

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let history = loadEvolution(agentName);

  if (!history) {
    history = {
      agent: agentName ?? "Unknown",
      entries: [],
      totalSessions: 0,
      totalDPOPairs: 0,
      firstSession: entry.timestamp,
      lastSession: entry.timestamp,
    };
  }

  history.entries.push(entry);
  history.totalSessions = history.entries.length;
  history.totalDPOPairs = history.entries.reduce((sum, e) => sum + e.dpoPairsExtracted, 0);
  history.lastSession = entry.timestamp;

  writeFileSync(filepath, JSON.stringify(history, null, 2) + "\n");
}

/**
 * Compute summary statistics from evolution history.
 */
export function getEvolutionSummary(history: EvolutionHistory): EvolutionSummary {
  const entries = history.entries;

  if (entries.length === 0) {
    return {
      totalEntries: 0,
      totalDPOPairs: 0,
      totalPatternsResolved: 0,
      averageHealth: 0,
      healthTrend: [],
      latestGrade: "N/A",
      uniquePatternsResolved: [],
      averageIterationsPerRun: 0,
    };
  }

  const allResolved = entries.flatMap(e => e.patternsResolved);
  const uniqueResolved = [...new Set(allResolved)];
  const healthTrend = entries.map(e => e.health);
  const avgHealth = healthTrend.reduce((a, b) => a + b, 0) / healthTrend.length;

  // Group by runs (iteration 1 = start of new run)
  let runCount = 0;
  for (const entry of entries) {
    if (entry.iteration === 1) runCount++;
  }
  if (runCount === 0) runCount = 1;

  return {
    totalEntries: entries.length,
    totalDPOPairs: history.totalDPOPairs,
    totalPatternsResolved: allResolved.length,
    averageHealth: Math.round(avgHealth),
    healthTrend,
    latestGrade: entries[entries.length - 1].grade,
    uniquePatternsResolved: uniqueResolved,
    averageIterationsPerRun: Math.round(entries.length / runCount * 10) / 10,
  };
}
