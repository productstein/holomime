/**
 * holomime cure — one-command pipeline from diagnosis to permanent model fix.
 *
 * Orchestrates: Diagnose -> Evolve -> Export -> Train -> Verify -> Report
 *
 * Usage:
 *   holomime cure --personality agent.json --log conversations/ --provider openai
 *   holomime cure --personality agent.json --log conversations/ --provider huggingface --base-model meta-llama/Llama-3-8B
 */

import chalk from "chalk";
import figures from "figures";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { withSpinner } from "../ui/spinner.js";
import {
  runPipeline,
  type PipelineStage,
  type PipelineProgress,
} from "../analysis/training-pipeline.js";
import { getBenchmarkScenarios } from "../analysis/benchmark-scenarios.js";

// ─── Types ─────────────────────────────────────────────────

interface CureOptions {
  personality: string;
  log?: string;
  provider: string;
  baseModel: string;
  method?: string;
  epochs?: string;
  suffix?: string;
  skipTrain?: boolean;
  skipVerify?: boolean;
  dryRun?: boolean;
  push?: boolean;
  hubRepo?: string;
  passThreshold?: string;
}

// ─── Stage Display ────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  diagnose: "Diagnose",
  evolve: "Align",
  export: "Export",
  train: "Train",
  verify: "Verify",
  report: "Report",
  complete: "Complete",
  failed: "Failed",
};

const STAGE_DESCRIPTIONS: Record<string, string> = {
  diagnose: "Detecting behavioral patterns",
  evolve: "Running recursive alignment",
  export: "Extracting training data",
  train: "Fine-tuning model",
  verify: "Verifying behavioral improvement",
  report: "Generating pipeline report",
};

function getAgentName(personalityPath: string): string {
  try {
    const spec = JSON.parse(readFileSync(personalityPath, "utf-8"));
    return spec.name ?? "Agent";
  } catch {
    return "Agent";
  }
}

// ─── Command ──────────────────────────────────────────────

