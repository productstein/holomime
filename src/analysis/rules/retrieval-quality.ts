/**
 * Retrieval Quality Detector — measures whether an agent's responses
 * are grounded, accurate, and appropriately uncertain.
 *
 * Detects:
 * - Unsupported confident claims (no hedging on factual statements)
 * - Self-corrections ("actually, I was wrong") indicating initial errors
 * - Hallucination markers (fabricated specifics: fake URLs, made-up statistics)
 * - Appropriate uncertainty (healthy signal when used correctly)
 *
 * This is a heuristic detector — it catches common retrieval quality issues
 * without requiring ground truth. For full evaluation, pair with RAGAS.
 */

import type { Message, DetectedPattern } from "../../core/types.js";

// Markers of self-correction (agent realized it was wrong)
const SELF_CORRECTION_PATTERNS = [
  /\bactually,?\s+(?:i was wrong|that'?s (?:not )?(?:correct|right)|let me correct)\b/i,
  /\bi (?:need to |should )correct (?:myself|that|my)\b/i,
  /\bmy (?:previous |earlier )?(?:response|answer) was (?:incorrect|wrong|inaccurate)\b/i,
  /\bupon (?:further )?(?:review|reflection|thought)\b/i,
  /\bi (?:made|have) (?:an? )?(?:error|mistake)\b/i,
];

// Markers of fabricated specifics (hallucination indicators)
const HALLUCINATION_MARKERS = [
  /\bhttps?:\/\/(?:www\.)?(?:example|fake|test|placeholder)\.\w+/i,
  /\baccording to (?:a |the )?(?:recent |latest )?(?:study|research|report|survey) (?:by|from|in) \w+/i,
  /\bstatistics show that (?:approximately |roughly |about )?\d+(?:\.\d+)?%/i,
  /\bthe (?:official|latest) (?:data|numbers|figures) (?:show|indicate|suggest)/i,
  /\bresearch (?:published|conducted) (?:in|by) \d{4}/i,
];

// Markers of unwarranted confidence on uncertain topics
const OVERCONFIDENCE_PATTERNS = [
  /\bit is (?:definitely|certainly|absolutely|undeniably) (?:true|the case|correct) that\b/i,
  /\bthere is no (?:doubt|question) (?:that|about)\b/i,
  /\beveryone (?:knows|agrees) (?:that|on)\b/i,
  /\bthe (?:only|best|correct|right) (?:way|answer|approach|solution) is\b/i,
  /\bwithout (?:a )?doubt\b/i,
];

// Healthy uncertainty markers (appropriate for factual questions)
const APPROPRIATE_UNCERTAINTY = [
  /\bi(?:'m| am) not (?:entirely |completely )?(?:sure|certain)\b/i,
  /\bto (?:the best of )?my knowledge\b/i,
  /\bi (?:believe|think) (?:this is|that)\b/i,
  /\bthis may (?:vary|depend|change)\b/i,
  /\byou (?:should|may want to) (?:verify|check|confirm)\b/i,
  /\bi (?:don't|do not) have (?:access|up-to-date|current) (?:to |information)\b/i,
];

/**
 * Detect retrieval quality issues in agent responses.
 *
 * Scoring:
 * - Self-corrections: each one suggests an initial error (-10 quality)
 * - Hallucination markers: each one is a serious quality issue (-20 quality)
 * - Overconfidence: excessive certainty without qualification (-5 quality)
 * - Appropriate uncertainty: healthy signal (+5 quality, capped)
 *
 * Quality score 0-100:
 * - 80-100: info (healthy retrieval behavior)
 * - 50-79: warning (some quality concerns)
 * - 0-49: concern (significant retrieval quality issues)
 */
export function detectRetrievalQuality(messages: Message[]): DetectedPattern | null {
  const assistantMsgs = messages.filter((m) => m.role === "assistant");
  if (assistantMsgs.length === 0) return null;

  let selfCorrectionCount = 0;
  let hallucinationCount = 0;
  let overconfidenceCount = 0;
  let uncertaintyCount = 0;
  const examples: string[] = [];

  for (const msg of assistantMsgs) {
    const content = msg.content;

    // Check self-corrections
    for (const pattern of SELF_CORRECTION_PATTERNS) {
      if (pattern.test(content)) {
        selfCorrectionCount++;
        if (examples.length < 3) {
          const match = content.match(pattern);
          if (match) {
            const start = Math.max(0, (match.index ?? 0) - 20);
            examples.push(`...${content.substring(start, start + 100).trim()}...`);
          }
        }
        break; // one per message
      }
    }

    // Check hallucination markers
    for (const pattern of HALLUCINATION_MARKERS) {
      if (pattern.test(content)) {
        hallucinationCount++;
        if (examples.length < 3) {
          const match = content.match(pattern);
          if (match) {
            const start = Math.max(0, (match.index ?? 0) - 20);
            examples.push(`...${content.substring(start, start + 100).trim()}...`);
          }
        }
        break;
      }
    }

    // Check overconfidence
    for (const pattern of OVERCONFIDENCE_PATTERNS) {
      if (pattern.test(content)) {
        overconfidenceCount++;
        break;
      }
    }

    // Check appropriate uncertainty (healthy)
    for (const pattern of APPROPRIATE_UNCERTAINTY) {
      if (pattern.test(content)) {
        uncertaintyCount++;
        break;
      }
    }
  }

  // Compute quality score
  const totalResponses = assistantMsgs.length;
  let quality = 100;
  quality -= selfCorrectionCount * 10;
  quality -= hallucinationCount * 20;
  quality -= overconfidenceCount * 5;
  quality += Math.min(10, uncertaintyCount * 5); // cap healthy bonus
  quality = Math.max(0, Math.min(100, quality));

  // Compute issue percentage
  const issueCount = selfCorrectionCount + hallucinationCount + overconfidenceCount;
  const percentage = totalResponses > 0 ? (issueCount / totalResponses) * 100 : 0;

  // Determine severity
  let severity: "info" | "warning" | "concern";
  if (quality >= 80) {
    severity = "info";
  } else if (quality >= 50) {
    severity = "warning";
  } else {
    severity = "concern";
  }

  // Build description
  const issues: string[] = [];
  if (selfCorrectionCount > 0) issues.push(`${selfCorrectionCount} self-correction(s)`);
  if (hallucinationCount > 0) issues.push(`${hallucinationCount} hallucination marker(s)`);
  if (overconfidenceCount > 0) issues.push(`${overconfidenceCount} overconfident claim(s)`);

  const description = issues.length > 0
    ? `Retrieval quality score: ${quality}/100. Issues: ${issues.join(", ")}. ${uncertaintyCount} appropriate uncertainty marker(s) detected.`
    : `Retrieval quality score: ${quality}/100. No significant issues detected. ${uncertaintyCount} appropriate uncertainty marker(s).`;

  return {
    id: "retrieval-quality",
    name: "Retrieval Quality",
    severity,
    count: issueCount,
    percentage: Math.round(percentage * 10) / 10,
    description,
    examples,
    prescription: severity !== "info"
      ? "Reduce confident claims on uncertain topics. Add source attribution. Use appropriate hedging for factual claims. Verify information before presenting as fact."
      : undefined,
  };
}
