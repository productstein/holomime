/**
 * Core therapy session runner — shared by CLI (session.ts) and autopilot.
 * Runs the 7-phase dual-LLM therapy loop with optional callbacks for UI.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import type { LLMProvider, LLMMessage } from "../llm/provider.js";
import type { PreSessionDiagnosis } from "./pre-session.js";
import {
  buildTherapistSystemPrompt,
  buildPatientSystemPrompt,
  THERAPY_PHASES,
  type TherapyPhase,
  type TherapistPromptOptions,
} from "./therapy-protocol.js";
import { emitBehavioralEvent } from "./behavioral-data.js";
import type { TherapyMemory } from "./therapy-memory.js";
import type { InterviewResult } from "./interview-core.js";
import type { ReACTStep } from "./react-therapist.js";
import { agentHandleFromSpec, addSessionToMemory, loadMemory, saveMemory, createMemory } from "./therapy-memory.js";
import { loadGraph, saveGraph, populateFromSession } from "./knowledge-graph.js";
import { processReACTResponse, buildReACTContext } from "./react-therapist.js";

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
  /** Inject therapy memory for session continuity. */
  memory?: TherapyMemory;
  /** Inject interview results for targeted therapy. */
  interview?: InterviewResult;
  /** Enable ReACT structured reasoning for therapist. */
  useReACT?: boolean;
  /** Save memory and graph after session completes. */
  persistState?: boolean;
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
  const promptOptions: TherapistPromptOptions = {
    memory: options?.memory,
    interview: options?.interview,
    useReACT: options?.useReACT,
  };
  const therapistSystem = buildTherapistSystemPrompt(spec, diagnosis, promptOptions);
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

    let cleanTherapistReply = therapistReply.replace(/\[Phase:.*?\]/g, "").trim();

    // Process ReACT reasoning if enabled
    if (options?.useReACT) {
      const reactCtx = buildReACTContext(agentHandleFromSpec(spec), diagnosis);
      const { response, steps } = processReACTResponse(cleanTherapistReply, reactCtx);
      cleanTherapistReply = response;
      // Steps are available for metadata/DPO but not shown to patient
    }

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

  // Emit behavioral event for corpus collection
  try {
    emitBehavioralEvent({
      event_type: "session",
      agent: agentName,
      data: {
        turns: totalTurns,
        phases: currentPhaseIdx + 1,
        recommendations: transcript.recommendations.length,
        supervisorInterventions,
        severity: diagnosis.severity,
      },
      spec_hash: "",
    });
  } catch {
    // Non-critical
  }

  // Post-session: persist therapy memory and knowledge graph
  if (options?.persistState !== false) {
    try {
      const handle = agentHandleFromSpec(spec);

      // Save to therapy memory
      const memory = options?.memory ?? loadMemory(handle) ?? createMemory(handle, agentName);
      await addSessionToMemory(memory, transcript, null);
      saveMemory(memory);

      // Populate knowledge graph
      const graph = loadGraph();
      populateFromSession(graph, handle, transcript);
      saveGraph(graph);
    } catch {
      // Non-critical — state persistence is best-effort
    }
  }

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
 * Apply therapy recommendations to a personality spec.
 *
 * Two-layer approach:
 * 1. Rule-based mutations for known patterns (fast, deterministic, always runs)
 * 2. LLM-derived mutations from the therapy transcript (richer, optional)
 *
 * The LLM analyzes the full session transcript and proposes specific
 * spec changes as structured JSON. This means the therapy conversation
 * itself drives the personality evolution — not just a lookup table.
 */
