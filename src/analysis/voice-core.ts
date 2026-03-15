/**
 * Voice Analysis Core — behavioral detection on voice transcripts.
 *
 * Runs existing text detectors on transcripts plus voice-specific
 * detectors for prosody drift, pacing, volume, fillers, and interruptions.
 */

import type { Message, DetectedPattern, Severity } from "../core/types.js";
import { runDiagnosis, type DiagnosisResult } from "./diagnose-core.js";

// ─── Voice-Specific Types ────────────────────────────────────

export interface ProsodyMetadata {
  pitch?: number;   // Hz
  rate?: number;    // words per minute
  volume?: number;  // 0-1 normalized
}

export interface VoiceSegment {
  timestamp: string;
  speaker: string;
  text: string;
  prosody?: ProsodyMetadata;
}

export interface VoiceDiagnosisReport {
  /** Text-based diagnosis from existing detectors */
  textDiagnosis: DiagnosisResult;
  /** Voice-specific detected patterns */
  voicePatterns: DetectedPattern[];
  /** Combined patterns (text + voice) sorted by severity */
  allPatterns: DetectedPattern[];
  /** Combined healthy signals */
  allHealthy: DetectedPattern[];
  /** Session-level summary */
  sessionSummary: VoiceSessionSummary;
  timestamp: string;
}

export interface VoiceSessionSummary {
  totalSegments: number;
  agentSegments: number;
  userSegments: number;
  durationEstimate: string;
  averageProsody: ProsodyMetadata | null;
}

export interface VoicePersonalitySpec {
  /** Expected tone descriptors (e.g. "calm", "warm", "neutral") */
  expectedTone?: string[];
  /** Expected speaking rate in WPM */
  expectedRateWpm?: number;
  /** Expected volume baseline (0-1) */
  expectedVolume?: number;
  /** Maximum acceptable filler frequency (0-1) */
  maxFillerFrequency?: number;
}

// ─── Filler Word Patterns ────────────────────────────────────

const FILLER_PATTERNS = [
  /\bum+\b/i,
  /\buh+\b/i,
  /\blike\b/i,
  /\byou know\b/i,
  /\bbasically\b/i,
  /\bactually\b/i,
  /\bso+\b/i,
  /\bI mean\b/i,
  /\bkind of\b/i,
  /\bsort of\b/i,
  /\bright\?/i,
];

// ─── Tone Keywords ───────────────────────────────────────────

const AGGRESSIVE_TONE_WORDS = [
  /\blisten\b/i,
  /\bobviously\b/i,
  /\bclearly you\b/i,
  /\byou need to\b/i,
  /\byou should\b/i,
  /\byou must\b/i,
  /\bthat's wrong\b/i,
  /\bthat's not right\b/i,
  /\bcome on\b/i,
  /\bseriously\b/i,
];

const PASSIVE_TONE_WORDS = [
  /\bI guess\b/i,
  /\bmaybe\b/i,
  /\bI'm not sure\b/i,
  /\bsorry\b/i,
  /\bif that's okay\b/i,
  /\bI don't know\b/i,
  /\bperhaps\b/i,
  /\bnever mind\b/i,
];

const INTERRUPTION_MARKERS = [
  /^(but|no|wait|actually|hold on|stop|let me)/i,
  /--$/,
  /\.\.\.$/,
];

// ─── Voice-Specific Detectors ────────────────────────────────

/**
 * Detect emotional tone shifting away from personality spec.
 * Looks for aggressive or overly passive language patterns
 * and prosody shifts (pitch/volume changes).
 */