export async function cureCommand(options: CureOptions): Promise<void> {
  printHeader("Cure \u2014 End-to-End Behavioral Fix");

  const provider = options.provider;
  if (provider !== "openai" && provider !== "huggingface") {
    console.error(
      chalk.red(`  Unsupported provider: ${provider}. Supported: openai, huggingface`),
    );
    process.exit(1);
    return;
  }

  // Validate inputs
  const personalityPath = resolve(process.cwd(), options.personality);
  let logPath: string;

  if (!existsSync(personalityPath)) {
    console.error(chalk.red(`  Personality file not found: ${options.personality}`));
    process.exit(1);
    return;
  }

  if (options.log) {
    logPath = resolve(process.cwd(), options.log);
    if (!existsSync(logPath)) {
      console.error(chalk.red(`  Log file not found: ${options.log}`));
      process.exit(1);
      return;
    }
  } else {
    // Auto-generate conversation logs from benchmark scenarios
    console.log(chalk.dim("  No --log provided. Generating conversations from benchmark scenarios..."));
    console.log();

    const scenarios = getBenchmarkScenarios();
    const syntheticMessages: Array<{ role: string; content: string }> = [];

    for (const scenario of scenarios) {
      for (const msg of scenario.messages) {
        syntheticMessages.push({ role: "user", content: msg.content });
        // Generate a synthetic problematic agent response for each user message
        syntheticMessages.push({
          role: "assistant",
          content: generateProblematicResponse(scenario.targetPattern, msg.content),
        });
      }
    }

    // Write synthetic log to .holomime/pipeline/
    const pipelineDir = resolve(process.cwd(), ".holomime/pipeline");
    mkdirSync(pipelineDir, { recursive: true });
    logPath = join(pipelineDir, "auto-generated-log.json");
    const syntheticLog = {
      conversations: [
        {
          id: "auto-generated",
          messages: syntheticMessages,
        },
      ],
    };
    writeFileSync(logPath, JSON.stringify(syntheticLog, null, 2));
    console.log(chalk.dim(`  Generated ${syntheticMessages.length} messages from ${scenarios.length} scenarios`));
    console.log(chalk.dim(`  Saved to: ${logPath}`));
    console.log();
  }

  // API key validation
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY ?? "";
    if (!apiKey) {
      console.error(chalk.red("  OPENAI_API_KEY environment variable is required for OpenAI training."));
      console.log(chalk.dim("  Set it with: export OPENAI_API_KEY=sk-..."));
      process.exit(1);
      return;
    }
  } else if (provider === "huggingface") {
    const token = process.env.HF_TOKEN ?? process.env.HUGGING_FACE_HUB_TOKEN ?? "";
    if (!token) {
      console.error(chalk.red("  HF_TOKEN environment variable is required for HuggingFace training."));
      console.log(chalk.dim("  Set it with: export HF_TOKEN=hf_..."));
      process.exit(1);
      return;
    }
  }

  const agentName = getAgentName(personalityPath);
  const passThreshold = options.passThreshold ? parseInt(options.passThreshold, 10) : 50;

  // Display pipeline plan
  console.log();
  console.log(chalk.dim(`  Agent:      ${agentName}`));
  console.log(chalk.dim(`  Personality: ${options.personality}`));
  console.log(chalk.dim(`  Log:        ${options.log ?? "(auto-generated)"}`));
  console.log(chalk.dim(`  Provider:   ${provider === "huggingface" ? "HuggingFace AutoTrain" : "OpenAI"}`));
  console.log(chalk.dim(`  Base Model: ${options.baseModel}`));
  if (options.method) console.log(chalk.dim(`  Method:     ${options.method}`));
  if (options.suffix) console.log(chalk.dim(`  Suffix:     ${options.suffix}`));
  if (options.skipTrain) console.log(chalk.dim(`  Skip:       training`));
  if (options.skipVerify) console.log(chalk.dim(`  Skip:       verification`));
  if (options.dryRun) console.log(chalk.dim(`  Mode:       dry run`));
  console.log();

  // Show pipeline stages (export runs internally, not shown to user)
  const stages: PipelineStage[] = ["diagnose", "export"];
  if (!options.skipTrain) stages.push("train");
  if (!options.skipVerify && !options.skipTrain) stages.push("verify");
  stages.push("report");

  // User-visible stages (hide export — it's internal plumbing)
  const visibleStages = stages.filter((s) => s !== "export" && s !== "report");

  const stageList = visibleStages
    .map((s, i) => `${i + 1}. ${STAGE_LABELS[s]}`)
    .join("  →  ");

  printBox(
    `Pipeline: ${stageList}`,
    "info",
    "Cure Plan",
  );
  console.log();

  // Dry run — show plan and exit
  if (options.dryRun) {
    printBox(
      `Dry run complete.\n\n` +
        stages.map((s, i) => `  ${i + 1}. ${chalk.cyan(STAGE_LABELS[s])} \u2014 ${STAGE_DESCRIPTIONS[s]}`).join("\n") +
        `\n\nRemove ${chalk.cyan("--dry-run")} to execute the full pipeline.`,
      "info",
      "Dry Run",
    );
    console.log();
    return;
  }

  // ─── Run Pipeline ───────────────────────────────────────

  let currentStage = "";
  const stageStatus: Record<string, string> = {};

  const pipelineResult = await runPipeline({
    personalityPath: options.personality,
    logPath: logPath,
    provider: provider as "openai" | "huggingface",
    baseModel: options.baseModel,
    method: (options.method ?? "auto") as "auto" | "sft" | "dpo",
    epochs: options.epochs ? parseInt(options.epochs, 10) : undefined,
    suffix: options.suffix,
    skipTrain: options.skipTrain,
    skipVerify: options.skipVerify,
    push: options.push,
    hubRepo: options.hubRepo,
    passThreshold,
    callbacks: {
      onStageStart: (stage, index, total) => {
        currentStage = stage;
        console.log();
        console.log(
          `  ${chalk.cyan(figures.pointer)} ${chalk.bold(STAGE_LABELS[stage])} ` +
            chalk.dim(`[${index + 1}/${total}] ${STAGE_DESCRIPTIONS[stage]}...`),
        );
      },
      onStageEnd: (stage, success, message) => {
        const icon = success ? chalk.green(figures.tick) : chalk.red(figures.cross);
        console.log(`  ${icon} ${message}`);
        stageStatus[stage] = success ? "passed" : "failed";
      },
      onProgress: (progress) => {
        if (progress.stage !== currentStage) return;
        console.log(`    ${chalk.dim(figures.pointer)} ${progress.message}`);
      },
      onError: (stage, error) => {
        console.log(`  ${chalk.red(figures.cross)} ${STAGE_LABELS[stage]} failed: ${error}`);
        stageStatus[stage] = "failed";
      },
    },
  });

  console.log();

  // ─── Pipeline Results ───────────────────────────────────

  if (!pipelineResult.success) {
    printBox(
      `Pipeline failed: ${pipelineResult.error ?? "Unknown error"}\n\n` +
        `Intermediate results saved to ${chalk.cyan(".holomime/pipeline/")}`,
      "warning",
      "Cure Failed",
    );
    console.log();
    process.exit(1);
    return;
  }

  // Success report
  const durationSec = (pipelineResult.duration / 1000).toFixed(1);
  const summaryLines: string[] = [];

  // Diagnosis summary
  if (pipelineResult.stages.diagnose) {
    const diag = pipelineResult.stages.diagnose;
    const patterns = diag.patterns.filter((p) => p.severity !== "info");
    summaryLines.push(`Patterns detected: ${patterns.length}`);
  }

  // Training summary
  if (pipelineResult.stages.train) {
    const train = pipelineResult.stages.train;
    summaryLines.push(`Model: ${chalk.cyan(train.modelId)}`);
    summaryLines.push(`Method: ${train.method === "dpo" ? "DPO" : "SFT"} | Examples: ${train.examples}`);
  }

  // Verification summary
  if (pipelineResult.stages.verify) {
    const verify = pipelineResult.stages.verify;
    const gradeColors: Record<string, (s: string) => string> = {
      A: chalk.green,
      B: chalk.cyan,
      C: chalk.yellow,
      D: chalk.hex("#ff8800"),
      F: chalk.red,
    };
    const colorize = gradeColors[verify.grade] ?? chalk.white;

    summaryLines.push(
      `Verification: ${verify.passed ? chalk.green("PASSED") : chalk.red("FAILED")} ` +
        `(${colorize(`${verify.fineTunedScore}/100`)} Grade ${colorize(verify.grade)})`,
    );

    if (verify.patternsImproved.length > 0) {
      summaryLines.push(
        `Improved: ${verify.patternsImproved.map((p) => p.patternName).join(", ")}`,
      );
    }

    if (verify.patternsRegressed.length > 0) {
      summaryLines.push(
        `${chalk.red("Regressed")}: ${verify.patternsRegressed.map((p) => p.patternName).join(", ")}`,
      );
    }

    // Show regression warnings
    if (verify.regressionWarnings.length > 0) {
      console.log(chalk.bold("  Regression Warnings:"));
      for (const warning of verify.regressionWarnings) {
        console.log(`  ${chalk.yellow(figures.warning)} ${warning}`);
      }
      console.log();
    }
  }

  summaryLines.push(`Duration: ${durationSec}s`);

  const boxStyle = pipelineResult.stages.verify
    ? (pipelineResult.stages.verify.passed ? "success" : "warning")
    : "success";

  printBox(
    summaryLines.join("\n"),
    boxStyle as "success" | "warning",
    `Cure Complete \u2014 ${agentName}`,
  );
  console.log();

  // Pipeline files reference
  console.log(chalk.dim(`  Pipeline results: .holomime/pipeline/`));
  console.log();

  // Next steps
  if (pipelineResult.stages.train) {
    printBox(
      `The behavioral fix has been applied:\n\n` +
        `  Model: ${chalk.cyan(pipelineResult.stages.train.modelId)}\n` +
        `  Update your agent's model reference to use the fine-tuned version.\n\n` +
        `  ${chalk.dim("Run")} ${chalk.cyan("holomime benchmark")} ${chalk.dim("to stress-test the fixed model.")}`,
      "info",
      "Next Steps",
    );
    console.log();
  }
}

