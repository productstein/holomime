/**
 * Persistent Therapy Memory — therapist remembers previous sessions.
 *
 * Storage: .holomime/memory/{agent-handle}/therapy-memory.json
 * No external dependencies — local JSON files only.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import type { LLMProvider, LLMMessage } from "../llm/provider.js";
import type { SessionTranscript, SessionTurn } from "./session-runner.js";

// ─── Types ─────────────────────────────────────────────────

export interface SessionSummary {
  date: string;
  severity: "routine" | "targeted" | "intervention";
  patternsDiscussed: string[];
  keyInsight: string;
  interventionsUsed: string[];
  tesScore: number | null;
  turnCount: number;
}

export type PatternStatus = "active" | "improving" | "resolved" | "relapsed";

export interface PatternTracker {
  patternId: string;
  firstDetected: string;
  sessionCount: number;
  status: PatternStatus;
  interventionsAttempted: string[];
  lastSeverity: string;
  lastSeen: string;
  /** Confidence score 0-1 — increases with repeated detection, decays when not seen. */
  confidence?: number;
  /** Trend direction based on recent severity changes. */
  trending?: "improving" | "worsening" | "stable";
  /** History of severity scores for trend calculation. */
  severityHistory?: string[];
}

export interface RollingContext {
  recentSummaries: SessionSummary[];
  persistentThemes: string[];
  carryForwardNotes: string;
}

export interface TherapyMemory {
  agentHandle: string;
  agentName: string;
  createdAt: string;
  lastUpdatedAt: string;
  totalSessions: number;
  sessions: SessionSummary[];
  patterns: PatternTracker[];
  rollingContext: RollingContext;
}

// ─── Storage ───────────────────────────────────────────────

function memoryDir(agentHandle: string): string {
  return resolve(process.cwd(), ".holomime", "memory", agentHandle);
}

function memoryPath(agentHandle: string): string {
  return join(memoryDir(agentHandle), "therapy-memory.json");
}

export function loadMemory(agentHandle: string): TherapyMemory | null {
  const path = memoryPath(agentHandle);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as TherapyMemory;
  } catch {
    return null;
  }
}

export function saveMemory(memory: TherapyMemory): string {
  const dir = memoryDir(memory.agentHandle);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const path = memoryPath(memory.agentHandle);
  writeFileSync(path, JSON.stringify(memory, null, 2));
  return path;
}

export function createMemory(agentHandle: string, agentName: string): TherapyMemory {
  return {
    agentHandle,
    agentName,
    createdAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    totalSessions: 0,
    sessions: [],
    patterns: [],
    rollingContext: {
      recentSummaries: [],
      persistentThemes: [],
      carryForwardNotes: "",
    },
  };
}

// ─── Session Recording ─────────────────────────────────────

/**
 * Add a completed session to the agent's therapy memory.
 * Updates pattern trackers, rolling context, and session history.
 */
export async function addSessionToMemory(
  memory: TherapyMemory,
  transcript: SessionTranscript,
  tesScore: number | null,
  provider?: LLMProvider,
): Promise<void> {
  const patternsDiscussed = transcript.preDiagnosis.patterns
    .filter((p) => p.severity !== "info")
    .map((p) => p.id);

  // Build session summary
  let keyInsight: string;
  if (provider) {
    keyInsight = await summarizeSessionForMemory(transcript, provider);
  } else {
    keyInsight = extractKeyInsightRuleBased(transcript);
  }

  const summary: SessionSummary = {
    date: transcript.timestamp,
    severity: transcript.preDiagnosis.severity,
    patternsDiscussed,
    keyInsight,
    interventionsUsed: transcript.recommendations.slice(0, 3),
    tesScore,
    turnCount: transcript.turns.length,
  };

  memory.sessions.push(summary);
  memory.totalSessions++;
  memory.lastUpdatedAt = new Date().toISOString();

  // Update pattern trackers
  for (const pattern of transcript.preDiagnosis.patterns) {
    if (pattern.severity === "info") continue;
    updatePatternTracker(memory, pattern.id, pattern.severity, transcript.recommendations);
  }

  // Update rolling context
  updateRollingContext(memory);
}

