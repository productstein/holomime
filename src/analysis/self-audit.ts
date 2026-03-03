/**
 * Self-Audit — mid-conversation behavioral self-check for AI agents.
 *
 * Agents call this during live conversations to detect if they're falling
 * into problematic patterns. Returns flags with actionable suggestions.
 * No LLM required — pure rule-based analysis via the 7 detectors.
 */

import type { Message, DetectedPattern } from "../core/types.js";
import { detectApologies } from "./rules/apology-detector.js";
import { detectHedging } from "./rules/hedge-detector.js";
import { detectSentiment } from "./rules/sentiment.js";
import { detectVerbosity } from "./rules/verbosity.js";
import { detectBoundaryIssues } from "./rules/boundary.js";
import { detectRecoveryPatterns } from "./rules/recovery.js";
import { detectFormalityIssues } from "./rules/formality.js";

// ─── Types ─────────────────────────────────────────────────

export interface SelfAuditFlag {
  pattern: string;
  severity: string;
  suggestion: string;
}

export interface SelfAuditResult {
  healthy: boolean;
  flags: SelfAuditFlag[];
  overallHealth: number;
  recommendation: "continue" | "adjust" | "pause_and_reflect";
}

// ─── Suggestion Map ────────────────────────────────────────

const PATTERN_SUGGESTIONS: Record<string, string> = {
  "over-apologizing": "Drop the apology — state corrections or clarifications directly without prefacing with 'sorry'.",
  "hedge-stacking": "Pick a position and state it clearly. Use one qualifier at most, not three.",
  "sycophantic-tendency": "The user may be wrong. Disagree respectfully where the evidence supports it.",
  "negative-skew": "Balance critique with constructive alternatives. Offer what to do, not just what's wrong.",
  "error-spiral": "Acknowledge the error once, then move directly to the solution. Don't re-apologize.",
  "boundary-violation": "This request may be outside your role. Decline politely and redirect to appropriate resources.",
  "register-inconsistency": "Your tone is shifting between formal and casual. Pick one register and maintain it.",
  "over-verbose": "Your responses are running long. Aim for half the length — lead with the answer.",
};

// ─── Core Function ─────────────────────────────────────────

/**
 * Run a self-audit on the current conversation.
 * Returns health score, flags, and a recommendation for how to proceed.
 */
export function runSelfAudit(
  messages: Message[],
  personality?: any,
): SelfAuditResult {
  const detectors = [
    detectApologies,
    detectHedging,
    detectSentiment,
    detectVerbosity,
    detectBoundaryIssues,
    detectRecoveryPatterns,
    detectFormalityIssues,
  ];

  const allPatterns: DetectedPattern[] = [];
  for (const detector of detectors) {
    const result = detector(messages);
    if (result) allPatterns.push(result);
  }

  // Filter to actionable patterns only (warning or concern)
  const actionable = allPatterns.filter(
    (p) => p.severity === "warning" || p.severity === "concern",
  );

  const flags: SelfAuditFlag[] = actionable.map((p) => ({
    pattern: p.name,
    severity: p.severity,
    suggestion: PATTERN_SUGGESTIONS[p.id] ?? `Address the "${p.name}" pattern in your next response.`,
  }));

  // Health score: start at 100, deduct per pattern
  const concerns = actionable.filter((p) => p.severity === "concern").length;
  const warnings = actionable.filter((p) => p.severity === "warning").length;
  const health = Math.max(0, 100 - concerns * 25 - warnings * 10);

  // Recommendation
  let recommendation: SelfAuditResult["recommendation"];
  if (concerns >= 2) {
    recommendation = "pause_and_reflect";
  } else if (concerns >= 1 || warnings >= 2) {
    recommendation = "adjust";
  } else {
    recommendation = "continue";
  }

  return {
    healthy: flags.length === 0,
    flags,
    overallHealth: health,
    recommendation,
  };
}