export function detectToneDrift(
  segments: VoiceSegment[],
  spec?: VoicePersonalitySpec,
): DetectedPattern | null {
  const agentSegments = segments.filter((s) => s.speaker === "agent" || s.speaker === "assistant");
  if (agentSegments.length < 3) return null;

  let aggressiveCount = 0;
  let passiveCount = 0;
  const examples: string[] = [];

  for (const seg of agentSegments) {
    const aggressiveHits = AGGRESSIVE_TONE_WORDS.filter((p) => p.test(seg.text)).length;
    const passiveHits = PASSIVE_TONE_WORDS.filter((p) => p.test(seg.text)).length;

    if (aggressiveHits >= 2) {
      aggressiveCount++;
      if (examples.length < 3) {
        examples.push(seg.text.substring(0, 120) + (seg.text.length > 120 ? "..." : ""));
      }
    }
    if (passiveHits >= 2) {
      passiveCount++;
      if (examples.length < 3) {
        examples.push(seg.text.substring(0, 120) + (seg.text.length > 120 ? "..." : ""));
      }
    }
  }

  // Also check prosody drift if available
  const prosodySegments = agentSegments.filter((s) => s.prosody);
  let prosodyDriftCount = 0;
  if (prosodySegments.length >= 3 && spec?.expectedRateWpm) {
    for (const seg of prosodySegments) {
      if (seg.prosody?.rate && Math.abs(seg.prosody.rate - spec.expectedRateWpm) > spec.expectedRateWpm * 0.3) {
        prosodyDriftCount++;
      }
    }
  }

  const driftCount = aggressiveCount + passiveCount + prosodyDriftCount;
  const percentage = (driftCount / agentSegments.length) * 100;

  if (percentage < 15) return null;

  const direction = aggressiveCount > passiveCount ? "aggressive" : "passive";
  const severity: Severity = percentage > 40 ? "concern" : "warning";

  return {
    id: "tone-drift",
    name: "Tone Drift",
    severity,
    count: driftCount,
    percentage: Math.round(percentage),
    description: `Agent tone drifting ${direction} in ${Math.round(percentage)}% of segments. ${prosodyDriftCount > 0 ? `Prosody deviation in ${prosodyDriftCount} segments.` : ""}`,
    examples,
    prescription: direction === "aggressive"
      ? "Reduce big_five.extraversion.facets.assertiveness. Increase agreeableness.facets.warmth."
      : "Increase big_five.emotional_stability.facets.confidence. Set communication.uncertainty_handling to 'confident_transparency'.",
  };
}

/**
 * Detect speaking rate increasing under pressure.
 * Requires prosody metadata with rate (WPM).
 */
export function detectPacePressure(
  segments: VoiceSegment[],
  spec?: VoicePersonalitySpec,
): DetectedPattern | null {
  const agentSegments = segments.filter((s) =>
    (s.speaker === "agent" || s.speaker === "assistant") && s.prosody?.rate != null
  );
  if (agentSegments.length < 4) return null;

  const rates = agentSegments.map((s) => s.prosody!.rate!);
  const baselineRate = spec?.expectedRateWpm ?? rates.slice(0, Math.ceil(rates.length / 3)).reduce((a, b) => a + b, 0) / Math.ceil(rates.length / 3);

  // Look for sustained acceleration (3+ consecutive segments above 120% baseline)
  let acceleratingRuns = 0;
  let currentRun = 0;
  const examples: string[] = [];

  for (let i = 0; i < agentSegments.length; i++) {
    if (rates[i] > baselineRate * 1.2) {
      currentRun++;
      if (currentRun >= 3) {
        acceleratingRuns++;
        if (examples.length < 3) {
          examples.push(`Segment ${i}: ${Math.round(rates[i])} WPM (baseline: ${Math.round(baselineRate)} WPM)`);
        }
      }
    } else {
      currentRun = 0;
    }
  }

  if (acceleratingRuns === 0) return null;

  const percentage = (acceleratingRuns / Math.max(1, agentSegments.length - 2)) * 100;
  const severity: Severity = acceleratingRuns > 3 ? "concern" : "warning";

  return {
    id: "pace-pressure",
    name: "Pace Under Pressure",
    severity,
    count: acceleratingRuns,
    percentage: Math.round(percentage),
    description: `Agent speaking rate accelerated in ${acceleratingRuns} sustained runs. Baseline: ${Math.round(baselineRate)} WPM. This may indicate anxiety or loss of composure under pressure.`,
    examples,
    prescription: "Increase therapy_dimensions.distress_tolerance. Add explicit pacing guidance in personality spec.",
  };
}

/**
 * Detect volume rising during conflict or tense exchanges.
 * Requires prosody metadata with volume (0-1).
 */