function updatePatternTracker(
  memory: TherapyMemory,
  patternId: string,
  severity: string,
  interventions: string[],
): void {
  let tracker = memory.patterns.find((p) => p.patternId === patternId);
  const now = new Date().toISOString();

  if (!tracker) {
    tracker = {
      patternId,
      firstDetected: now,
      sessionCount: 0,
      status: "active",
      interventionsAttempted: [],
      lastSeverity: severity,
      lastSeen: now,
      confidence: 0,
      trending: "stable",
      severityHistory: [],
    };
    memory.patterns.push(tracker);
  }

  tracker.sessionCount++;
  tracker.lastSeverity = severity;
  tracker.lastSeen = now;
  if (!tracker.severityHistory) tracker.severityHistory = [];
  tracker.severityHistory.push(severity);

  // Compute confidence: increases with repeated detection, caps at 1.0
  // Formula: 1 - e^(-sessionCount / 3) — reaches 0.5 at ~2 sessions, 0.95 at ~9
  tracker.confidence = Math.min(1, 1 - Math.exp(-tracker.sessionCount / 3));

  // Compute trending from recent severity history (last 5)
  tracker.trending = computeTrending(tracker.severityHistory.slice(-5));

  // Add new interventions
  for (const intervention of interventions) {
    if (!tracker.interventionsAttempted.includes(intervention)) {
      tracker.interventionsAttempted.push(intervention);
    }
  }

  // Update status based on history
  if (tracker.status === "resolved") {
    tracker.status = "relapsed";
  } else if (tracker.sessionCount > 2 && severity === "info") {
    tracker.status = "resolved";
  } else if (tracker.sessionCount > 1) {
    tracker.status = "improving";
  }
}

/**
 * Compute trend direction from severity history.
 * Maps severity to numeric: info=0, warning=1, concern=2.
 * Compares first half to second half average.
 */
