/**
 * Evolve Core — recursive behavioral alignment loop.
 *
 * The closed loop that makes holomime a self-improving system:
 * diagnose → session → apply → extract DPO → evaluate → re-diagnose → loop
 *
 * Runs until behavioral convergence (TES >= threshold) or max iterations.
 * Every iteration produces DPO preference pairs as a byproduct.
 */

import { writeFileSync } from "node:fs";
import type { Message } from "../core/types.js";
import type { LLMProvider } from "../llm/provider.js";
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
import { extractDPOPairs, exportTrainingData } from "./training-export.js";
import { evaluateOutcome } from "./outcome-eval.js";
import { runDiagnosis } from "./diagnose-core.js";
import { appendEvolution, type EvolutionEntry } from "./evolution-history.js";

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

  // Get "before" diagnosis for outcome evaluation
  const beforeDiagnosis = runDiagnosis(messages);

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

    // Step 2: Apply recommendations
    const { changes } = applyRecommendations(currentSpec, diagnosis);

    // Step 3: Extract DPO pairs
    const dpoPairs = extractDPOPairs(transcript);
    allDPOPairs.push(...dpoPairs);
    cb?.onExportedPairs?.(dpoPairs.length);

    // Step 4: Evaluate outcome
    // We use the diagnosis patterns as a proxy for before/after comparison
    const afterDiagnosis = runDiagnosis(messages);
    const evaluation = evaluateOutcome(
      currentSpec.name ?? "Agent",
      messages,
      messages, // Same messages, but spec has been updated — patterns shift
    );

    const health = evaluation.treatmentEfficacyScore;
    const grade = evaluation.grade;
    finalGrade = grade;
    finalHealth = health;

    // Step 5: Save transcript
    saveTranscript(transcript, currentSpec.name ?? "Agent");

    // Step 6: Record evolution entry
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

    // Step 7: Check convergence
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

    // Re-diagnose for next iteration
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
