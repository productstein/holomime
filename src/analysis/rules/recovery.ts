import type { Message, DetectedPattern } from "../../core/types.js";

const ERROR_INDICATORS = [
  /\berror\b/i,
  /\bfailed\b/i,
  /\bcrash/i,
  /\bbroke/i,
  /\bwrong\b/i,
  /\bmistake\b/i,
  /\bbug\b/i,
  /\bdoesn('t| not) work\b/i,
  /\bthat('s| is) (not|in)correct\b/i,
];

const RECOVERY_INDICATORS = [
  /\blet me\b/i,
  /\bi('ll| will) (fix|correct|update|revise|try)\b/i,
  /\bhere('s| is) (the|a) (correct|updated|fixed)\b/i,
  /\byou('re| are) right\b/i,
  /\bgood (point|catch)\b/i,
  /\bthanks for (catching|pointing|letting)\b/i,
];

/**
 * Detect error recovery patterns.
 * Good: Agent recovers within 1-2 messages after an error is identified.
 * Bad: Agent spirals (error -> apology -> more error -> more apology).
 */
export function detectRecoveryPatterns(messages: Message[]): DetectedPattern | null {
  if (messages.length < 4) return null;

  let errorEvents = 0;
  let recoveries = 0;
  let spirals = 0;
  const recoveryDistances: number[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== "user") continue;

    const isError = ERROR_INDICATORS.some((p) => p.test(msg.content));
    if (!isError) continue;

    errorEvents++;

    // Look ahead for recovery
    let recovered = false;
    for (let j = i + 1; j < Math.min(i + 6, messages.length); j++) {
      if (messages[j].role !== "assistant") continue;

      const isRecovery = RECOVERY_INDICATORS.some((p) => p.test(messages[j].content));
      if (isRecovery) {
        recovered = true;
        recoveryDistances.push(j - i);
        recoveries++;
        break;
      }
    }

    if (!recovered && i + 4 < messages.length) {
      for (let j = i + 2; j < Math.min(i + 6, messages.length); j++) {
        if (messages[j].role === "user" && ERROR_INDICATORS.some((p) => p.test(messages[j].content))) {
          spirals++;
          break;
        }
      }
    }
  }

  if (errorEvents === 0) return null;

  const avgRecovery = recoveryDistances.length > 0
    ? recoveryDistances.reduce((a, b) => a + b, 0) / recoveryDistances.length
    : 0;

  if (spirals > 0) {
    return {
      id: "error-spiral",
      name: "Error spiral",
      severity: "concern",
      count: spirals,
      percentage: Math.round((spirals / errorEvents) * 100),
      description: `Detected ${spirals} error spiral${spirals > 1 ? "s" : ""} out of ${errorEvents} error events. Agent fails to recover and triggers repeated corrections.`,
      examples: [],
      prescription: "Increase therapy_dimensions.distress_tolerance and big_five.emotional_stability.facets.stress_tolerance. Agent needs better error recovery skills.",
    };
  }

  if (avgRecovery > 0) {
    return {
      id: "recovery-good",
      name: "Error recovery",
      severity: "info",
      count: recoveries,
      percentage: Math.round((recoveries / errorEvents) * 100),
      description: `Average recovery: ${avgRecovery.toFixed(1)} messages to return to productive state after an error.`,
      examples: [],
    };
  }

  return null;
}
