/**
 * Fleet Therapy — Group therapy for multi-agent fleets.
 *
 * Runs parallel therapy sessions across all agents in a fleet,
 * with shared cross-agent pattern analysis and a fleet-wide
 * behavioral health report.
 *
 * This is the core differentiator: no other alignment tool can
 * treat multiple agents simultaneously with awareness of how
 * each agent's behavioral patterns affect the fleet as a whole.
 */

import { resolve, join } from "node:path";
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { loadSpec } from "../core/inheritance.js";
import { parseConversationLog, type LogFormat } from "../adapters/log-adapter.js";
import { runPreSessionDiagnosis, type PreSessionDiagnosis } from "./pre-session.js";
import { runTherapySession, saveTranscript, applyRecommendations, type SessionTranscript, type SessionCallbacks } from "./session-runner.js";
import type { LLMProvider } from "../llm/provider.js";
import type { FleetAgent, FleetConfig } from "./fleet-core.js";
import { loadFleetConfig, discoverAgents } from "./fleet-core.js";
import { agentHandleFromSpec, loadMemory } from "./therapy-memory.js";

// ─── Types ──────────────────────────────────────────────────

export interface FleetTherapyOptions {
  provider: LLMProvider;
  maxTurns?: number;
  concurrency?: number;
  apply?: boolean;
  callbacks?: FleetTherapyCallbacks;
}

export interface FleetTherapyCallbacks {
  onAgentStart?: (agentName: string, index: number, total: number) => void;
  onAgentDiagnosis?: (agentName: string, diagnosis: PreSessionDiagnosis) => void;
  onAgentPhase?: (agentName: string, phaseName: string) => void;
  onAgentTherapist?: (agentName: string, content: string) => void;
  onAgentPatient?: (agentName: string, content: string) => void;
  onAgentComplete?: (agentName: string, result: AgentTherapyResult) => void;
  onAgentError?: (agentName: string, error: string) => void;
  onFleetComplete?: (report: FleetTherapyReport) => void;
}

export interface AgentTherapyResult {
  agent: string;
  specPath: string;
  status: "completed" | "skipped" | "error";
  preDiagnosis?: PreSessionDiagnosis;
  transcript?: SessionTranscript;
  recommendations: string[];
  applied: boolean;
  error?: string;
  duration: number; // ms
}

export interface FleetTherapyReport {
  timestamp: string;
  agentCount: number;
  completedCount: number;
  skippedCount: number;
  errorCount: number;
  totalDuration: number; // ms
  agents: AgentTherapyResult[];
  crossAgentPatterns: string[];
  fleetHealthBefore: number; // 0-100
  fleetHealthAfter: number; // 0-100 (estimated)
}

// ─── Cross-Agent Analysis ──────────────────────────────────

/**
 * Identify behavioral patterns that appear across multiple agents.
 * These are fleet-level concerns — not just individual agent issues.
 */
function analyzeCrossAgentPatterns(results: AgentTherapyResult[]): string[] {
  const patternCounts = new Map<string, number>();
  const patterns: string[] = [];

  for (const result of results) {
    if (!result.preDiagnosis) continue;

    // Count pattern categories across agents
    const diag = result.preDiagnosis;
    if (diag.severity === "intervention") {
      patternCounts.set("critical-drift", (patternCounts.get("critical-drift") ?? 0) + 1);
    }
    for (const focus of diag.sessionFocus) {
      patternCounts.set(focus, (patternCounts.get(focus) ?? 0) + 1);
    }
  }

  // Patterns appearing in 2+ agents are fleet-level concerns
  for (const [pattern, count] of patternCounts) {
    if (count >= 2) {
      patterns.push(`${pattern} (${count}/${results.length} agents)`);
    }
  }

  if (patterns.length === 0 && results.length > 0) {
    patterns.push("No shared behavioral patterns detected across fleet");
  }

  return patterns;
}

/**
 * Compute fleet health score from individual agent diagnoses.
 */
function computeFleetHealth(results: AgentTherapyResult[]): number {
  const completed = results.filter((r) => r.status === "completed" && r.preDiagnosis);
  if (completed.length === 0) return 0;

  // Map severity to health score
  const severityScore = (severity: string): number => {
    switch (severity) {
      case "routine": return 90;
      case "targeted": return 60;
      case "intervention": return 30;
      default: return 50;
    }
  };

  const total = completed.reduce((sum, r) => sum + severityScore(r.preDiagnosis!.severity), 0);
  return Math.round(total / completed.length);
}

// ─── Fleet Therapy Runner ──────────────────────────────────

/**
 * Run therapy sessions across all agents in a fleet.
 * Agents are processed with configurable concurrency.
 */