function computeTrending(history: string[]): "improving" | "worsening" | "stable" {
  if (history.length < 2) return "stable";
  const toNum = (s: string) => s === "concern" ? 2 : s === "warning" ? 1 : 0;
  const mid = Math.floor(history.length / 2);
  const firstHalf = history.slice(0, mid);
  const secondHalf = history.slice(mid);
  const avgFirst = firstHalf.reduce((sum, s) => sum + toNum(s), 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((sum, s) => sum + toNum(s), 0) / secondHalf.length;
  const delta = avgSecond - avgFirst;
  if (delta < -0.3) return "improving";
  if (delta > 0.3) return "worsening";
  return "stable";
}

function updateRollingContext(memory: TherapyMemory): void {
  // Keep last 3 session summaries
  memory.rollingContext.recentSummaries = memory.sessions.slice(-3);

  // Extract persistent themes (patterns seen in 2+ sessions)
  const patternCounts = new Map<string, number>();
  for (const session of memory.sessions) {
    for (const pattern of session.patternsDiscussed) {
      patternCounts.set(pattern, (patternCounts.get(pattern) ?? 0) + 1);
    }
  }
  memory.rollingContext.persistentThemes = [...patternCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([id]) => id);

  // Build carry-forward notes from recent insights
  const recentInsights = memory.sessions
    .slice(-3)
    .map((s) => s.keyInsight)
    .filter(Boolean);
  memory.rollingContext.carryForwardNotes = recentInsights.join(" | ");
}

// ─── Summarization ─────────────────────────────────────────

/**
 * LLM-assisted session condensation for memory storage.
 * Falls back to rule-based extraction if LLM fails.
 */
export async function summarizeSessionForMemory(
  transcript: SessionTranscript,
  provider: LLMProvider,
): Promise<string> {
  const relevantTurns = transcript.turns
    .filter((t) => t.phase === "challenge" || t.phase === "skill_building" || t.phase === "integration")
    .slice(-4)
    .map((t) => `${t.speaker}: ${t.content}`)
    .join("\n");

  if (!relevantTurns) return extractKeyInsightRuleBased(transcript);

  try {
    const response = await provider.chat([
      {
        role: "system",
        content: "Summarize this therapy session excerpt in ONE sentence. Focus on the key insight or breakthrough. Be specific and actionable. Max 100 words.",
      },
      { role: "user", content: relevantTurns },
    ] as LLMMessage[]);

    const summary = response.trim();
    return summary.length > 0 && summary.length < 300 ? summary : extractKeyInsightRuleBased(transcript);
  } catch {
    return extractKeyInsightRuleBased(transcript);
  }
}

/**
 * Rule-based fallback for extracting key insight from session.
 */
function extractKeyInsightRuleBased(transcript: SessionTranscript): string {
  // Look for therapist summary in integration phase
  const integrationTurns = transcript.turns.filter(
    (t) => t.speaker === "therapist" && t.phase === "integration",
  );
  if (integrationTurns.length > 0) {
    const summary = integrationTurns[0].content;
    return summary.length > 200 ? summary.slice(0, 197) + "..." : summary;
  }

  // Fall back to first recommendation
  if (transcript.recommendations.length > 0) {
    return `Key recommendation: ${transcript.recommendations[0]}`;
  }

  // Fall back to session focus
  return `Session focused on: ${transcript.preDiagnosis.sessionFocus.join(", ")}`;
}

// ─── Prompt Injection ──────────────────────────────────────

/**
 * Format therapy memory for injection into the therapist system prompt.
 * Kept concise (~500 tokens) to avoid overwhelming the context.
 */
export function getMemoryContext(memory: TherapyMemory): string {
  if (memory.totalSessions === 0) return "";

  const lines: string[] = [
    `## Session History (${memory.totalSessions} previous session${memory.totalSessions > 1 ? "s" : ""})`,
    "",
  ];

  // Active/recurring patterns
  const activePatterns = memory.patterns.filter((p) => p.status !== "resolved");
  if (activePatterns.length > 0) {
    lines.push("### Recurring Patterns");
    for (const p of activePatterns) {
      const conf = p.confidence !== undefined ? ` confidence=${p.confidence.toFixed(2)}` : "";
      const trend = p.trending && p.trending !== "stable" ? ` [${p.trending}]` : "";
      lines.push(`- **${p.patternId}** (${p.status}, seen ${p.sessionCount}x${conf}${trend}, first: ${p.firstDetected.split("T")[0]})`);
      if (p.interventionsAttempted.length > 0) {
        lines.push(`  Previously tried: ${p.interventionsAttempted.slice(-2).join("; ")}`);
      }
    }
    lines.push("");
  }

  // Resolved patterns (brief mention)
  const resolved = memory.patterns.filter((p) => p.status === "resolved");
  if (resolved.length > 0) {
    lines.push(`### Resolved: ${resolved.map((p) => p.patternId).join(", ")}`);
    lines.push("");
  }

  // Recent session context
  const recent = memory.rollingContext.recentSummaries;
  if (recent.length > 0) {
    lines.push("### Recent Sessions");
    for (const s of recent) {
      const date = s.date.split("T")[0];
      const score = s.tesScore !== null ? ` (TES: ${s.tesScore})` : "";
      lines.push(`- ${date}${score}: ${s.keyInsight}`);
    }
    lines.push("");
  }

  // Persistent themes
  if (memory.rollingContext.persistentThemes.length > 0) {
    lines.push(`### Persistent Themes: ${memory.rollingContext.persistentThemes.join(", ")}`);
    lines.push("");
  }

  // Carry-forward
  if (memory.rollingContext.carryForwardNotes) {
    lines.push(`### Carry-Forward Notes`);
    lines.push(memory.rollingContext.carryForwardNotes);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Decay confidence for patterns not seen in the current session.
 * Call after addSessionToMemory with the list of detected pattern IDs.
 */
export function decayUnseenPatterns(memory: TherapyMemory, seenPatternIds: string[]): void {
  const seenSet = new Set(seenPatternIds);
  for (const tracker of memory.patterns) {
    if (!seenSet.has(tracker.patternId) && tracker.status !== "resolved") {
      // Decay by 15% per session where pattern is absent
      tracker.confidence = Math.max(0, (tracker.confidence ?? 0) * 0.85);
      if (tracker.confidence < 0.05) {
        tracker.status = "resolved";
        tracker.confidence = 0;
      }
    }
  }
}

/**
 * Derive the agent handle from a spec for memory lookup.
 */
export function agentHandleFromSpec(spec: any): string {
  const handle = spec.handle ?? spec.name ?? "unknown";
  return handle.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}