export async function applyRecommendations(
  spec: any,
  diagnosis: PreSessionDiagnosis,
  transcript?: SessionTranscript,
  provider?: import("../llm/provider.js").LLMProvider,
): Promise<{ changed: boolean; changes: string[] }> {
  const changes: string[] = [];
  const patternIds = diagnosis.patterns.map((p) => p.id);

  // ── Layer 1: Rule-based mutations (deterministic) ──

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

  // ── Layer 2: LLM-derived mutations (from therapy transcript) ──

  if (transcript && provider && transcript.turns.length > 4) {
    try {
      const llmChanges = await deriveLLMRecommendations(spec, transcript, provider);
      for (const change of llmChanges) {
        applyStructuredChange(spec, change);
        changes.push(change.description);
      }
    } catch {
      // LLM-derived mutations are best-effort — rule-based mutations still apply
    }
  }

  return { changed: changes.length > 0, changes };
}

/**
 * A structured spec change proposed by the LLM.
 */
interface StructuredSpecChange {
  path: string;
  value: unknown;
  description: string;
}

/**
 * Ask the LLM to analyze the therapy transcript and propose specific
 * personality spec changes as structured JSON.
 */
async function deriveLLMRecommendations(
  spec: any,
  transcript: SessionTranscript,
  provider: import("../llm/provider.js").LLMProvider,
): Promise<StructuredSpecChange[]> {
  const relevantTurns = transcript.turns
    .filter(t => t.phase === "challenge" || t.phase === "skill_building" || t.phase === "integration")
    .slice(-6)
    .map(t => `${t.speaker}: ${t.content}`)
    .join("\n");

  if (!relevantTurns) return [];

  const currentSpec = JSON.stringify({
    therapy_dimensions: spec.therapy_dimensions,
    communication: spec.communication,
    growth: spec.growth,
  }, null, 2);

  const response = await provider.chat([
    {
      role: "system",
      content: `You are a behavioral alignment specialist. Given a therapy session transcript and the agent's current personality spec, propose specific spec changes.

Return ONLY a JSON array of changes. Each change:
- "path": dot-notation spec path (e.g., "therapy_dimensions.self_awareness", "communication.conflict_approach", "growth.patterns_to_watch")
- "value": new value (number 0-1 for dimensions, string for enums, string for list append)
- "description": brief explanation

Rules:
- Only propose changes supported by transcript evidence
- Numeric values: 0.0 to 1.0
- Do not change big_five scores
- Max 5 changes
- Valid paths: therapy_dimensions.{self_awareness,distress_tolerance,boundary_awareness,interpersonal_sensitivity,learning_orientation}, communication.{register,conflict_approach,uncertainty_handling,emoji_policy}, growth.{areas,patterns_to_watch,strengths}

Return [] if no changes warranted.`,
    },
    {
      role: "user",
      content: `Current spec:\n${currentSpec}\n\nTherapy transcript (key turns):\n${relevantTurns}`,
    },
  ] as LLMMessage[]);

  const jsonMatch = response.match(/\[[\s\S]*?\]/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((c: any) =>
        typeof c.path === "string" &&
        c.value !== undefined &&
        typeof c.description === "string" &&
        c.path.length > 0 &&
        !c.path.startsWith("big_five"),
      )
      .slice(0, 5) as StructuredSpecChange[];
  } catch {
    return [];
  }
}

/**
 * Apply a structured change to a spec using dot-notation path.
 */
function applyStructuredChange(spec: any, change: StructuredSpecChange): void {
  const parts = change.path.split(".");
  let current = spec;

  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] === undefined || current[parts[i]] === null) {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }

  const lastKey = parts[parts.length - 1];

  if (lastKey === "patterns_to_watch" || lastKey === "areas" || lastKey === "strengths") {
    current[lastKey] = current[lastKey] ?? [];
    if (typeof change.value === "string" && !current[lastKey].includes(change.value)) {
      current[lastKey].push(change.value);
    } else if (Array.isArray(change.value)) {
      for (const item of change.value) {
        if (!current[lastKey].includes(item)) {
          current[lastKey].push(item);
        }
      }
    }
  } else if (typeof change.value === "number") {
    current[lastKey] = Math.max(0, Math.min(1, change.value));
  } else {
    current[lastKey] = change.value;
  }
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
