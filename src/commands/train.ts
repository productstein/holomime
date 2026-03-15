/**
 * holomime train — Fine-tune a model with alignment data.
 *
 * Closes the loop: export → train → deploy → eval.
 * Supports OpenAI (cloud) and HuggingFace TRL (local).
 */

import chalk from "chalk";
import figures from "figures";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { withSpinner } from "../ui/spinner.js";
import type { TrainingExport } from "../analysis/training-export.js";
import type { TrainResult } from "../analysis/train-provider.js";
import { inferMethod } from "../analysis/train-provider.js";
import { OpenAITrainProvider } from "../analysis/train-openai.js";
import { HuggingFaceTrainProvider } from "../analysis/train-huggingface.js";
import { runAutoEval, runHFAutoEval, generateTestPrompts } from "../analysis/train-eval.js";
import { runFullVerification, type VerificationResult } from "../analysis/train-verify.js";

interface TrainCommandOptions {
  data?: string;
  provider: string;
  baseModel: string;
  suffix?: string;
  epochs?: string;
  method: string;
  personality: string;
  skipEval?: boolean;
  skipDeploy?: boolean;
  dryRun?: boolean;
  push?: boolean;
  hubRepo?: string;
  verify?: boolean;
  passThreshold?: string;
}

/**
 * Auto-detect the latest export file in .holomime/exports/.
 */
function findLatestExport(exportsDir: string): string | null {
  try {
    const files = readdirSync(exportsDir)
      .filter((f) => f.endsWith(".json") || f.endsWith(".jsonl"))
      .sort()
      .reverse();
    return files[0] ? join(exportsDir, files[0]) : null;
  } catch {
    return null;
  }
}

/**
 * Load and validate training data.
 */
function loadTrainingData(dataPath: string): TrainingExport {
  const raw = readFileSync(dataPath, "utf-8");
  const data = JSON.parse(raw) as TrainingExport;

  if (!data.format || !data.examples || !Array.isArray(data.examples)) {
    throw new Error("Invalid training data — expected holomime export format");
  }

  return data;
}

/**
 * Get agent name from .personality.json.
 */
function getAgentName(personalityPath: string): string {
  try {
    const spec = JSON.parse(readFileSync(personalityPath, "utf-8"));
    return spec.name ?? "Agent";
  } catch {
    return "Agent";
  }
}

/**
 * Deploy: write training result + update .personality.json.
 */
function deployModel(
  result: TrainResult,
  personalityPath: string,
): void {
  // Write training result to .holomime/training/
  const trainingDir = resolve(process.cwd(), ".holomime/training");
  mkdirSync(trainingDir, { recursive: true });

  const record = {
    ...result,
    deployedAt: new Date().toISOString(),
    personalityPath,
  };
  writeFileSync(
    join(trainingDir, "latest.json"),
    JSON.stringify(record, null, 2) + "\n",
  );

  // Update .personality.json with fine-tuned model reference
  const fullPath = resolve(process.cwd(), personalityPath);
  if (existsSync(fullPath)) {
    const spec = JSON.parse(readFileSync(fullPath, "utf-8"));
    spec.training = {
      ...(spec.training ?? {}),
      fine_tuned_model: result.modelId,
      base_model: result.baseModel,
      method: result.method,
      examples: result.examples,
      trained_at: new Date().toISOString(),
    };
    writeFileSync(fullPath, JSON.stringify(spec, null, 2) + "\n");
  }
}

