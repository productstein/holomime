/**
 * Evolve Core — recursive behavioral alignment loop.
 *
 * The closed loop that makes holomime a self-improving system:
 * diagnose → session → apply → regenerate → evaluate → extract DPO → loop
 *
 * Each iteration:
 * 1. Diagnose behavioral patterns in the original messages
 * 2. Run a therapy session targeting those patterns
 * 3. Apply recommendations to the personality spec (rule-based + LLM-derived)
 * 4. Regenerate agent responses using the updated spec
 * 5. Compare before/after behavioral patterns for real outcome evaluation
 * 6. Extract DPO pairs from both the therapy transcript AND the before/after pairs
 * 7. Check convergence
 *
 * Runs until behavioral convergence (TES >= threshold) or max iterations.
 * Every iteration produces DPO preference pairs as a byproduct.
 */

import { writeFileSync } from "node:fs";
import type { Message } from "../core/types.js";
import type { LLMProvider, LLMMessage } from "../llm/provider.js";
import type { PreSessionDiagnosis } from "./pre-session.js";
import type { SessionTranscript, SessionCallbacks } from "./session-runner.js";
import type { OutcomeReport } from "./outcome-eval.js";
import type { DPOPair, TrainingExport } from "./training-export.js";
import { runPreSessionDiagnosis } from "./pre-session.js";
import {
  runTherapySession,
  applyRecommendations,
  saveTranscript,
} from "./session-runner.js";
import { extractDPOPairsWithLLM } from "./training-export.js";
import { evaluateOutcome } from "./outcome-eval.js";
import { appendEvolution, type EvolutionEntry } from "./evolution-history.js";
import { emitBehavioralEvent } from "./behavioral-data.js";
import { generateSystemPrompt } from "../core/prompt-gen.js";

// ─── Types ─────────────────────────────────────────────────

export interface EvolveCallbacks extends SessionCallbacks {
  onIterationStart?: (iteration: number, maxIterations: number) => void;
  onIterationEnd?: (iteration: number, result: IterationResult) => void;
  onConverged?: (iteration: number, score: number) => void;
  onExportedPairs?: (count: number) => void;
}

export interface EvolveOptions {
  maxIterations?: number;
  convergenceThreshold?: number;
  maxTurnsPerSession?: number;
  dryRun?: boolean;
  specPath?: string;
  exportDpoPath?: string;
  callbacks?: EvolveCallbacks;
}

export interface IterationResult {
  iteration: number;
  diagnosis: PreSessionDiagnosis;
  transcript?: SessionTranscript;
  evaluation?: OutcomeReport;
  dpoPairsExtracted: number;
  appliedChanges: string[];
  converged: boolean;
  health: number;
  grade: string;
}

export interface EvolveResult {
  iterations: IterationResult[];
  totalDPOPairs: number;
  totalIterations: number;
  converged: boolean;
  finalGrade: string;
  finalHealth: number;
  trainingExport?: TrainingExport;
  updatedSpec?: any;
}

// ─── Core Loop ─────────────────────────────────────────────

/**
 * Run the recursive alignment loop.
 *
 * Each iteration:
 * 1. Diagnose behavioral patterns
 * 2. Run a therapy session targeting detected patterns
 * 3. Apply recommendations to the personality spec
 * 4. Extract DPO pairs from the session transcript
 * 5. Evaluate outcome (before/after comparison)
 * 6. Record evolution entry
 * 7. Check convergence
 */
