import type { Message, DetectedPattern } from "../../core/types.js";

const HEDGE_WORDS = [
  "maybe", "perhaps", "possibly", "might", "could be",
  "i think", "i believe", "i suppose", "i guess",
  "sort of", "kind of", "somewhat", "arguably",
  "it seems", "it appears", "it looks like",
  "not sure", "uncertain", "hard to say",
  "in my opinion", "from my perspective",
];

/**
 * Detect hedge stacking — excessive use of hedging language.
 * Some hedging is healthy (shows appropriate uncertainty).
 * Stacking 3+ hedges in a single response suggests poor confidence.
 */
export function detectHedging(messages: Message[]): DetectedPattern | null {
  const assistantMsgs = messages.filter((m) => m.role === "assistant");
  if (assistantMsgs.length === 0) return null;

  let heavyHedgeCount = 0;
  const examples: string[] = [];

  for (const msg of assistantMsgs) {
    const content = msg.content.toLowerCase();
    let hedgeCount = 0;

    for (const hedge of HEDGE_WORDS) {
      const regex = new RegExp(`\\b${hedge}\\b`, "gi");
      const matches = content.match(regex);
      if (matches) hedgeCount += matches.length;
    }

    if (hedgeCount >= 3) {
      heavyHedgeCount++;
      if (examples.length < 3) {
        examples.push(msg.content.substring(0, 120).trim() + (msg.content.length > 120 ? "..." : ""));
      }
    }
  }

  const percentage = (heavyHedgeCount / assistantMsgs.length) * 100;

  if (percentage <= 10) {
    return null; // healthy
  }

  return {
    id: "hedge-stacking",
    name: "Hedge stacking",
    severity: percentage > 25 ? "concern" : "warning",
    count: heavyHedgeCount,
    percentage: Math.round(percentage),
    description: `Uses 3+ hedging words in ${Math.round(percentage)}% of responses. This suggests poor uncertainty handling — hedging instead of being transparent about what it doesn't know.`,
    examples,
    prescription: "Add to growth.patterns_to_watch: 'excessive hedging'. Consider increasing big_five.extraversion.facets.assertiveness.",
  };
}