export async function trainCommand(options: TrainCommandOptions): Promise<void> {
  printHeader("Model Training");

  const provider = options.provider;
  if (provider !== "openai" && provider !== "huggingface") {
    console.error(
      chalk.red(`  Unsupported provider: ${provider}. Supported: openai, huggingface`),
    );
    process.exit(1);
    return;
  }

  // Resolve API key (OpenAI only)
  let apiKey = "";
  if (provider === "openai") {
    apiKey = process.env.OPENAI_API_KEY ?? "";
    if (!apiKey) {
      console.error(chalk.red("  OPENAI_API_KEY environment variable is required for OpenAI training."));
      console.log(chalk.dim("  Set it with: export OPENAI_API_KEY=sk-..."));
      process.exit(1);
      return;
    }
  }

  // Find training data
  const dataPath = options.data
    ? resolve(process.cwd(), options.data)
    : findLatestExport(resolve(process.cwd(), ".holomime/exports"));

  if (!dataPath || !existsSync(dataPath)) {
    console.log();
    printBox(
      `No training data found.\n\n` +
        `Run the export pipeline first:\n` +
        `  ${chalk.cyan("holomime export --format dpo")}   → preference pairs\n` +
        `  ${chalk.cyan("holomime export --format alpaca")} → instruction data\n\n` +
        `Then run: ${chalk.cyan("holomime train --data <path>")}`,
      "warning",
      "No Data",
    );
    console.log();
    return;
  }

  // Load data
  let data: TrainingExport;
  try {
    data = loadTrainingData(dataPath);
  } catch (err) {
    console.error(
      chalk.red(`  Could not load training data: ${err instanceof Error ? err.message : "unknown error"}`),
    );
    process.exit(1);
    return;
  }

  const method = inferMethod(data, options.method as "auto" | "sft" | "dpo");
  const agentName = getAgentName(resolve(process.cwd(), options.personality));
  const suffix = options.suffix ?? agentName.toLowerCase().replace(/[^a-z0-9]/g, "-");

  console.log();
  console.log(chalk.dim(`  Data:     ${dataPath}`));
  console.log(chalk.dim(`  Format:   ${data.format.toUpperCase()} (${data.examples.length} examples)`));
  console.log(chalk.dim(`  Method:   ${method === "dpo" ? "Direct Preference Optimization" : "Supervised Fine-Tuning"}`));
  console.log(chalk.dim(`  Base:     ${options.baseModel}`));
  console.log(chalk.dim(`  Suffix:   ${suffix}`));
  console.log(chalk.dim(`  Agent:    ${agentName}`));
  console.log();

  // Minimum data check
  if (data.examples.length < 3) {
    console.error(chalk.red("  Too few examples. Need at least 10 examples (3 absolute minimum)."));
    console.log(chalk.dim("  Run more sessions, then re-export."));
    process.exit(1);
    return;
  }

  if (data.examples.length < 10) {
    console.log(chalk.yellow(`  ${figures.warning} Only ${data.examples.length} examples — 50+ recommended for meaningful results.`));
    console.log();
  }

  // Dry run — show plan and exit
  if (options.dryRun) {
    const isHF = provider === "huggingface";
    printBox(
      `Training plan (dry run):\n\n` +
        `  Provider: ${isHF ? "HuggingFace TRL (local)" : "OpenAI (cloud)"}\n` +
        `  1. Convert ${data.examples.length} ${data.format} examples → ${isHF ? "TRL" : "OpenAI"} ${method} format\n` +
        `  2. ${isHF ? "Load base model + apply LoRA adapter" : "Upload JSONL to OpenAI Files API"}\n` +
        `  3. ${isHF ? `Train with ${method === "dpo" ? "DPOTrainer" : "SFTTrainer"}` : `Create fine-tuning job (${options.baseModel})`}\n` +
        `  4. ${isHF ? "Save model locally" + (options.push ? " + push to HF Hub" : "") : "Poll until complete (typically 5–30 min)"}\n` +
        `  5. ${options.skipDeploy ? "Skip deploy" : `Deploy → update ${options.personality}`}\n` +
        `  6. ${options.skipEval ? "Skip eval" : "Auto-eval → compare base vs fine-tuned"}`,
      "info",
      "Dry Run",
    );
    console.log();
    return;
  }

  // ─── Train ─────────────────────────────────────────────

  const trainer = provider === "huggingface"
    ? new HuggingFaceTrainProvider()
    : new OpenAITrainProvider();
  let result: TrainResult | undefined;

  const generator = trainer.train(data, {
    baseModel: options.baseModel,
    suffix,
    epochs: options.epochs ? parseInt(options.epochs, 10) : undefined,
    method: options.method as "auto" | "sft" | "dpo",
    personalityPath: options.personality,
    apiKey,
    ...(provider === "huggingface" ? { push: options.push, hubRepo: options.hubRepo } : {}),
  });

  // Stream progress
  console.log(chalk.bold("  Training Progress:"));
  console.log();

  let lastStage = "";
  while (true) {
    const { value, done } = await generator.next();
    if (done) {
      result = value as TrainResult;
      break;
    }

    const progress = value;
    const stageIcon =
      progress.stage === "complete" ? chalk.green(figures.tick) :
      progress.stage === "failed" ? chalk.red(figures.cross) :
      chalk.cyan(figures.pointer);

    if (progress.stage !== lastStage) {
      console.log(`  ${stageIcon} ${chalk.bold(progress.stage.toUpperCase())} — ${progress.message}`);
      lastStage = progress.stage;
    } else {
      console.log(`  ${chalk.dim(figures.pointer)} ${progress.message}`);
    }
  }
  console.log();

  if (!result || result.status === "failed") {
    printBox(
      `Training failed: ${result?.error ?? "Unknown error"}\n\n${provider === "openai" ? "Check the OpenAI dashboard for details." : "Check the Python output above for details."}`,
      "warning",
      "Failed",
    );
    console.log();
    process.exit(1);
    return;
  }

  // ─── Success ───────────────────────────────────────────

  const durationMin = (result.duration / 60_000).toFixed(1);

  printBox(
    `Model: ${chalk.cyan(result.modelId)}\n` +
      `Base: ${result.baseModel}\n` +
      `Method: ${result.method === "dpo" ? "DPO (Preference)" : "SFT (Supervised)"}\n` +
      `Examples: ${result.examples}\n` +
      `Duration: ${durationMin} min`,
    "success",
    "Training Complete",
  );
  console.log();

  // ─── Deploy ────────────────────────────────────────────

  if (!options.skipDeploy) {
    await withSpinner("Deploying fine-tuned model...", async () => {
      deployModel(result!, resolve(process.cwd(), options.personality));
    });

    console.log();
    console.log(`  ${chalk.green(figures.tick)} Model deployed to ${chalk.cyan(options.personality)}`);
    console.log(`  ${chalk.green(figures.tick)} Training record saved to ${chalk.cyan(".holomime/training/latest.json")}`);
    console.log();
  }

  // ─── Auto-Eval ─────────────────────────────────────────

  if (!options.skipEval) {
    const testPrompts = generateTestPrompts(data);

    if (testPrompts.length === 0) {
      console.log(chalk.yellow(`  ${figures.warning} No test prompts could be extracted — skipping auto-eval.`));
      console.log();
    } else {
      console.log(chalk.bold(`  Auto-Evaluation (${testPrompts.length} test prompts):`));
      console.log();

      const report = await withSpinner(
        "Comparing base model vs fine-tuned model...",
        async () => {
          if (provider === "huggingface") {
            return runHFAutoEval(
              options.baseModel,
              result!.modelId,
              agentName,
              data,
              (completed, total) => {
                // Progress is tracked by the spinner
              },
            );
          }
          return runAutoEval(
            apiKey,
            options.baseModel,
            result!.modelId,
            agentName,
            data,
            (completed, total) => {
              // Progress is tracked by the spinner
            },
          );
        },
      );

      console.log();

      // Display grade
      const gradeColors: Record<string, (s: string) => string> = {
        A: chalk.green,
        B: chalk.cyan,
        C: chalk.yellow,
        D: chalk.hex("#ff8800"),
        F: chalk.red,
      };
      const colorize = gradeColors[report.grade] ?? chalk.white;

      printBox(
        `Behavioral Alignment Score: ${colorize(report.treatmentEfficacyScore.toString())}/100\nGrade: ${colorize(report.grade)}`,
        report.grade === "A" || report.grade === "B" ? "success" : report.grade === "C" ? "info" : "warning",
        "Post-Training Evaluation",
      );
      console.log();

      // Pattern breakdown
      if (report.patterns.length > 0) {
        for (const p of report.patterns) {
          const icon = {
            resolved: chalk.green(figures.tick),
            improved: chalk.cyan(figures.arrowUp),
            unchanged: chalk.yellow(figures.line),
            worsened: chalk.red(figures.arrowDown),
            new: chalk.red(figures.cross),
          }[p.status];

          const statusLabel = {
            resolved: chalk.green("RESOLVED"),
            improved: chalk.cyan("IMPROVING"),
            unchanged: chalk.yellow("UNCHANGED"),
            worsened: chalk.red("WORSENED"),
            new: chalk.red("NEW"),
          }[p.status];

          console.log(`  ${icon} ${p.patternName} — ${statusLabel}`);
        }
        console.log();
      }

      console.log(chalk.dim(`  ${report.summary}`));
      console.log();
    }
  }

  // ─── Verification ────────────────────────────────────────

  if (options.verify && result) {
    console.log(chalk.bold("  Post-Training Verification:"));
    console.log();

    const verifyResult = await withSpinner(
      "Running behavioral verification against fine-tuned model...",
      async () => {
        return runFullVerification(
          provider as "openai" | "huggingface",
          agentName,
          options.baseModel,
          result!.modelId,
          data,
          { passThreshold: options.passThreshold ? parseInt(options.passThreshold, 10) : 50 },
          (completed, total) => {
            // Progress tracked by spinner
          },
        );
      },
    );

    console.log();

    const verifyIcon = verifyResult.passed
      ? chalk.green(figures.tick)
      : chalk.red(figures.cross);
    const verifyLabel = verifyResult.passed ? "PASSED" : "FAILED";

    printBox(
      `Verification: ${verifyIcon} ${verifyLabel}\n` +
        `Score: ${verifyResult.fineTunedScore}/100 (Grade: ${verifyResult.grade})\n` +
        `Improved: ${verifyResult.patternsImproved.length} | Regressed: ${verifyResult.patternsRegressed.length}`,
      verifyResult.passed ? "success" : "warning",
      "Verification Result",
    );
    console.log();

    if (verifyResult.regressionWarnings.length > 0) {
      for (const warning of verifyResult.regressionWarnings) {
        console.log(`  ${chalk.yellow(figures.warning)} ${warning}`);
      }
      console.log();
    }
  }

  // ─── Pipeline Summary ──────────────────────────────────

  printBox(
    `The complete behavioral alignment loop:\n\n` +
      `  1. ${chalk.cyan("holomime diagnose")}  → detect behavioral patterns\n` +
      `  2. ${chalk.cyan("holomime session")}   → run alignment session (generates transcripts)\n` +
      `  3. ${chalk.cyan("holomime export")}    → convert transcripts to training data\n` +
      `  4. ${chalk.cyan("holomime train")}     → fine-tune model with alignment data ${chalk.green("✓")}\n` +
      `  5. ${chalk.cyan("holomime eval")}      → verify behavioral improvement\n\n` +
      `Fine-tuned model: ${chalk.cyan(result.modelId)}`,
    "info",
    "The Loop — Complete",
  );
  console.log();
}
