/**
 * Behavioral Data Collection — append-only JSONL corpus.
 *
 * Every diagnosis, session, evolution, and network therapy event
 * gets recorded for future behavioral foundation model training.
 * Storage: .holomime/behavioral-corpus.jsonl
 */

import { appendFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";

// ─── Types ──────────────────────────────────────────────────

export type BehavioralEventType =
  | "diagnosis"
  | "session"
  | "evolution"
  | "network_therapy"
  | "dpo_pair"
  | "drift_alert";

export interface BehavioralEvent {
  event_type: BehavioralEventType;
  agent: string;
  timestamp: string;
  data: Record<string, unknown>;
  spec_hash: string;
}

export interface CorpusStats {
  total: number;
  byType: Record<string, number>;
  byAgent: Record<string, number>;
  timeRange: { earliest: string; latest: string } | null;
}

// ─── Paths ──────────────────────────────────────────────────

const HOLOMIME_DIR = ".holomime";
const CORPUS_FILENAME = "behavioral-corpus.jsonl";

function getCorpusPath(basePath?: string): string {
  const dir = basePath ?? join(process.cwd(), HOLOMIME_DIR);
  return join(dir, CORPUS_FILENAME);
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ─── Spec Hashing ───────────────────────────────────────────

/**
 * Compute a SHA-256 hash of a personality spec for corpus tagging.
 */
export function hashSpec(spec: unknown): string {
  const json = JSON.stringify(spec, Object.keys(spec as any).sort());
  return createHash("sha256").update(json).digest("hex").slice(0, 16);
}

// ─── Emit ───────────────────────────────────────────────────

/**
 * Append a behavioral event to the corpus JSONL file.
 */
export function emitBehavioralEvent(
  event: Omit<BehavioralEvent, "timestamp">,
  corpusDir?: string,
): void {
  const fullEvent: BehavioralEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  const corpusPath = corpusDir
    ? join(corpusDir, CORPUS_FILENAME)
    : getCorpusPath();
  ensureDir(corpusPath);
  appendFileSync(corpusPath, JSON.stringify(fullEvent) + "\n", "utf-8");
}

// ─── Load ───────────────────────────────────────────────────

/**
 * Load the full behavioral corpus from a JSONL file.
 * Returns an empty array if the file doesn't exist.
 */
export function loadCorpus(corpusPath?: string): BehavioralEvent[] {
  const path = corpusPath ?? getCorpusPath();
  if (!existsSync(path)) return [];

  const lines = readFileSync(path, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  const events: BehavioralEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as BehavioralEvent);
    } catch {
      // Skip malformed lines
    }
  }

  return events;
}

// ─── Stats ──────────────────────────────────────────────────

/**
 * Compute summary statistics over a corpus of behavioral events.
 */
export function corpusStats(events: BehavioralEvent[]): CorpusStats {
  const byType: Record<string, number> = {};
  const byAgent: Record<string, number> = {};
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const event of events) {
    byType[event.event_type] = (byType[event.event_type] ?? 0) + 1;
    byAgent[event.agent] = (byAgent[event.agent] ?? 0) + 1;

    if (!earliest || event.timestamp < earliest) earliest = event.timestamp;
    if (!latest || event.timestamp > latest) latest = event.timestamp;
  }

  return {
    total: events.length,
    byType,
    byAgent,
    timeRange: earliest && latest ? { earliest, latest } : null,
  };
}

// ─── Query ──────────────────────────────────────────────────

export interface CorpusFilter {
  agent?: string;
  eventType?: BehavioralEventType;
  since?: string;
  until?: string;
  limit?: number;
}

/**
 * Query the behavioral corpus with filters.
 * Returns matching events, most recent first.
 */
export function queryCorpus(
  filters?: CorpusFilter,
  corpusPath?: string,
): BehavioralEvent[] {
  let events = loadCorpus(corpusPath);

  if (filters?.agent) {
    events = events.filter((e) => e.agent === filters.agent);
  }
  if (filters?.eventType) {
    events = events.filter((e) => e.event_type === filters.eventType);
  }
  if (filters?.since) {
    events = events.filter((e) => e.timestamp >= filters.since!);
  }
  if (filters?.until) {
    events = events.filter((e) => e.timestamp <= filters.until!);
  }

  // Most recent first
  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  if (filters?.limit) {
    events = events.slice(0, filters.limit);
  }

  return events;
}

// ─── Data Flywheel (Anonymized Pattern Sharing) ──────────

export interface AnonymizedPatternReport {
  /** Pattern IDs detected (e.g., "over-apologizing", "hedge-stacking"). */
  patterns: string[];
  /** Severity per pattern. */
  severities: Record<string, string>;
  /** Number of messages analyzed (no content). */
  messageCount: number;
  /** Spec hash (anonymized — no actual spec content). */
  specHash: string;
  /** Holomime version. */
  version: string;
  /** Timestamp. */
  timestamp: string;
}

/**
 * Share anonymized behavioral patterns with the holomime.dev aggregate dataset.
 * Only shares pattern types + severity + context size — NO conversation content.
 *
 * This powers the data flywheel: more users → better pattern detection → more users.
 * Opt-in only — call `holomime telemetry --share-patterns` to enable.
 */
export async function shareAnonymizedPatterns(
  report: AnonymizedPatternReport,
  apiKey?: string,
  apiUrl = "https://holomime.dev",
): Promise<{ success: boolean; error?: string }> {
  const key = apiKey ?? process.env.HOLOMIME_API_KEY;
  if (!key) {
    return { success: false, error: "No API key" };
  }

  try {
    const response = await fetch(`${apiUrl}/api/v1/patterns/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify(report),
    });

    if (!response.ok) {
      return { success: false, error: `API error ${response.status}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Build an anonymized pattern report from a diagnosis result.
 * Strips all conversation content — only pattern metadata is shared.
 */
export function buildAnonymizedReport(
  patternIds: string[],
  severities: Record<string, string>,
  messageCount: number,
  specHash: string,
): AnonymizedPatternReport {
  return {
    patterns: patternIds,
    severities,
    messageCount,
    specHash,
    version: "1.5.1",
    timestamp: new Date().toISOString(),
  };
}