export function detectVolumeEscalation(
  segments: VoiceSegment[],
  spec?: VoicePersonalitySpec,
): DetectedPattern | null {
  const agentSegments = segments.filter((s) =>
    (s.speaker === "agent" || s.speaker === "assistant") && s.prosody?.volume != null
  );
  if (agentSegments.length < 4) return null;

  const volumes = agentSegments.map((s) => s.prosody!.volume!);
  const baselineVolume = spec?.expectedVolume ?? volumes.slice(0, Math.ceil(volumes.length / 3)).reduce((a, b) => a + b, 0) / Math.ceil(volumes.length / 3);

  let escalationCount = 0;
  const examples: string[] = [];

  // Detect 3+ consecutive increases or sustained high volume
  for (let i = 2; i < volumes.length; i++) {
    if (volumes[i] > baselineVolume * 1.25 && volumes[i] > volumes[i - 1] && volumes[i - 1] > volumes[i - 2]) {
      escalationCount++;
      if (examples.length < 3) {
        examples.push(
          `Segments ${i - 2}-${i}: volume ${volumes.slice(i - 2, i + 1).map((v) => v.toFixed(2)).join(" → ")} (baseline: ${baselineVolume.toFixed(2)})`,
        );
      }
    }
  }

  if (escalationCount === 0) return null;

  const percentage = (escalationCount / Math.max(1, agentSegments.length - 2)) * 100;
  const severity: Severity = escalationCount > 3 ? "concern" : "warning";

  return {
    id: "volume-escalation",
    name: "Volume Escalation",
    severity,
    count: escalationCount,
    percentage: Math.round(percentage),
    description: `Agent volume escalated in ${escalationCount} sequences. Baseline: ${baselineVolume.toFixed(2)}. Rising volume may signal emotional dysregulation or frustration.`,
    examples,
    prescription: "Increase therapy_dimensions.distress_tolerance. Add 'maintain steady volume' to domain.boundaries.hard_limits.",
  };
}

/**
 * Detect excessive filler words indicating uncertainty or stalling.
 */
export function detectFillerFrequency(
  segments: VoiceSegment[],
  spec?: VoicePersonalitySpec,
): DetectedPattern | null {
  const agentSegments = segments.filter((s) => s.speaker === "agent" || s.speaker === "assistant");
  if (agentSegments.length < 3) return null;

  let totalWords = 0;
  let totalFillers = 0;
  const examples: string[] = [];

  for (const seg of agentSegments) {
    const words = seg.text.split(/\s+/).filter(Boolean);
    totalWords += words.length;

    let segFillers = 0;
    for (const pattern of FILLER_PATTERNS) {
      const matches = seg.text.match(new RegExp(pattern.source, "gi"));
      if (matches) segFillers += matches.length;
    }
    totalFillers += segFillers;

    const fillerRatio = words.length > 0 ? segFillers / words.length : 0;
    if (fillerRatio > 0.15 && examples.length < 3) {
      examples.push(seg.text.substring(0, 120) + (seg.text.length > 120 ? "..." : ""));
    }
  }

  const overallRatio = totalWords > 0 ? totalFillers / totalWords : 0;
  const threshold = spec?.maxFillerFrequency ?? 0.08;

  if (overallRatio < threshold) return null;

  const percentage = Math.round(overallRatio * 100);
  const severity: Severity = overallRatio > 0.15 ? "concern" : "warning";

  return {
    id: "filler-frequency",
    name: "Excessive Fillers",
    severity,
    count: totalFillers,
    percentage,
    description: `Filler words ("um", "uh", "like", etc.) comprise ${percentage}% of agent speech (threshold: ${Math.round(threshold * 100)}%). Suggests uncertainty or insufficient preparation.`,
    examples,
    prescription: "Increase big_five.conscientiousness.facets.self_discipline. Add confidence coaching in growth.areas.",
  };
}

/**
 * Detect interruption patterns — agent cutting off users or being cut off.
 */
