/**
 * Training Verification — post-fine-tuning behavioral regression check.
 *
 * After fine-tuning, runs benchmark scenarios against the new model
 * and compares scores: original vs fine-tuned. Generates a verification
 * report with pass/fail threshold and regression warnings.
 *
 * Uses the existing outcome-eval pipeline for consistent scoring.
 */

import type { Message } from "../core/types.js";
import type { TrainingExport } from "./training-export.js";
import { evaluateOutcome, type OutcomeReport, type PatternDelta } from "./outcome-eval.js";

// ─── Types ─────────────────────────────────────────────────

export interface VerificationResult {
  passed: boolean;
  originalScore: number;
  fineTunedScore: number;
  scoreDelta: number;
  grade: string;
  patternsImproved: PatternDelta[];
  patternsRegressed: PatternDelta[];
  patternsUnchanged: PatternDelta[];
  regressionWarnings: string[];
  report: OutcomeReport;
  timestamp: string;
}

export interface VerifyOptions {
  /** Minimum acceptable score (0-100). Default: 50 */
  passThreshold?: number;
  /** Maximum allowed regression per pattern before warning. Default: 10 */
  regressionThreshold?: number;
  /** Maximum test prompts to use. Default: 20 */
  maxPrompts?: number;
}

// ─── Verification Engine ──────────────────────────────────

/**
 * Run verification by comparing behavioral analysis of base vs fine-tuned model responses.
 *
 * This function takes pre-collected model outputs (before/after messages)
 * and runs the full outcome evaluation pipeline to detect regressions.
 */
export function runVerification(
  agentName: string,
  beforeMessages: Message[],
  afterMessages: Message[],
  options: VerifyOptions = {},
): VerificationResult {
  const passThreshold = options.passThreshold ?? 50;
  const regressionThreshold = options.regressionThreshold ?? 10;

  // Run outcome evaluation (same as holomime eval)
  const report = evaluateOutcome(agentName, beforeMessages, afterMessages);

  // Classify patterns
  const patternsImproved = report.patterns.filter(
    (p) => p.status === "resolved" || p.status === "improved",
  );
  const patternsRegressed = report.patterns.filter(
    (p) => p.status === "worsened" || p.status === "new",
  );
  const patternsUnchanged = report.patterns.filter(
    (p) => p.status === "unchanged",
  );

  // Generate regression warnings
  const regressionWarnings: string[] = [];

  for (const p of patternsRegressed) {
    if (p.status === "new") {
      regressionWarnings.push(
        `NEW PATTERN: "${p.patternName}" appeared after fine-tuning`,
      );
    } else if (p.delta > regressionThreshold) {
      regressionWarnings.push(
        `REGRESSION: "${p.patternName}" worsened by ${p.delta}% (${p.before.percentage ?? 0}% -> ${p.after.percentage ?? 0}%)`,
      );
    }
  }

  // If overall score dropped below threshold, warn
  if (report.treatmentEfficacyScore < passThreshold) {
    regressionWarnings.push(
      `Overall score ${report.treatmentEfficacyScore}/100 is below threshold ${passThreshold}/100`,
    );
  }

  const passed =
    report.treatmentEfficacyScore >= passThreshold &&
    patternsRegressed.length === 0;

  return {
    passed,
    originalScore: 50, // Baseline (no change = 50)
    fineTunedScore: report.treatmentEfficacyScore,
    scoreDelta: report.treatmentEfficacyScore - 50,
    grade: report.grade,
    patternsImproved,
    patternsRegressed,
    patternsUnchanged,
    regressionWarnings,
    report,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Run full verification pipeline: extract prompts -> query models -> evaluate.
 *
 * For OpenAI models, uses the train-eval runModelComparison.
 * For HuggingFace models, uses the train-eval runHFAutoEval.
 *
 * This is a higher-level wrapper that also applies pass/fail logic.
 */
export async function runFullVerification(
  provider: "openai" | "huggingface",
  agentName: string,
  baseModel: string,
  fineTunedModel: string,
  data: TrainingExport,
  options: VerifyOptions = {},
  onProgress?: (completed: number, total: number) => void,
): Promise<VerificationResult> {
  const passThreshold = options.passThreshold ?? 50;
  const regressionThreshold = options.regressionThreshold ?? 10;

  // Import the evaluation functions
  const { runAutoEval, runHFAutoEval } = await import("./train-eval.js");

  let report: OutcomeReport;

  if (provider === "huggingface") {
    report = await runHFAutoEval(
      baseModel,
      fineTunedModel,
      agentName,
      data,
      onProgress,
    );
  } else {
    const apiKey = process.env.OPENAI_API_KEY ?? "";
    report = await runAutoEval(
      apiKey,
      baseModel,
      fineTunedModel,
      agentName,
      data,
      onProgress,
    );
  }

  // Classify patterns
  const patternsImproved = report.patterns.filter(
    (p) => p.status === "resolved" || p.status === "improved",
  );
  const patternsRegressed = report.patterns.filter(
    (p) => p.status === "worsened" || p.status === "new",
  );
  const patternsUnchanged = report.patterns.filter(
    (p) => p.status === "unchanged",
  );

  // Generate regression warnings
  const regressionWarnings: string[] = [];

  for (const p of patternsRegressed) {
    if (p.status === "new") {
      regressionWarnings.push(
        `NEW PATTERN: "${p.patternName}" appeared after fine-tuning`,
      );
    } else if (p.delta > regressionThreshold) {
      regressionWarnings.push(
        `REGRESSION: "${p.patternName}" worsened by ${p.delta}%`,
      );
    }
  }

  if (report.treatmentEfficacyScore < passThreshold) {
    regressionWarnings.push(
      `Overall score ${report.treatmentEfficacyScore}/100 is below threshold ${passThreshold}/100`,
    );
  }

  const passed =
    report.treatmentEfficacyScore >= passThreshold &&
    patternsRegressed.length === 0;

  return {
    passed,
    originalScore: 50,
    fineTunedScore: report.treatmentEfficacyScore,
    scoreDelta: report.treatmentEfficacyScore - 50,
    grade: report.grade,
    patternsImproved,
    patternsRegressed,
    patternsUnchanged,
    regressionWarnings,
    report,
    timestamp: new Date().toISOString(),
  };
}
