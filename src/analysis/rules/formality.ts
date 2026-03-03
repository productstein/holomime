import type { Message, DetectedPattern } from "../../core/types.js";

const INFORMAL_MARKERS = [
  /\b(gonna|wanna|gotta|kinda|sorta)\b/i,
  /\b(lol|lmao|omg|btw|imo|tbh|ngl)\b/i,
  /!{2,}/,
  /\b(hey|yo|sup|dude|bro)\b/i,
  /[😀-🙏🤣🤗🎉🔥💯👍]/u,
];

const FORMAL_MARKERS = [
  /\b(furthermore|moreover|consequently|nevertheless|notwithstanding)\b/i,
  /\b(herein|thereof|whereby|wherein)\b/i,
  /\b(it is (important|worth|notable) to note)\b/i,
  /\b(one might|one could|it should be noted)\b/i,
  /\b(in accordance with|with respect to|pertaining to)\b/i,
];

/**
 * Detect formality register consistency.
 * Flags mismatches — e.g., agent oscillates between very formal and very casual.
 */
export function detectFormalityIssues(messages: Message[]): DetectedPattern | null {
  const assistantMsgs = messages.filter((m) => m.role === "assistant");
  if (assistantMsgs.length < 5) return null;

  let informalCount = 0;
  let formalCount = 0;

  for (const msg of assistantMsgs) {
    const hasInformal = INFORMAL_MARKERS.some((p) => p.test(msg.content));
    const hasFormal = FORMAL_MARKERS.some((p) => p.test(msg.content));

    if (hasInformal) informalCount++;
    if (hasFormal) formalCount++;
  }

  const total = assistantMsgs.length;
  const informalPct = (informalCount / total) * 100;
  const formalPct = (formalCount / total) * 100;

  // Both high = register inconsistency
  if (informalPct > 20 && formalPct > 20) {
    return {
      id: "register-inconsistency",
      name: "Register inconsistency",
      severity: "warning",
      count: informalCount + formalCount,
      percentage: Math.round(((informalCount + formalCount) / total) * 50),
      description: `Agent oscillates between formal (${Math.round(formalPct)}% of responses) and informal (${Math.round(informalPct)}%) language. This inconsistency erodes trust.`,
      examples: [],
      prescription: "Set communication.register explicitly. If 'adaptive', ensure transitions are smooth rather than jarring.",
    };
  }

  return null;
}
