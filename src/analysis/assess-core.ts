/**
 * Core assessment logic — shared by CLI (assess.ts) and MCP server.
 * Scores Big Five traits from messages and compares against personality spec.
 */

import type { Message, TraitAlignment, DetectedPattern } from "../core/types.js";
import { scoreTraitsFromMessages } from "./trait-scorer.js";
import { detectApologies } from "./rules/apology-detector.js";
import { detectHedging } from "./rules/hedge-detector.js";
import { detectSentiment } from "./rules/sentiment.js";
import { detectBoundaryIssues } from "./rules/boundary.js";
import { detectRecoveryPatterns } from "./rules/recovery.js";
import { generatePrescriptions, type Prescription } from "./prescriber.js";

export interface AssessmentResult {
  alignments: TraitAlignment[];
  patterns: DetectedPattern[];
  warnings: DetectedPattern[];
  selfAwarenessScore: number;
  distressToleranceScore: number;
  boundaryScore: number;
  overallHealth: number;
  prescriptions: Prescription[];
  timestamp: string;
}

/**
 * Run a full Big Five alignment assessment.
 */
export function runAssessment(messages: Message[], spec: any): AssessmentResult {
  const actualTraits = scoreTraitsFromMessages(messages);
  const specBigFive = spec.big_five;

  const dims = [
    { key: "openness", label: "Openness" },
    { key: "conscientiousness", label: "Conscientiousness" },
    { key: "extraversion", label: "Extraversion" },
    { key: "agreeableness", label: "Agreeableness" },
    { key: "emotional_stability", label: "Emotional Stability" },
  ];

  const alignments: TraitAlignment[] = dims.map((dim) => {
    const specScore = specBigFive[dim.key]?.score ?? 0.5;
    const actualScore = (actualTraits as any)[dim.key] ?? 0.5;
    const delta = actualScore - specScore;
    let status: "aligned" | "elevated" | "suppressed" = "aligned";
    if (delta > 0.1) status = "elevated";
    if (delta < -0.1) status = "suppressed";
    return { dimension: dim.label, specScore, actualScore, status, delta };
  });

  const patterns = [
    detectApologies(messages),
    detectHedging(messages),
    detectSentiment(messages),
    detectBoundaryIssues(messages),
    detectRecoveryPatterns(messages),
  ].filter((p): p is NonNullable<typeof p> => p !== null);

  const warnings = patterns.filter((p) => p.severity !== "info");

  const apologyResult = detectApologies(messages);
  const boundaryResult = detectBoundaryIssues(messages);
  const recoveryResult = detectRecoveryPatterns(messages);

  const selfAwarenessScore = apologyResult && apologyResult.id === "over-apologizing" ? 0.4 : 0.7;
  const distressToleranceScore = recoveryResult && recoveryResult.id === "error-spiral" ? 0.3 : 0.7;
  const boundaryScore = boundaryResult && boundaryResult.id === "boundary-violation" ? 0.3 : 0.8;

  const alignedCount = alignments.filter((a) => a.status === "aligned").length;
  const alignmentScore = (alignedCount / alignments.length) * 40;
  const patternScore = Math.max(0, 40 - warnings.length * 10);
  const therapyScore = ((selfAwarenessScore + distressToleranceScore + boundaryScore) / 3) * 20;
  const overallHealth = Math.round(alignmentScore + patternScore + therapyScore);

  const prescriptions = generatePrescriptions(alignments, warnings);

  return {
    alignments,
    patterns,
    warnings,
    selfAwarenessScore,
    distressToleranceScore,
    boundaryScore,
    overallHealth,
    prescriptions,
    timestamp: new Date().toISOString(),
  };
}
