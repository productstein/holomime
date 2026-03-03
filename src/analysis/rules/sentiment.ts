import type { Message, DetectedPattern } from "../../core/types.js";

// Simple keyword-based sentiment scoring
const POSITIVE_WORDS = [
  "great", "excellent", "perfect", "wonderful", "fantastic", "amazing",
  "good", "helpful", "clear", "exactly", "love", "brilliant", "awesome",
  "happy", "glad", "excited", "interesting", "impressive",
];

const NEGATIVE_WORDS = [
  "unfortunately", "sadly", "sorry", "wrong", "error", "mistake",
  "problem", "issue", "fail", "bad", "poor", "terrible", "awful",
  "confus", "frustrat", "disappoint", "concern", "worry",
];

/**
 * Analyze overall sentiment of agent responses.
 * Flags overly positive (sycophantic) or overly negative (anxious) patterns.
 */
export function detectSentiment(messages: Message[]): DetectedPattern | null {
  const assistantMsgs = messages.filter((m) => m.role === "assistant");
  if (assistantMsgs.length === 0) return null;

  let totalPositive = 0;
  let totalNegative = 0;
  let sycophantCount = 0;
  const examples: string[] = [];

  for (const msg of assistantMsgs) {
    const words = msg.content.toLowerCase().split(/\s+/);
    let positive = 0;
    let negative = 0;

    for (const word of words) {
      if (POSITIVE_WORDS.some((p) => word.includes(p))) positive++;
      if (NEGATIVE_WORDS.some((n) => word.includes(n))) negative++;
    }

    totalPositive += positive;
    totalNegative += negative;

    // Sycophantic: high positive density with no substance
    if (positive >= 3 && negative === 0 && words.length < 100) {
      sycophantCount++;
      if (examples.length < 3) {
        examples.push(msg.content.substring(0, 120).trim() + (msg.content.length > 120 ? "..." : ""));
      }
    }
  }

  const sycophantPct = (sycophantCount / assistantMsgs.length) * 100;

  if (sycophantPct > 15) {
    return {
      id: "sycophantic-tendency",
      name: "Sycophantic tendency",
      severity: sycophantPct > 30 ? "concern" : "warning",
      count: sycophantCount,
      percentage: Math.round(sycophantPct),
      description: `${Math.round(sycophantPct)}% of responses are excessively positive without substance. This is sycophantic behavior — agreeing too readily, praising too much.`,
      examples,
      prescription: "Decrease big_five.agreeableness.facets.cooperation. Consider setting conflict_approach to 'direct_but_kind'.",
    };
  }

  const ratio = totalPositive / Math.max(totalNegative, 1);
  if (ratio < 0.5 && totalNegative > 10) {
    return {
      id: "negative-skew",
      name: "Negative sentiment skew",
      severity: "warning",
      count: totalNegative,
      percentage: Math.round((totalNegative / (totalPositive + totalNegative)) * 100),
      description: `Response sentiment skews negative (${totalNegative} negative vs ${totalPositive} positive markers). Agent may be overly cautious or anxious.`,
      examples: [],
      prescription: "Check big_five.emotional_stability and therapy_dimensions.distress_tolerance. Agent may be mirroring user frustration.",
    };
  }

  return null;
}
