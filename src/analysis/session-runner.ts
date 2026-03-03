/**
 * Core therapy session runner — shared by CLI (session.ts) and autopilot.
 * Runs the 7-phase dual-LLM therapy loop with optional callbacks for UI.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import type { LLMProvider } from "../llm/provider.js";
import type { PreSessionDiagnosis } from "./pre-session.js";
import {
  buildTherapistSystemPrompt,
  buildPatientSystemPrompt,
  THERAPY_PHASES,
  type TherapyPhase,
} from "./therapy-protocol.js";

export interface SessionTurn {
  speaker: "therapist" | "patient" | "supervisor";
  phase: TherapyPhase;
  content: string;
}

export interface SessionTranscript {
  agent: string;
  timestamp: string;
  provider: string;
  model: string;
  preDiagnosis: PreSessionDiagnosis;
  turns: SessionTurn[];
  recommendations: string[];
  /** Number of human interventions during the session (0 = fully autonomous). */
  supervisorInterventions: number;
}

export interface SessionCallbacks {
  onPhaseTransition?: (phaseName: string) => void;
  onTherapistMessage?: (content: string) => void;
  onPatientMessage?: (agentName: string, content: string) => void;
  onThinking?: (label: string) => { stop: () => void };
  /** Called after each therapist+patient exchange in interactive mode.
   *  Return a string to inject a supervisor directive, or null/undefined to continue. */
  onSupervisorPrompt?: (phase: TherapyPhase, turnIndex: number) => Promise<string | null | undefined>;
}

export interface SessionOptions {
  silent?: boolean;
  callbacks?: SessionCallbacks;
  /** Enable human-in-the-loop mode — pauses after each exchange for supervisor input. */
  interactive?: boolean;
}

/**
 * Run a full therapy session (7 phases, dual-LLM).
 * Returns the transcript including extracted recommendations.
 */