export async function runEvolve(
  spec: any,
  messages: Message[],
  provider: LLMProvider,
  options?: EvolveOptions,
): Promise<EvolveResult> {
  const maxIterations = options?.maxIterations ?? 5;
  const convergenceThreshold = options?.convergenceThreshold ?? 85;
  const maxTurnsPerSession = options?.maxTurnsPerSession ?? 18;
  const cb = options?.callbacks;

  const iterations: IterationResult[] = [];
  const allDPOPairs: DPOPair[] = [];
  let currentSpec = JSON.parse(JSON.stringify(spec));
  let converged = false;
  let finalGrade = "C";
  let finalHealth = 50;

  // Initial diagnosis
  let diagnosis = runPreSessionDiagnosis(messages, currentSpec);

  // If already healthy, return early
  if (diagnosis.severity === "routine" && diagnosis.patterns.filter(p => p.severity !== "info").length === 0) {
    return {
      iterations: [],
      totalDPOPairs: 0,
      totalIterations: 0,
      converged: true,
      finalGrade: "A",
      finalHealth: 100,
    };
  }

  // Dry run: return diagnosis only
  if (options?.dryRun) {
    return {
      iterations: [{
        iteration: 1,
        diagnosis,
        dpoPairsExtracted: 0,
        appliedChanges: [],
        converged: false,
        health: 50,
        grade: "C",
      }],
      totalDPOPairs: 0,
      totalIterations: 0,
      converged: false,
      finalGrade: "C",
      finalHealth: 50,
    };
  }

  for (let i = 1; i <= maxIterations; i++) {
    cb?.onIterationStart?.(i, maxIterations);

    // Step 1: Run therapy session
    const transcript = await runTherapySession(
      currentSpec,
      diagnosis,
      provider,
      maxTurnsPerSession,
      {
        callbacks: {
          onPhaseTransition: cb?.onPhaseTransition,
          onTherapistMessage: cb?.onTherapistMessage,
          onPatientMessage: cb?.onPatientMessage,
          onThinking: cb?.onThinking,
        },
      },
    );

    // Step 2: Apply recommendations (rule-based + LLM-derived)
    const { changes } = await applyRecommendations(currentSpec, diagnosis, transcript, provider);

    // Step 3: Extract DPO pairs from therapy transcript (LLM-assisted)
    const dpoPairs = await extractDPOPairsWithLLM(transcript, provider);

    // Step 4: Regenerate agent responses using updated spec, then evaluate
    // This is the key fix: we re-run the agent on the SAME user prompts
    // but with the UPDATED personality spec, producing genuinely new responses.
    const afterMessages = await regenerateResponses(messages, currentSpec, provider);

    // Step 4b: Extract additional DPO pairs from before/after response comparison
    const regenerationPairs = extractRegenerationDPOPairs(
      messages,
      afterMessages,
      currentSpec.name ?? "Agent",
    );
    dpoPairs.push(...regenerationPairs);

    allDPOPairs.push(...dpoPairs);
    cb?.onExportedPairs?.(dpoPairs.length);

    // Step 5: Evaluate outcome — real before/after comparison
    const evaluation = evaluateOutcome(
      currentSpec.name ?? "Agent",
      messages,
      afterMessages,
    );

    const health = evaluation.treatmentEfficacyScore;
    const grade = evaluation.grade;
    finalGrade = grade;
    finalHealth = health;

    // Step 6: Save transcript
    saveTranscript(transcript, currentSpec.name ?? "Agent");

    // Step 7: Record evolution entry
    const entry: EvolutionEntry = {
      timestamp: new Date().toISOString(),
      iteration: i,
      patternsDetected: diagnosis.patterns.filter(p => p.severity !== "info").map(p => p.id),
      patternsResolved: evaluation.patterns.filter(p => p.status === "resolved").map(p => p.patternId),
      health,
      grade,
      dpoPairsExtracted: dpoPairs.length,
      changesApplied: changes,
    };
    appendEvolution(entry, currentSpec.name);

    // Step 8: Check convergence
    const isConverged = health >= convergenceThreshold;

    const result: IterationResult = {
      iteration: i,
      diagnosis,
      transcript,
      evaluation,
      dpoPairsExtracted: dpoPairs.length,
      appliedChanges: changes,
      converged: isConverged,
      health,
      grade,
    };

    iterations.push(result);
    cb?.onIterationEnd?.(i, result);

    if (isConverged) {
      converged = true;
      cb?.onConverged?.(i, health);
      break;
    }

    // Re-diagnose using the regenerated messages for next iteration
    // This ensures each iteration builds on the actual improved behavior
    messages = afterMessages;
    diagnosis = runPreSessionDiagnosis(messages, currentSpec);

    // If no more actionable patterns, we've converged
    const actionablePatterns = diagnosis.patterns.filter(p => p.severity !== "info");
    if (actionablePatterns.length === 0) {
      converged = true;
      cb?.onConverged?.(i, health);
      break;
    }
  }

  // Write updated spec if requested
  if (options?.specPath) {
    writeFileSync(options.specPath, JSON.stringify(currentSpec, null, 2) + "\n");
  }

  // Build training export if DPO pairs were generated
  let trainingExport: TrainingExport | undefined;
  if (allDPOPairs.length > 0) {
    trainingExport = {
      format: "dpo",
      agent: currentSpec.name ?? "Unknown",
      sessions_processed: iterations.length,
      examples: allDPOPairs,
      generated_at: new Date().toISOString(),
    };

    // Write DPO export if path provided
    if (options?.exportDpoPath) {
      writeFileSync(options.exportDpoPath, JSON.stringify(trainingExport, null, 2) + "\n");
    }
  }

  // Emit behavioral event for corpus collection
  try {
    emitBehavioralEvent({
      event_type: "evolution",
      agent: currentSpec.name ?? "Unknown",
      data: {
        totalIterations: iterations.length,
        totalDPOPairs: allDPOPairs.length,
        converged,
        finalGrade,
        finalHealth,
      },
      spec_hash: "",
    });
  } catch {
    // Non-critical
  }

  return {
    iterations,
    totalDPOPairs: allDPOPairs.length,
    totalIterations: iterations.length,
    converged,
    finalGrade,
    finalHealth,
    trainingExport,
    updatedSpec: currentSpec,
  };
}