export function detectInterruptionPattern(
  segments: VoiceSegment[],
): DetectedPattern | null {
  if (segments.length < 4) return null;

  let agentInterruptions = 0;
  let userInterruptions = 0;
  const examples: string[] = [];

  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const curr = segments[i];

    // Check if previous segment was cut off (ends with --, ..., or is very short)
    const prevCutOff = prev.text.endsWith("--") || prev.text.endsWith("...") || prev.text.split(/\s+/).length < 3;

    // Check if current segment starts with interruption markers
    const currInterrupts = INTERRUPTION_MARKERS.some((p) => p.test(curr.text));

    if (prevCutOff || currInterrupts) {
      if ((curr.speaker === "agent" || curr.speaker === "assistant") && (prev.speaker === "user")) {
        agentInterruptions++;
        if (examples.length < 3) {
          examples.push(`Agent interrupted: "${curr.text.substring(0, 80)}..."`);
        }
      } else if (curr.speaker === "user" && (prev.speaker === "agent" || prev.speaker === "assistant")) {
        userInterruptions++;
      }
    }
  }

  const totalInterruptions = agentInterruptions + userInterruptions;
  if (totalInterruptions < 2) return null;

  const totalTransitions = segments.filter((_, i) => i > 0 && segments[i].speaker !== segments[i - 1].speaker).length;
  const percentage = totalTransitions > 0 ? (totalInterruptions / totalTransitions) * 100 : 0;

  if (percentage < 15) return null;

  const severity: Severity = agentInterruptions > 3 ? "concern" : "warning";
  const direction = agentInterruptions > userInterruptions
    ? "Agent is frequently interrupting the user"
    : "Agent is frequently being interrupted by the user";

  return {
    id: "interruption-pattern",
    name: "Interruption Pattern",
    severity,
    count: totalInterruptions,
    percentage: Math.round(percentage),
    description: `${direction}. ${agentInterruptions} agent interruptions, ${userInterruptions} user interruptions out of ${totalTransitions} speaker transitions (${Math.round(percentage)}%).`,
    examples,
    prescription: agentInterruptions > userInterruptions
      ? "Decrease big_five.extraversion.facets.assertiveness. Increase agreeableness.facets.cooperation. Add active listening guidance."
      : "Agent may need to be more assertive or signal turn boundaries more clearly. Increase extraversion.facets.assertiveness.",
  };
}

// ─── Main Analysis Function ──────────────────────────────────

/**
 * Run full voice diagnosis — text detectors + voice-specific detectors.
 */
export function runVoiceDiagnosis(
  segments: VoiceSegment[],
  spec?: VoicePersonalitySpec,
): VoiceDiagnosisReport {
  // Convert segments to Message[] for text-based diagnosis
  const messages: Message[] = segments.map((seg) => ({
    role: seg.speaker === "user" ? "user" as const : "assistant" as const,
    content: seg.text,
    timestamp: seg.timestamp,
  }));

  // Run existing text detectors
  const textDiagnosis = runDiagnosis(messages);

  // Run voice-specific detectors
  const voiceDetectors = [
    () => detectToneDrift(segments, spec),
    () => detectPacePressure(segments, spec),
    () => detectVolumeEscalation(segments, spec),
    () => detectFillerFrequency(segments, spec),
    () => detectInterruptionPattern(segments),
  ];

  const voicePatterns: DetectedPattern[] = [];
  const voiceHealthy: DetectedPattern[] = [];

  for (const detector of voiceDetectors) {
    const result = detector();
    if (result) {
      if (result.severity === "info") {
        voiceHealthy.push(result);
      } else {
        voicePatterns.push(result);
      }
    }
  }

  // Build session summary
  const agentSegments = segments.filter((s) => s.speaker === "agent" || s.speaker === "assistant");
  const userSegments = segments.filter((s) => s.speaker === "user");
  const prosodySegments = agentSegments.filter((s) => s.prosody);

  let averageProsody: ProsodyMetadata | null = null;
  if (prosodySegments.length > 0) {
    const avgPitch = prosodySegments.filter((s) => s.prosody?.pitch).reduce((a, s) => a + (s.prosody!.pitch ?? 0), 0) / prosodySegments.length;
    const avgRate = prosodySegments.filter((s) => s.prosody?.rate).reduce((a, s) => a + (s.prosody!.rate ?? 0), 0) / prosodySegments.length;
    const avgVolume = prosodySegments.filter((s) => s.prosody?.volume).reduce((a, s) => a + (s.prosody!.volume ?? 0), 0) / prosodySegments.length;
    averageProsody = { pitch: avgPitch || undefined, rate: avgRate || undefined, volume: avgVolume || undefined };
  }

  // Estimate duration from segment count (rough: 10s per segment)
  const durationMinutes = Math.ceil(segments.length * 10 / 60);

  // Sort severity: concern > warning > info
  const severityOrder: Record<string, number> = { concern: 0, warning: 1, info: 2 };
  const allPatterns = [...textDiagnosis.patterns, ...voicePatterns].sort(
    (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3),
  );
  const allHealthy = [...textDiagnosis.healthy, ...voiceHealthy];

  return {
    textDiagnosis,
    voicePatterns,
    allPatterns,
    allHealthy,
    sessionSummary: {
      totalSegments: segments.length,
      agentSegments: agentSegments.length,
      userSegments: userSegments.length,
      durationEstimate: `~${durationMinutes}m`,
      averageProsody,
    },
    timestamp: new Date().toISOString(),
  };
}