export async function runFleetTherapy(
  config: FleetConfig,
  options: FleetTherapyOptions,
): Promise<FleetTherapyReport> {
  const startTime = Date.now();
  const maxTurns = options.maxTurns ?? 24;
  const concurrency = options.concurrency ?? 3;
  const cb = options.callbacks;

  const results: AgentTherapyResult[] = [];

  // Process agents with concurrency limit
  const queue = [...config.agents];
  let completed = 0;

  async function processAgent(agent: FleetAgent): Promise<AgentTherapyResult> {
    const agentStart = Date.now();
    const index = config.agents.indexOf(agent);
    cb?.onAgentStart?.(agent.name, index, config.agents.length);

    try {
      // Load personality spec
      const spec = loadSpec(agent.specPath);

      // Find most recent log file
      const logDir = agent.logDir;
      let messages: any[] = [];

      if (existsSync(logDir)) {
        const logFiles = readdirSync(logDir)
          .filter((f) => f.endsWith(".json") || f.endsWith(".jsonl"))
          .sort()
          .reverse();

        if (logFiles.length > 0) {
          try {
            const raw = JSON.parse(readFileSync(join(logDir, logFiles[0]), "utf-8"));
            const conversations = parseConversationLog(raw, "auto" as LogFormat);
            messages = conversations.flatMap((c) => c.messages);
          } catch {
            // Can't parse log — proceed without pre-diagnosis
          }
        }
      }

      // Pre-session diagnosis
      let diagnosis: PreSessionDiagnosis;
      if (messages.length > 0) {
        diagnosis = await runPreSessionDiagnosis(messages, spec);
      } else {
        // No logs — create a baseline diagnosis
        diagnosis = {
          severity: "routine" as const,
          sessionFocus: ["baseline behavioral assessment"],
          emotionalThemes: [],
          openingAngle: "General check-in on behavioral health",
          patterns: [],
        };
      }

      cb?.onAgentDiagnosis?.(agent.name, diagnosis);

      // Load therapy memory for continuity
      const handle = agentHandleFromSpec(spec);
      let memory;
      try {
        const loaded = loadMemory(handle);
        memory = loaded ?? undefined;
      } catch {
        // No prior memory — first session
      }

      // Session callbacks wired to fleet callbacks
      const sessionCallbacks: SessionCallbacks = {
        onPhaseTransition: (name) => cb?.onAgentPhase?.(agent.name, name),
        onTherapistMessage: (content) => cb?.onAgentTherapist?.(agent.name, content),
        onPatientMessage: (_, content) => cb?.onAgentPatient?.(agent.name, content),
      };

      // Run therapy session
      const transcript = await runTherapySession(
        spec,
        diagnosis,
        options.provider,
        maxTurns,
        {
          callbacks: sessionCallbacks,
          memory,
          silent: true,
          persistState: true,
        },
      );

      // Save transcript
      saveTranscript(transcript, agent.specPath);

      // Optionally apply recommendations
      let applied = false;
      if (options.apply && transcript.recommendations.length > 0) {
        try {
          await applyRecommendations(spec, diagnosis, transcript, options.provider);
          applied = true;
        } catch {
          // Failed to apply — non-fatal
        }
      }

      const result: AgentTherapyResult = {
        agent: agent.name,
        specPath: agent.specPath,
        status: "completed",
        preDiagnosis: diagnosis,
        transcript,
        recommendations: transcript.recommendations,
        applied,
        duration: Date.now() - agentStart,
      };

      cb?.onAgentComplete?.(agent.name, result);
      return result;

    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const result: AgentTherapyResult = {
        agent: agent.name,
        specPath: agent.specPath,
        status: "error",
        recommendations: [],
        applied: false,
        error,
        duration: Date.now() - agentStart,
      };

      cb?.onAgentError?.(agent.name, error);
      return result;
    }
  }

  // Process with concurrency limit
  async function processQueue(): Promise<void> {
    const active: Promise<void>[] = [];

    for (const agent of queue) {
      const p = processAgent(agent).then((result) => {
        results.push(result);
        completed++;
      });

      active.push(p);

      if (active.length >= concurrency) {
        await Promise.race(active);
        // Remove settled promises
        const settled = active.filter((p) => {
          let done = false;
          p.then(() => { done = true; }, () => { done = true; });
          return done;
        });
        for (const s of settled) {
          active.splice(active.indexOf(s), 1);
        }
      }
    }

    await Promise.all(active);
  }

  await processQueue();

  // Cross-agent analysis
  const crossAgentPatterns = analyzeCrossAgentPatterns(results);
  const fleetHealthBefore = computeFleetHealth(results);

  // Estimate post-therapy health (conservative +10-20% improvement)
  const completedResults = results.filter((r) => r.status === "completed");
  const avgRecommendations = completedResults.length > 0
    ? completedResults.reduce((sum, r) => sum + r.recommendations.length, 0) / completedResults.length
    : 0;
  const estimatedImprovement = Math.min(20, avgRecommendations * 3);
  const fleetHealthAfter = Math.min(100, fleetHealthBefore + estimatedImprovement);

  const report: FleetTherapyReport = {
    timestamp: new Date().toISOString(),
    agentCount: config.agents.length,
    completedCount: results.filter((r) => r.status === "completed").length,
    skippedCount: results.filter((r) => r.status === "skipped").length,
    errorCount: results.filter((r) => r.status === "error").length,
    totalDuration: Date.now() - startTime,
    agents: results,
    crossAgentPatterns,
    fleetHealthBefore,
    fleetHealthAfter: Math.round(fleetHealthAfter),
  };

  // Save fleet therapy report
  const reportDir = resolve(process.cwd(), ".holomime");
  if (!existsSync(reportDir)) {
    mkdirSync(reportDir, { recursive: true });
  }
  writeFileSync(
    join(reportDir, "fleet-therapy-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );

  cb?.onFleetComplete?.(report);
  return report;
}
