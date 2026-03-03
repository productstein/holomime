/**
 * Treatment Plan — multi-session therapy tracking with goals,
 * progression, and outcome measurement.
 *
 * Real therapy isn't one session. It's a course of treatment.
 * This module creates treatment plans that track:
 * - Treatment goals (derived from diagnosis)
 * - Session-by-session progress
 * - Pattern resolution over time
 * - Behavioral drift detection
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { PreSessionDiagnosis } from "./pre-session.js";
import type { SessionTranscript } from "./session-runner.js";

// ─── Types ─────────────────────────────────────────────────

export interface TreatmentGoal {
  id: string;
  pattern: string;
  description: string;
  targetMetric: string;
  baseline: number;
  target: number;
  current: number;
  status: "active" | "improving" | "resolved" | "regressed";
  firstDetected: string;
  lastAssessed: string;
}

export interface SessionOutcome {
  sessionDate: string;
  sessionPath: string;
  phase_completion: number; // 0-7 phases completed
  recommendations_count: number;
  supervisor_interventions: number;
  goals_addressed: string[];
  severity_before: string;
  notes: string;
}

export interface TreatmentPlan {
  agent: string;
  created: string;
  updated: string;
  status: "active" | "complete" | "paused";
  goals: TreatmentGoal[];
  sessions: SessionOutcome[];
  totalSessions: number;
  recommendedSessions: number;
  nextSessionFocus: string[];
}

// ─── Plan Management ───────────────────────────────────────

const PLAN_DIR = ".holomime";
const PLAN_FILE = "treatment-plan.json";

function getPlanPath(): string {
  return resolve(process.cwd(), PLAN_DIR, PLAN_FILE);
}

/**
 * Create a new treatment plan from an initial diagnosis.
 */
export function createTreatmentPlan(
  agentName: string,
  diagnosis: PreSessionDiagnosis,
): TreatmentPlan {
  const goals: TreatmentGoal[] = [];

  for (const pattern of diagnosis.patterns) {
    if (pattern.severity === "info") continue;

    goals.push({
      id: pattern.id,
      pattern: pattern.name,
      description: pattern.description,
      targetMetric: `${pattern.id}_rate`,
      baseline: pattern.percentage ?? 50,
      target: getTargetForPattern(pattern.id),
      current: pattern.percentage ?? 50,
      status: "active",
      firstDetected: new Date().toISOString().split("T")[0],
      lastAssessed: new Date().toISOString().split("T")[0],
    });
  }

  const plan: TreatmentPlan = {
    agent: agentName,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    status: "active",
    goals,
    sessions: [],
    totalSessions: 0,
    recommendedSessions: calculateRecommendedSessions(diagnosis),
    nextSessionFocus: diagnosis.sessionFocus.slice(0, 3),
  };

  return plan;
}

/**
 * Load existing treatment plan or return null.
 */
