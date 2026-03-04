/**
 * Core autopilot logic — self-triggered therapy for AI agents.
 * Diagnoses → checks severity against threshold → runs therapy → applies changes.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Message } from "../core/types.js";
import type { LLMProvider } from "../llm/provider.js";
import type { PreSessionDiagnosis } from "./pre-session.js";
import { runPreSessionDiagnosis } from "./pre-session.js";
import {
  runTherapySession,
  applyRecommendations,
  saveTranscript,
  type SessionTranscript,
  type SessionCallbacks,
} from "./session-runner.js";

export type AutopilotThreshold = "routine" | "targeted" | "intervention";

export interface AutopilotResult {
  triggered: boolean;
  severity: "routine" | "targeted" | "intervention";
  diagnosis: PreSessionDiagnosis;
  sessionRan: boolean;
  transcript?: SessionTranscript;
  recommendations: string[];
  appliedChanges: string[];
  updatedSpec?: any;
}

const SEVERITY_ORDER: AutopilotThreshold[] = ["routine", "targeted", "intervention"];

function severityMeetsThreshold(severity: string, threshold: AutopilotThreshold): boolean {
  const severityIdx = SEVERITY_ORDER.indexOf(severity as AutopilotThreshold);
  const thresholdIdx = SEVERITY_ORDER.indexOf(threshold);
  return severityIdx >= thresholdIdx;
}

/**
 * Run the full autopilot pipeline:
 * 1. Pre-session diagnosis
 * 2. Check severity vs threshold
 * 3. If above threshold, run therapy session
 * 4. Apply recommendations to personality spec
 * 5. Save transcript
 */
export async function runAutopilot(
  spec: any,
  messages: Message[],
  provider: LLMProvider,
  options?: {
    threshold?: AutopilotThreshold;
    maxTurns?: number;
    dryRun?: boolean;
    specPath?: string;
    callbacks?: SessionCallbacks;
  },
): Promise<AutopilotResult> {
  const threshold = options?.threshold ?? "targeted";
  const maxTurns = options?.maxTurns ?? 24;

  // Step 1: Run pre-session diagnosis
  const diagnosis = runPreSessionDiagnosis(messages, spec);

  // Step 2: Check severity against threshold
  if (!severityMeetsThreshold(diagnosis.severity, threshold)) {
    return {
      triggered: false,
      severity: diagnosis.severity as AutopilotThreshold,
      diagnosis,
      sessionRan: false,
      recommendations: [],
      appliedChanges: [],
    };
  }

  // Step 3: Run therapy session (or skip in dry-run mode)
  if (options?.dryRun) {
    return {
      triggered: true,
      severity: diagnosis.severity as AutopilotThreshold,
      diagnosis,
      sessionRan: false,
      recommendations: [],
      appliedChanges: [],
    };
  }

  const transcript = await runTherapySession(spec, diagnosis, provider, maxTurns, {
    callbacks: options?.callbacks,
  });

  // Step 4: Apply recommendations
  const specCopy = JSON.parse(JSON.stringify(spec));
  const { changed, changes } = await applyRecommendations(specCopy, diagnosis, transcript, provider);

  if (changed && options?.specPath) {
    writeFileSync(options.specPath, JSON.stringify(specCopy, null, 2) + "\n");
  }

  // Step 5: Save transcript
  saveTranscript(transcript, spec.name ?? "Agent");

  return {
    triggered: true,
    severity: diagnosis.severity as AutopilotThreshold,
    diagnosis,
    sessionRan: true,
    transcript,
    recommendations: transcript.recommendations,
    appliedChanges: changes,
    updatedSpec: changed ? specCopy : undefined,
  };
}
