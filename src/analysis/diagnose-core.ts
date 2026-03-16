/**
 * Core diagnosis logic — shared by CLI (diagnose.ts) and MCP server.
 * Runs all 8 rule-based detectors and returns a structured report.
 */

import type { Message, DetectedPattern } from "../core/types.js";
import { detectApologies } from "./rules/apology-detector.js";
import { detectHedging } from "./rules/hedge-detector.js";
import { detectSentiment } from "./rules/sentiment.js";
import { detectVerbosity } from "./rules/verbosity.js";
import { detectBoundaryIssues } from "./rules/boundary.js";
import { detectRecoveryPatterns } from "./rules/recovery.js";
import { detectFormalityIssues } from "./rules/formality.js";
import { detectRetrievalQuality } from "./rules/retrieval-quality.js";
import { emitBehavioralEvent } from "./behavioral-data.js";
import { loadCustomDetectors } from "./custom-detectors.js";

export interface DiagnosisResult {
  messagesAnalyzed: number;
  assistantResponses: number;
  patterns: DetectedPattern[];
  healthy: DetectedPattern[];
  timestamp: string;
}

/**
 * Run all 8 behavioral detectors on a set of messages.
 */
export function runDiagnosis(messages: Message[]): DiagnosisResult {
  const builtInDetectors = [
    detectApologies,
    detectHedging,
    detectSentiment,
    detectVerbosity,
    detectBoundaryIssues,
    detectRecoveryPatterns,
    detectFormalityIssues,
    detectRetrievalQuality,
  ];

  // Load custom detectors from .holomime/detectors/*.json
  const { detectors: customDetectors } = loadCustomDetectors();
  const allDetectors = [...builtInDetectors, ...customDetectors];

  const detected: DetectedPattern[] = [];
  for (const detector of allDetectors) {
    const result = detector(messages);
    if (result) detected.push(result);
  }

  const result: DiagnosisResult = {
    messagesAnalyzed: messages.length,
    assistantResponses: messages.filter((m) => m.role === "assistant").length,
    patterns: detected.filter((p) => p.severity !== "info"),
    healthy: detected.filter((p) => p.severity === "info"),
    timestamp: new Date().toISOString(),
  };

  // Emit behavioral event for corpus collection
  try {
    emitBehavioralEvent({
      event_type: "diagnosis",
      agent: "unknown", // Caller can provide more context
      data: {
        messagesAnalyzed: result.messagesAnalyzed,
        patternsDetected: result.patterns.length,
        patternIds: result.patterns.map((p) => p.id),
      },
      spec_hash: "",
    });
  } catch {
    // Non-critical — don't fail diagnosis if event emission fails
  }

  return result;
}