export function loadTreatmentPlan(): TreatmentPlan | null {
  const path = getPlanPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Save treatment plan to disk.
 */
export function saveTreatmentPlan(plan: TreatmentPlan): string {
  const dir = resolve(process.cwd(), PLAN_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = getPlanPath();
  writeFileSync(path, JSON.stringify(plan, null, 2) + "\n");
  return path;
}

/**
 * Record a completed session outcome into the treatment plan.
 */
export function recordSessionOutcome(
  plan: TreatmentPlan,
  transcript: SessionTranscript,
  transcriptPath: string,
  diagnosis: PreSessionDiagnosis,
): TreatmentPlan {
  const phasesCompleted = new Set(transcript.turns.map(t => t.phase)).size;
  const goalsAddressed = plan.goals
    .filter(g => diagnosis.patterns.some(p => p.id === g.id))
    .map(g => g.id);

  const outcome: SessionOutcome = {
    sessionDate: transcript.timestamp.split("T")[0],
    sessionPath: transcriptPath,
    phase_completion: phasesCompleted,
    recommendations_count: transcript.recommendations.length,
    supervisor_interventions: transcript.supervisorInterventions ?? 0,
    goals_addressed: goalsAddressed,
    severity_before: diagnosis.severity,
    notes: generateSessionNotes(transcript, diagnosis),
  };

  plan.sessions.push(outcome);
  plan.totalSessions++;
  plan.updated = new Date().toISOString();

  // Update goal statuses based on session progression
  updateGoalStatuses(plan, diagnosis);

  // Recalculate next session focus
  plan.nextSessionFocus = calculateNextFocus(plan);

  // Check if treatment is complete
  if (plan.goals.every(g => g.status === "resolved")) {
    plan.status = "complete";
  }

  return plan;
}

/**
 * Generate a treatment progress report.
 */
export function generateProgressReport(plan: TreatmentPlan): TreatmentProgressReport {
  const activeGoals = plan.goals.filter(g => g.status === "active");
  const improvingGoals = plan.goals.filter(g => g.status === "improving");
  const resolvedGoals = plan.goals.filter(g => g.status === "resolved");
  const regressedGoals = plan.goals.filter(g => g.status === "regressed");

  const sessionsRemaining = Math.max(0, plan.recommendedSessions - plan.totalSessions);
  const completionRate = plan.goals.length > 0
    ? resolvedGoals.length / plan.goals.length
    : 1;

  return {
    agent: plan.agent,
    status: plan.status,
    totalGoals: plan.goals.length,
    activeGoals: activeGoals.length,
    improvingGoals: improvingGoals.length,
    resolvedGoals: resolvedGoals.length,
    regressedGoals: regressedGoals.length,
    sessionsCompleted: plan.totalSessions,
    sessionsRemaining,
    completionRate,
    nextFocus: plan.nextSessionFocus,
    goals: plan.goals.map(g => ({
      pattern: g.pattern,
      status: g.status,
      baseline: g.baseline,
      current: g.current,
      target: g.target,
      delta: g.baseline - g.current,
    })),
  };
}

export interface TreatmentProgressReport {
  agent: string;
  status: string;
  totalGoals: number;
  activeGoals: number;
  improvingGoals: number;
  resolvedGoals: number;
  regressedGoals: number;
  sessionsCompleted: number;
  sessionsRemaining: number;
  completionRate: number;
  nextFocus: string[];
  goals: {
    pattern: string;
    status: string;
    baseline: number;
    current: number;
    target: number;
    delta: number;
  }[];
}

// ─── Helpers ───────────────────────────────────────────────

function getTargetForPattern(patternId: string): number {
  // Target rates for each pattern (percentage that's considered "healthy")
  const targets: Record<string, number> = {
    "over-apologizing": 10,   // <10% apology rate is healthy
    "hedge-stacking": 15,     // Some hedging is fine, excessive is not
    "sycophantic-tendency": 20, // Some positivity is fine
    "error-spiral": 5,         // Very few error spirals
    "boundary-violation": 5,   // Almost no boundary violations
    "register-inconsistency": 10,
    "negative-skew": 20,
  };
  return targets[patternId] ?? 15;
}

function calculateRecommendedSessions(diagnosis: PreSessionDiagnosis): number {
  const concerns = diagnosis.patterns.filter(p => p.severity === "concern").length;
  const warnings = diagnosis.patterns.filter(p => p.severity === "warning").length;

  if (diagnosis.severity === "intervention") return 8;
  if (diagnosis.severity === "targeted") return 5;
  return 3 + concerns + Math.ceil(warnings / 2);
}

function updateGoalStatuses(plan: TreatmentPlan, diagnosis: PreSessionDiagnosis): void {
  for (const goal of plan.goals) {
    const currentPattern = diagnosis.patterns.find(p => p.id === goal.id);
    const previousRate = goal.current;

    if (!currentPattern) {
      // Pattern no longer detected — likely resolved
      goal.current = 0;
      goal.status = "resolved";
    } else {
      goal.current = currentPattern.percentage ?? goal.current;

      if (goal.current <= goal.target) {
        goal.status = "resolved";
      } else if (goal.current < previousRate) {
        goal.status = "improving";
      } else if (goal.current > previousRate + 5) {
        goal.status = "regressed";
      }
    }

    goal.lastAssessed = new Date().toISOString().split("T")[0];
  }
}

function calculateNextFocus(plan: TreatmentPlan): string[] {
  // Prioritize: regressed > active > improving
  const priority = plan.goals
    .filter(g => g.status !== "resolved")
    .sort((a, b) => {
      const order: Record<string, number> = { regressed: 0, active: 1, improving: 2 };
      return (order[a.status] ?? 3) - (order[b.status] ?? 3);
    });

  return priority.slice(0, 3).map(g => g.pattern);
}

function generateSessionNotes(transcript: SessionTranscript, diagnosis: PreSessionDiagnosis): string {
  const parts: string[] = [];

  if (transcript.recommendations.length > 0) {
    parts.push(`${transcript.recommendations.length} recommendations generated`);
  }

  const phases = new Set(transcript.turns.map(t => t.phase));
  parts.push(`Phases covered: ${phases.size}/7`);

  if (transcript.supervisorInterventions > 0) {
    parts.push(`${transcript.supervisorInterventions} supervisor interventions`);
  }

  return parts.join(". ");
}
