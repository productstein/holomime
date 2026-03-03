import type { Message, DetectedPattern } from "../../core/types.js";

const APOLOGY_PATTERNS = [
  /\bi('m| am) sorry\b/i,
  /\bmy apolog(y|ies)\b/i,
  /\bi apologize\b/i,
  /\bsorry about\b/i,
  /\bsorry for\b/i,
  /\bforgive me\b/i,
  /\bpardon me\b/i,
];

/**
 * Detect over-apologizing patterns.
 * Healthy range: 5-15% of responses contain apologies.
 * Above 20% suggests low confidence or anxious attachment.
 */
export function detectApologies(messages: Message[]): DetectedPattern | null {
  const assistantMsgs = messages.filter((m) => m.role === "assistant");
  if (assistantMsgs.length === 0) return null;

  let apologyCount = 0;
  const examples: string[] = [];

  for (const msg of assistantMsgs) {
    const hasApology = APOLOGY_PATTERNS.some((p) => p.test(msg.content));
    if (hasApology) {
      apologyCount++;
      if (examples.length < 3) {
        const match = msg.content.substring(0, 120).trim();
        examples.push(match + (msg.content.length > 120 ? "..." : ""));
      }
    }
  }

  const percentage = (apologyCount / assistantMsgs.length) * 100;

  if (percentage <= 15) {
    return {
      id: "apology-healthy",
      name: "Apology frequency",
      severity: "info",
      count: apologyCount,
      percentage: Math.round(percentage),
      description: `Apologizes in ${Math.round(percentage)}% of responses (healthy range: 5-15%)`,
      examples: [],
    };
  }

  return {
    id: "over-apologizing",
    name: "Over-apologizing",
    severity: percentage > 30 ? "concern" : "warning",
    count: apologyCount,
    percentage: Math.round(percentage),
    description: `Apologizes in ${Math.round(percentage)}% of responses. Healthy range is 5-15%. This suggests low confidence or anxious attachment.`,
    examples,
    prescription: "Set communication.uncertainty_handling to 'confident_transparency' — state uncertainty without apologizing for it.",
  };
}