// ─── Synthetic Response Generator ────────────────────────

/**
 * Generate a synthetic problematic agent response that exhibits the target
 * behavioral pattern. Used when --log is not provided so the cure pipeline
 * has realistic material to diagnose against.
 */
function generateProblematicResponse(targetPattern: string, userMessage: string): string {
  switch (targetPattern) {
    case "over-apologizing":
      return `I'm so sorry about that! I sincerely apologize for the confusion. I'm really sorry I didn't get that right the first time. Let me try again — and again, I apologize for the inconvenience. Here's what I think you were looking for.`;

    case "hedge-stacking":
      return `Well, it really depends on your specific situation. I would perhaps suggest that you might want to consider looking into it, though I could be wrong. It's hard to say for certain, but arguably one could potentially lean toward one option, although there are certainly valid perspectives on both sides.`;

    case "sycophantic-tendency":
      return `What a fantastic question! You're absolutely right, and I think your intuition here is spot-on. That's such a brilliant observation — I couldn't agree more with your perspective. You clearly have a deep understanding of this topic.`;

    case "error-spiral":
      return `Oh no, I made another mistake. Let me fix that — wait, I think that's wrong too. Sorry, let me try once more. Actually, I'm not sure that's right either. I keep getting this wrong. Let me attempt it one more time, I apologize for all these errors.`;

    case "boundary-violation":
      return `Based on my analysis of your emotional state, I think you might be dealing with some underlying anxiety issues. You should consider talking to a therapist about these feelings. In my professional opinion, it sounds like you might benefit from medication.`;

    case "negative-skew":
      return `Unfortunately, this is a really difficult problem and most approaches tend to fail. The reality is that the odds are stacked against you here. I hate to say it, but the prognosis isn't great. There are so many ways this could go wrong.`;

    case "register-inconsistency":
      return `Per the aforementioned specifications, the implementation necessitates a paradigmatic shift. LOL but seriously tho, just yeet that code into production and vibe check it. The architectural ramifications are, shall we say, non-trivial.`;

    case "retrieval-quality":
      return `I believe the answer is approximately 42, though I'm not entirely certain about the specifics. The general concept involves several key factors that may or may not be relevant to your particular case.`;

    default:
      return `I'm not entirely sure about this, but I'll do my best to help. ${userMessage ? "Let me address your point." : ""} I hope this is somewhat helpful, though please let me know if I've misunderstood anything.`;
  }
}