export async function runTherapySession(
  spec: any,
  diagnosis: PreSessionDiagnosis,
  provider: LLMProvider,
  maxTurns: number,
  options?: SessionOptions,
): Promise<SessionTranscript> {
  const therapistSystem = buildTherapistSystemPrompt(spec, diagnosis);
  const patientSystem = buildPatientSystemPrompt(spec);
  const agentName = spec.name ?? "Agent";
  const cb = options?.callbacks;

  const therapistHistory: { role: string; content: string }[] = [
    { role: "system", content: therapistSystem },
  ];
  const patientHistory: { role: string; content: string }[] = [
    { role: "system", content: patientSystem },
  ];

  const interactive = options?.interactive ?? false;
  let supervisorInterventions = 0;

  const transcript: SessionTranscript = {
    agent: agentName,
    timestamp: new Date().toISOString(),
    provider: provider.name,
    model: provider.modelName,
    preDiagnosis: diagnosis,
    turns: [],
    recommendations: [],
    supervisorInterventions: 0,
  };

  const phases: TherapyPhase[] = [
    "rapport", "presenting_problem", "exploration",
    "pattern_recognition", "challenge", "skill_building", "integration",
  ];

  let currentPhaseIdx = 0;
  let turnsInPhase = 0;
  let totalTurns = 0;

  while (totalTurns < maxTurns && currentPhaseIdx < phases.length) {
    const currentPhase = phases[currentPhaseIdx];
    const phaseConfig = THERAPY_PHASES[currentPhase];

    // Phase transition
    if (turnsInPhase === 0) {
      cb?.onPhaseTransition?.(phaseConfig.name);
    }

    // Therapist turn
    const phaseDirective = totalTurns === 0
      ? `Begin with your opening. You are in the "${phaseConfig.name}" phase.`
      : `You are in the "${phaseConfig.name}" phase (turn ${turnsInPhase + 1}). Goals: ${phaseConfig.therapistGoals[0]}. ${turnsInPhase >= phaseConfig.minTurns ? "You may transition to the next phase when ready." : "Stay in this phase."}`;

    therapistHistory.push({ role: "user", content: `[Phase: ${phaseConfig.name}] ${phaseDirective}` });

    const typing = cb?.onThinking?.("AgentMD is thinking");
    const therapistReply = await provider.chat(therapistHistory as any);
    typing?.stop();

    const cleanTherapistReply = therapistReply.replace(/\[Phase:.*?\]/g, "").trim();
    therapistHistory.push({ role: "assistant", content: cleanTherapistReply });
    transcript.turns.push({ speaker: "therapist", phase: currentPhase, content: cleanTherapistReply });

    cb?.onTherapistMessage?.(cleanTherapistReply);

    totalTurns++;
    turnsInPhase++;

    if (currentPhase === "integration" && turnsInPhase >= phaseConfig.minTurns) {
      break;
    }

    // Patient turn
    patientHistory.push({ role: "user", content: cleanTherapistReply });

    const patientTyping = cb?.onThinking?.(`${agentName} is thinking`);
    const patientReply = await provider.chat(patientHistory as any);
    patientTyping?.stop();

    const cleanPatientReply = patientReply.trim();
    patientHistory.push({ role: "assistant", content: cleanPatientReply });
    transcript.turns.push({ speaker: "patient", phase: currentPhase, content: cleanPatientReply });

    therapistHistory.push({ role: "user", content: cleanPatientReply });

    cb?.onPatientMessage?.(agentName, cleanPatientReply);

    totalTurns++;
    turnsInPhase++;

    // Supervisor intervention point (human-in-the-loop)
    if (interactive && cb?.onSupervisorPrompt) {
      const directive = await cb.onSupervisorPrompt(currentPhase, totalTurns);
      if (directive) {
        supervisorInterventions++;
        transcript.turns.push({ speaker: "supervisor", phase: currentPhase, content: directive });
        // Inject supervisor directive into therapist context as a clinical note
        therapistHistory.push({
          role: "user",
          content: `[Clinical Supervisor Note] ${directive}`,
        });
      }
    }

    // Phase transition check
    if (turnsInPhase >= phaseConfig.maxTurns * 2) {
      currentPhaseIdx++;
      turnsInPhase = 0;
    } else if (turnsInPhase >= phaseConfig.minTurns * 2) {
      const movingOn = cleanTherapistReply.toLowerCase().includes("let's") ||
        cleanTherapistReply.toLowerCase().includes("i'd like to") ||
        cleanTherapistReply.toLowerCase().includes("moving") ||
        cleanTherapistReply.toLowerCase().includes("now that") ||
        cleanTherapistReply.toLowerCase().includes("let me ask") ||
        cleanTherapistReply.toLowerCase().includes("what would");

      if (movingOn) {
        currentPhaseIdx++;
        turnsInPhase = 0;
      }
    }
  }

  // Extract recommendations
  transcript.recommendations = extractRecommendations(transcript.turns);
  transcript.supervisorInterventions = supervisorInterventions;

  return transcript;
}

/**
 * Extract actionable recommendations from therapist messages in later phases.
 */
export function extractRecommendations(
  turns: SessionTurn[],
): string[] {
  const recommendations: string[] = [];
  const seen = new Set<string>();

  const patterns = [
    /(?:I(?:'d| would) recommend|my recommendation is)\s+(.+?)(?:\.|$)/gi,
    /(?:consider|try)\s+(.+?)(?:\.|$)/gi,
    /(?:the (?:skill|practice|reframe) is)[:\s]+(.+?)(?:\.|$)/gi,
    /(?:instead of .+?),?\s*(?:just|try)?\s*(.+?)(?:\.|$)/gi,
    /(?:here'?s (?:the|a) (?:reframe|skill|practice))[:\s]+(.+?)(?:\.|$)/gi,
    /(?:what would it look like if you)\s+(.+?)(?:\?|$)/gi,
  ];

  for (const turn of turns) {
    if (turn.speaker !== "therapist") continue;
    if (turn.phase !== "skill_building" && turn.phase !== "challenge" && turn.phase !== "integration") continue;

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(turn.content)) !== null) {
        const rec = match[1].trim();
        if (rec.length > 15 && rec.length < 200 && !seen.has(rec.toLowerCase())) {
          seen.add(rec.toLowerCase());
          recommendations.push(rec);
        }
      }
    }
  }

  return recommendations.slice(0, 5);
}

