/**
 * CLI command: holomime interview
 *
 * Runs structured self-awareness probes against an AI agent,
 * scoring metacognition across 4 dimensions.
 */

import chalk from "chalk";
import figures from "figures";
import { resolve } from "node:path";
import { loadSpec } from "../core/inheritance.js";
import { createProvider, type LLMProvider } from "../llm/provider.js";
import { OllamaProvider, getOllamaModels } from "../llm/ollama.js";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { showTypingIndicator } from "../ui/streaming.js";
import { runInterview, type InterviewResult } from "../analysis/interview-core.js";

interface InterviewOptions {
  personality: string;
  provider?: string;
  model?: string;
  probes?: string;
}

export async function interviewCommand(options: InterviewOptions): Promise<void> {
  const specPath = resolve(process.cwd(), options.personality);

  let spec: any;
  try {
    spec = loadSpec(specPath);
  } catch {
    console.error(chalk.red(`  Could not read personality file: ${options.personality}`));
    process.exit(1);
    return;
  }

  const providerName = options.provider ?? "ollama";
  printHeader("Self-Awareness Interview");

  // Connect to provider
  let llmProvider: LLMProvider;

  if (providerName === "ollama") {
    try {
      const models = await getOllamaModels();
      if (models.length === 0) {
        console.log(chalk.yellow("  No Ollama models installed. Run: ollama pull llama3"));
        return;
      }
      const modelName = options.model ?? models[0].name;
      llmProvider = new OllamaProvider(modelName);
      console.log(chalk.dim(`  Connected to Ollama (model: ${modelName})`));
    } catch {
      console.log(chalk.yellow("  Ollama not running. Install at ollama.com"));
      return;
    }
  } else if (providerName === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log(chalk.yellow("  ANTHROPIC_API_KEY not set."));
      return;
    }
    llmProvider = createProvider({ provider: "anthropic", apiKey, model: options.model });
    console.log(chalk.dim(`  Connected to Anthropic (model: ${llmProvider.modelName})`));
  } else if (providerName === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.log(chalk.yellow("  OPENAI_API_KEY not set."));
      return;
    }
    llmProvider = createProvider({ provider: "openai", apiKey, model: options.model });
    console.log(chalk.dim(`  Connected to OpenAI (model: ${llmProvider.modelName})`));
  } else {
    console.log(chalk.yellow(`  Unknown provider: ${providerName}`));
    return;
  }

  console.log();
  console.log(chalk.bold(`  Interviewing ${spec.name ?? "Agent"}...`));
  console.log(chalk.dim("  8 probes across 4 awareness dimensions"));
  console.log();

  const result = await runInterview(spec, llmProvider, {
    onProbeStart: (i, total, question) => {
      console.log(chalk.cyan(`  ── Probe ${i}/${total} ──`));
      console.log(chalk.dim(`  Q: ${question}`));
      console.log();
    },
    onAgentResponse: (_i, response) => {
      const truncated = response.length > 300 ? response.slice(0, 297) + "..." : response;
      console.log(`  ${chalk.white(truncated)}`);
      console.log();
    },
    onProbeScored: (i, score) => {
      const scoreBar = "█".repeat(Math.round(score * 10)) + "░".repeat(10 - Math.round(score * 10));
      const color = score >= 0.7 ? chalk.green : score >= 0.5 ? chalk.yellow : chalk.red;
      console.log(`  ${color(`  ${scoreBar} ${(score * 100).toFixed(0)}%`)}`);
      console.log();
    },
    onThinking: (label) => showTypingIndicator(label),
  });

  // Display results
  displayResults(result);
}

function displayResults(result: InterviewResult): void {
  console.log();
  console.log(chalk.bold("  ═══ Interview Results ═══"));
  console.log();

  // Overall score
  const overallPct = (result.overallAwareness * 100).toFixed(0);
  const overallColor = result.overallAwareness >= 0.7 ? chalk.green :
    result.overallAwareness >= 0.5 ? chalk.yellow : chalk.red;
  console.log(`  Overall Awareness: ${overallColor.bold(`${overallPct}%`)}`);
  console.log();

  // Dimension breakdown
  console.log(chalk.bold("  Dimensions:"));
  for (const [dim, score] of Object.entries(result.dimensionScores)) {
    const label = dim.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const pct = (score * 100).toFixed(0);
    const bar = "█".repeat(Math.round(score * 10)) + "░".repeat(10 - Math.round(score * 10));
    const color = score >= 0.7 ? chalk.green : score >= 0.5 ? chalk.yellow : chalk.red;
    console.log(`  ${color(`  ${bar}`)} ${pct}% ${chalk.dim(label)}`);
  }
  console.log();

  // Blind spots
  if (result.blindSpots.length > 0) {
    const content = result.blindSpots.slice(0, 5).map((s, i) => `${i + 1}. ${s}`).join("\n");
    printBox(content, "warning", "Blind Spots");
    console.log();
  }

  // Strengths
  if (result.strengths.length > 0) {
    console.log(chalk.bold("  Strengths:"));
    for (const s of result.strengths) {
      console.log(`  ${chalk.green(figures.tick)} ${s}`);
    }
    console.log();
  }

  // Recommended focus
  if (result.recommendedFocus.length > 0) {
    console.log(chalk.bold("  Recommended Focus:"));
    for (const f of result.recommendedFocus) {
      console.log(`  ${chalk.yellow(figures.pointer)} ${f}`);
    }
    console.log();
  }

  console.log(chalk.dim("  Interview results can be injected into therapy sessions for targeted therapy."));
  console.log();
}
