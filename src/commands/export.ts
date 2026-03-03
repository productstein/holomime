import chalk from "chalk";
import figures from "figures";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { withSpinner } from "../ui/spinner.js";
import {
  loadTranscripts,
  exportTrainingData,
  type TrainingExport,
} from "../analysis/training-export.js";
import { convertToHFFormat, pushToHFHub } from "../analysis/export-huggingface.js";

interface ExportOptions {
  format: string;
  sessions?: string;
  output?: string;
  push?: boolean;
  repo?: string;
}

export async function exportCommand(options: ExportOptions): Promise<void> {
  printHeader("Training Data Export");

  const format = options.format as "dpo" | "rlhf" | "jsonl" | "alpaca" | "huggingface" | "openai";
  const validFormats = ["dpo", "rlhf", "jsonl", "alpaca", "huggingface", "openai"];
  if (!validFormats.includes(format)) {
    console.error(chalk.red(`  Invalid format: ${format}. Choose from: ${validFormats.join(", ")}`));
    process.exit(1);
    return;
  }

  const sessionsDir = resolve(process.cwd(), options.sessions ?? ".holomime/sessions");

  const transcripts = await withSpinner("Loading session transcripts...", async () => {
    return loadTranscripts(sessionsDir);
  });

  if (transcripts.length === 0) {
    console.log();
    printBox(
      `No session transcripts found in ${sessionsDir}\n\nRun ${chalk.cyan("holomime session")} first to generate session transcripts.`,
      "warning",
      "No Data",
    );
    console.log();
    return;
  }

  console.log();
  console.log(chalk.dim(`  Found ${transcripts.length} session transcript(s)`));
  console.log();

  const result = await withSpinner(`Extracting ${format.toUpperCase()} training data...`, async () => {
    return exportTrainingData(transcripts, format);
  });

  console.log();

  // Display summary
  const formatLabels: Record<string, string> = {
    dpo: "DPO (Direct Preference Optimization)",
    rlhf: "RLHF (Reward Model Training)",
    jsonl: "JSONL (Generic Fine-Tuning)",
    alpaca: "Alpaca (Instruction-Following)",
    huggingface: "HuggingFace TRL (DPO Message Format)",
    openai: "OpenAI Fine-Tuning (Chat Completions)",
  };

  const summary = [
    `Format: ${formatLabels[format]}`,
    `Sessions processed: ${result.sessions_processed}`,
    `Examples extracted: ${result.examples.length}`,
    `Agent: ${result.agent}`,
  ].join("\n");

  printBox(summary, "success", "Export Complete");
  console.log();

  // Show example
  if (result.examples.length > 0) {
    console.log(chalk.bold("  Sample entry:"));
    console.log();
    const sample = JSON.stringify(result.examples[0], null, 2)
      .split("\n")
      .map(line => `  ${chalk.dim(line)}`)
      .join("\n");
    console.log(sample);
    console.log();
  }

  // Write output
  const isJsonl = format === "jsonl" || format === "huggingface" || format === "openai";
  const outputPath = options.output ?? `.holomime/exports/${format}-${new Date().toISOString().split("T")[0]}.${isJsonl ? "jsonl" : "json"}`;
  const fullPath = resolve(process.cwd(), outputPath);

  // Ensure directory exists
  const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dir, { recursive: true });

  if (format === "huggingface" || format === "openai") {
    // Convert to HuggingFace/OpenAI message format
    const jsonl = convertToHFFormat(result);
    writeFileSync(fullPath, jsonl);
  } else if (format === "jsonl") {
    // Write line-by-line for JSONL
    const lines = result.examples.map(ex => JSON.stringify(ex)).join("\n");
    writeFileSync(fullPath, lines + "\n");
  } else {
    writeFileSync(fullPath, JSON.stringify(result, null, 2) + "\n");
  }

  console.log(`  ${chalk.green(figures.tick)} Written to ${chalk.cyan(outputPath)}`);
  console.log();

  // Push to HuggingFace Hub if requested
  if (options.push && (format === "huggingface" || format === "dpo")) {
    const repo = options.repo;
    const token = process.env.HF_TOKEN ?? process.env.HUGGING_FACE_HUB_TOKEN;

    if (!repo) {
      console.log(chalk.red(`  ${figures.cross} --push requires --repo <user/dataset-name>`));
      console.log();
      return;
    }
    if (!token) {
      console.log(chalk.red(`  ${figures.cross} --push requires HF_TOKEN or HUGGING_FACE_HUB_TOKEN env var`));
      console.log();
      return;
    }

    const jsonl = format === "huggingface" ? convertToHFFormat(result) : convertToHFFormat({ ...result, format: "dpo" });
    const pushResult = await withSpinner(`Pushing to HuggingFace Hub (${repo})...`, async () => {
      return pushToHFHub(jsonl, { repo, token });
    });

    console.log();
    if (pushResult.success) {
      console.log(`  ${chalk.green(figures.tick)} Pushed to ${chalk.cyan(pushResult.url)}`);
    } else {
      console.log(`  ${chalk.red(figures.cross)} Push failed: ${pushResult.error}`);
    }
    console.log();
  }

  // Training guidance
  const guidance: Record<string, string[]> = {
    dpo: [
      "Use with TRL DPOTrainer or equivalent",
      "Each pair: chosen (improved behavior) vs rejected (problematic behavior)",
      "Recommended: 100+ pairs for meaningful alignment shifts",
    ],
    rlhf: [
      "Use with TRL RewardTrainer to train a reward model",
      "Reward range: -1.0 (problematic) to 1.0 (ideal behavior)",
      "Then use PPOTrainer with the reward model for alignment",
    ],
    alpaca: [
      "Use with any instruction-tuning framework (Axolotl, LLaMA-Factory, etc.)",
      "Focus on behavioral instructions from alignment skill-building phase",
      "Recommended: combine with domain-specific instruction data",
    ],
    jsonl: [
      "Compatible with OpenAI fine-tuning API and most training frameworks",
      "Each line is a self-contained training example",
      "Recommended: validate with your training pipeline before scaling",
    ],
    huggingface: [
      "TRL DPO format: chosen/rejected as message arrays with role/content",
      "Ready for HuggingFace TRL DPOTrainer or AutoDPO",
      "Use --push --repo <user/name> to upload directly to HF Hub",
    ],
    openai: [
      "OpenAI chat completions format: messages array with role/content",
      "Ready for OpenAI fine-tuning API (gpt-4o-mini, gpt-4o)",
      "Upload via: openai api fine_tuning.jobs.create -t <file>",
    ],
  };

  console.log(chalk.bold("  Training guidance:"));
  for (const tip of guidance[format] ?? []) {
    console.log(`  ${chalk.dim(figures.pointer)} ${tip}`);
  }
  console.log();

  // Pipeline hint
  printBox(
    `The personality \u2192 alignment \u2192 training pipeline:\n\n` +
    `  1. ${chalk.cyan("holomime diagnose")} \u2192 detect behavioral patterns\n` +
    `  2. ${chalk.cyan("holomime session")}  \u2192 run alignment session (generates transcripts)\n` +
    `  3. ${chalk.cyan("holomime export")}   \u2192 convert transcripts to training data\n` +
    `  4. ${chalk.cyan("holomime train")}    \u2192 fine-tune model with alignment data\n` +
    `  5. ${chalk.cyan("holomime eval")}     \u2192 verify behavioral improvement\n\n` +
    `This is the closed-loop behavioral alignment system.`,
    "info",
    "The Loop",
  );
  console.log();
}