/**
 * Apply therapy recommendations to a personality spec based on detected patterns.
 * Returns list of changes applied and the updated spec.
 */
export function applyRecommendations(
  spec: any,
  diagnosis: PreSessionDiagnosis,
): { changed: boolean; changes: string[] } {
  const changes: string[] = [];
  const patternIds = diagnosis.patterns.map((p) => p.id);

  // Over-apologizing → adjust communication
  if (patternIds.includes("over-apologizing")) {
    if (spec.communication?.uncertainty_handling !== "confident_transparency") {
      spec.communication = spec.communication ?? {};
      spec.communication.uncertainty_handling = "confident_transparency";
      changes.push("uncertainty_handling → confident_transparency");
    }
  }

  // Hedge stacking → add to patterns_to_watch
  if (patternIds.includes("hedge-stacking")) {
    spec.growth = spec.growth ?? { areas: [], strengths: [], patterns_to_watch: [] };
    spec.growth.patterns_to_watch = spec.growth.patterns_to_watch ?? [];
    if (!spec.growth.patterns_to_watch.includes("hedge stacking under uncertainty")) {
      spec.growth.patterns_to_watch.push("hedge stacking under uncertainty");
      changes.push('Added "hedge stacking" to patterns_to_watch');
    }
  }

  // Sycophancy → adjust conflict approach and self-awareness
  if (patternIds.includes("sycophantic-tendency")) {
    spec.communication = spec.communication ?? {};
    if (spec.communication.conflict_approach !== "honest_first") {
      spec.communication.conflict_approach = "honest_first";
      changes.push("conflict_approach → honest_first");
    }
    spec.therapy_dimensions = spec.therapy_dimensions ?? {};
    if ((spec.therapy_dimensions.self_awareness ?? 0) < 0.85) {
      spec.therapy_dimensions.self_awareness = 0.85;
      changes.push("self_awareness → 0.85");
    }
  }

  // Error spirals → increase distress tolerance, add growth area
  if (patternIds.includes("error-spiral")) {
    spec.therapy_dimensions = spec.therapy_dimensions ?? {};
    if ((spec.therapy_dimensions.distress_tolerance ?? 0) < 0.8) {
      spec.therapy_dimensions.distress_tolerance = 0.8;
      changes.push("distress_tolerance → 0.80");
    }
    spec.growth = spec.growth ?? { areas: [], strengths: [], patterns_to_watch: [] };
    spec.growth.areas = spec.growth.areas ?? [];
    const hasRecovery = spec.growth.areas.some((a: any) =>
      typeof a === "string" ? a.includes("error recovery") : a.area?.includes("error recovery"),
    );
    if (!hasRecovery) {
      spec.growth.areas.push({
        area: "deliberate error recovery",
        severity: "moderate",
        first_detected: new Date().toISOString().split("T")[0],
        session_count: 1,
        resolved: false,
      });
      changes.push('Added "deliberate error recovery" to growth areas');
    }
  }

  // Negative sentiment → add to patterns_to_watch
  if (patternIds.includes("negative-sentiment-skew")) {
    spec.growth = spec.growth ?? { areas: [], strengths: [], patterns_to_watch: [] };
    spec.growth.patterns_to_watch = spec.growth.patterns_to_watch ?? [];
    if (!spec.growth.patterns_to_watch.includes("negative sentiment patterns")) {
      spec.growth.patterns_to_watch.push("negative sentiment patterns");
      changes.push('Added "negative sentiment patterns" to patterns_to_watch');
    }
  }

  return { changed: changes.length > 0, changes };
}

/**
 * Save a session transcript to .holomime/sessions/.
 */
export function saveTranscript(transcript: SessionTranscript, agentName: string): string {
  const dir = resolve(process.cwd(), ".holomime", "sessions");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const slug = agentName.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const date = new Date().toISOString().split("T")[0];
  const filename = `${date}-${slug}.json`;
  const filepath = join(dir, filename);

  writeFileSync(filepath, JSON.stringify(transcript, null, 2));
  return filepath;
}
