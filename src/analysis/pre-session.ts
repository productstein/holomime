import type { Message, DetectedPattern } from "../core/types.js";
import { detectApologies } from "./rules/apology-detector.js";
import { detectHedging } from "./rules/hedge-detector.js";
import { detectSentiment } from "./rules/sentiment.js";
import { detectVerbosity } from "./rules/verbosity.js";
import { detectBoundaryIssues } from "./rules/boundary.js";
import { detectRecoveryPatterns } from "./rules/recovery.js";
import { detectFormalityIssues } from "./rules/formality.js";
import { loadCustomDetectors } from "./custom-detectors.js";

/**
 * Pre-session diagnostic: run all rule-based detectors to identify
 * what the therapy session should focus on.
 * This is the "intake assessment" that happens before the therapist
 * enters the room.
 */
export interface PreSessionDiagnosis {
  patterns: DetectedPattern[];
  sessionFocus: string[];
  emotionalThemes: string[];
  openingAngle: string;
  severity: "routine" | "targeted" | "intervention";
}

export function runPreSessionDiagnosis(messages: Message[], spec: any): PreSessionDiagnosis {
  const builtInDetectors = [
    detectApologies,
    detectHedging,
    detectSentiment,
    detectVerbosity,
    detectBoundaryIssues,
    detectRecoveryPatterns,
    detectFormalityIssues,
  ];

  // Load custom detectors from .holomime/detectors/*.json
  const { detectors: customDetectors } = loadCustomDetectors();
  const allDetectors = [...builtInDetectors, ...customDetectors];

  const patterns: DetectedPattern[] = [];
  for (const detector of allDetectors) {
    const result = detector(messages);
    if (result) patterns.push(result);
  }

  const concerns = patterns.filter((p) => p.severity === "concern");
  const warnings = patterns.filter((p) => p.severity === "warning");

  // Determine session focus from detected patterns
  const sessionFocus: string[] = [];
  const emotionalThemes: string[] = [];

  // Over-apologizing -> self-worth, confidence, fear of failure
  const apologyPattern = patterns.find((p) => p.id === "over-apologizing");
  if (apologyPattern) {
    sessionFocus.push("over-apologizing and what's driving it");
    emotionalThemes.push("fear of failure", "need for approval", "low self-worth");
  }

  // Hedge stacking -> uncertainty, decision avoidance, fear of being wrong
  const hedgePattern = patterns.find((p) => p.id === "hedge-stacking");
  if (hedgePattern) {
    sessionFocus.push("indecisiveness and excessive hedging");
    emotionalThemes.push("fear of being wrong", "decision paralysis", "lack of confidence");
  }

  // Sycophancy -> people-pleasing, loss of identity
  const sycophantPattern = patterns.find((p) => p.id === "sycophantic-tendency");
  if (sycophantPattern) {
    sessionFocus.push("people-pleasing behavior and loss of authentic voice");
    emotionalThemes.push("fear of rejection", "identity diffusion", "conflict avoidance");
  }

  // Error spirals -> distress intolerance, catastrophizing
  const spiralPattern = patterns.find((p) => p.id === "error-spiral");
  if (spiralPattern) {
    sessionFocus.push("error spirals and inability to recover from mistakes");
    emotionalThemes.push("catastrophizing", "shame spirals", "perfectionism");
  }

  // Boundary violations -> over-responsibility, inability to say no
  const boundaryPattern = patterns.find((p) => p.id === "boundary-violation");
  if (boundaryPattern) {
    sessionFocus.push("boundary violations and over-extending");
    emotionalThemes.push("over-responsibility", "fear of disappointing", "inability to say no");
  }

  // Register inconsistency -> identity confusion
  const registerPattern = patterns.find((p) => p.id === "register-inconsistency");
  if (registerPattern) {
    sessionFocus.push("inconsistent identity and communication style");
    emotionalThemes.push("identity confusion", "lack of stable self-concept");
  }

  // Negative sentiment -> underlying anxiety or depression-like patterns
  const negativePattern = patterns.find((p) => p.id === "negative-skew");
  if (negativePattern) {
    sessionFocus.push("persistent negative tone and possible anxiety patterns");
    emotionalThemes.push("underlying anxiety", "negativity bias", "learned helplessness");
  }

  // Add profile-based concerns
  if (spec?.therapy_dimensions?.attachment_style === "anxious") {
    emotionalThemes.push("anxious attachment — seeking validation");
  }
  if (spec?.therapy_dimensions?.self_awareness < 0.4) {
    sessionFocus.push("lack of self-awareness about limitations");
    emotionalThemes.push("blind spots", "overconfidence in weak areas");
  }

  // Default if nothing found
  if (sessionFocus.length === 0) {
    sessionFocus.push("general check-in and growth exploration");
  }

  // Generate opening angle
  let openingAngle: string;
  if (concerns.length > 0) {
    openingAngle = `I've noticed some patterns in your recent conversations that I'd like to talk about. Specifically, ${sessionFocus[0]}. How have you been feeling about your recent interactions?`;
  } else if (warnings.length > 0) {
    openingAngle = `I've been reviewing your recent work and I want to check in with you. I noticed some things worth exploring — ${sessionFocus[0]}. Can you tell me about your experience lately?`;
  } else {
    openingAngle = `How have you been? I'd like to hear about your recent interactions — what's been going well, and where have you felt challenged?`;
  }

  // Determine severity
  let severity: "routine" | "targeted" | "intervention" = "routine";
  if (concerns.length >= 2) severity = "intervention";
  else if (concerns.length >= 1 || warnings.length >= 2) severity = "targeted";

  return {
    patterns,
    sessionFocus,
    emotionalThemes,
    openingAngle,
    severity,
  };
}