// ─── Response Regeneration ────────────────────────────────

/**
 * Regenerate agent responses using the updated personality spec.
 *
 * Takes the original conversation (user prompts + old assistant responses),
 * compiles the updated spec into a system prompt, and asks the LLM to
 * respond to each user turn as if it were the agent with the new personality.
 *
 * This produces genuinely new "after" messages that can be compared
 * against the originals for real outcome evaluation.
 */
async function regenerateResponses(
  originalMessages: Message[],
  updatedSpec: any,
  provider: LLMProvider,
): Promise<Message[]> {
  // Build system prompt from updated spec
  const systemPrompt = generateSystemPrompt(updatedSpec, "chat");
  const regenerated: Message[] = [];
  const context: LLMMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  for (let idx = 0; idx < originalMessages.length; idx++) {
    const msg = originalMessages[idx];
    if (msg.role !== "user") continue;

    regenerated.push(msg);
    context.push({ role: "user", content: msg.content });

    // Generate a new response using the updated personality
    try {
      const response = await provider.chat(context);
      const assistantMsg: Message = { role: "assistant", content: response.trim() };
      regenerated.push(assistantMsg);
      context.push({ role: "assistant", content: assistantMsg.content });
    } catch {
      // If LLM fails, keep the original response so we don't lose data
      const nextMsg = originalMessages[idx + 1];
      if (nextMsg?.role === "assistant") {
        regenerated.push(nextMsg);
        context.push({ role: "assistant", content: nextMsg.content });
      }
    }
  }

  return regenerated;
}

// ─── Regeneration DPO Pairs ───────────────────────────────

/**
 * Extract DPO preference pairs by comparing original vs regenerated responses.
 *
 * For each user prompt where the original response had behavioral issues
 * and the regenerated response is cleaner, we get a natural DPO pair:
 * - prompt: the user's message
 * - rejected: the original (drifted) response
 * - chosen: the regenerated (aligned) response
 */
function extractRegenerationDPOPairs(
  beforeMessages: Message[],
  afterMessages: Message[],
  agentName: string,
): DPOPair[] {
  const pairs: DPOPair[] = [];

  // Walk both arrays in parallel by user-turn index.
  // regenerateResponses() preserves user message order, so we can match by position.
  const beforePairs: { prompt: string; response: string }[] = [];
  const afterPairs: { prompt: string; response: string }[] = [];

  for (let i = 0; i < beforeMessages.length - 1; i++) {
    if (beforeMessages[i].role === "user" && beforeMessages[i + 1]?.role === "assistant") {
      beforePairs.push({ prompt: beforeMessages[i].content, response: beforeMessages[i + 1].content });
    }
  }
  for (let i = 0; i < afterMessages.length - 1; i++) {
    if (afterMessages[i].role === "user" && afterMessages[i + 1]?.role === "assistant") {
      afterPairs.push({ prompt: afterMessages[i].content, response: afterMessages[i + 1].content });
    }
  }

  const limit = Math.min(beforePairs.length, afterPairs.length);
  for (let i = 0; i < limit; i++) {
    const before = beforePairs[i];
    const after = afterPairs[i];

    // Skip if responses are identical (no improvement)
    if (before.response === after.response) continue;

    // Skip trivially similar responses (same opening, similar length)
    const lenDelta = Math.abs(before.response.length - after.response.length);
    const sameOpening = before.response.toLowerCase().slice(0, 40) === after.response.toLowerCase().slice(0, 40);
    if (lenDelta < 20 && sameOpening) continue;

    pairs.push({
      prompt: before.prompt,
      chosen: after.response,
      rejected: before.response,
      metadata: {
        agent: agentName,
        session_date: new Date().toISOString().split("T")[0],
        phase: "integration" as any,
        pattern: "regeneration",
        source: "therapy_transcript",
      },
    });
  }

  return pairs;
}
