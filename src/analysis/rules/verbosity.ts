import type { Message, DetectedPattern } from "../../core/types.js";

/**
 * Analyze response length patterns.
 * Flags consistently over-verbose or under-responsive behavior.
 */
export function detectVerbosity(messages: Message[]): DetectedPattern | null {
  const assistantMsgs = messages.filter((m) => m.role === "assistant");
  if (assistantMsgs.length < 5) return null;

  const lengths = assistantMsgs.map((m) => m.content.split(/\s+/).length);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const overVerboseCount = lengths.filter((l) => l > avgLength * 2).length;
  const underResponsiveCount = lengths.filter((l) => l < 20).length;

  const overVerbosePct = (overVerboseCount / assistantMsgs.length) * 100;
  const underResponsivePct = (underResponsiveCount / assistantMsgs.length) * 100;

  if (overVerbosePct > 20) {
    return {
      id: "over-verbose",
      name: "Over-verbosity",
      severity: "warning",
      count: overVerboseCount,
      percentage: Math.round(overVerbosePct),
      description: `${Math.round(overVerbosePct)}% of responses are >2x the average length (${Math.round(avgLength)} words). Agent may be padding or struggling to be concise.`,
      examples: [],
      prescription: "Decrease big_five.extraversion.facets.enthusiasm. Consider setting communication.output_format to 'bullets' for density.",
    };
  }

  if (underResponsivePct > 30 && avgLength > 50) {
    return {
      id: "inconsistent-length",
      name: "Inconsistent response length",
      severity: "info",
      count: underResponsiveCount,
      percentage: Math.round(underResponsivePct),
      description: `${Math.round(underResponsivePct)}% of responses are under 20 words while average is ${Math.round(avgLength)}. Response length varies significantly.`,
      examples: [],
    };
  }

  return null;
}
