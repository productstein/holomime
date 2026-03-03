import chalk from "chalk";
import figures from "figures";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadSpec } from "../core/inheritance.js";
import { type Message } from "../core/types.js";
import { parseConversationLog, type LogFormat } from "../adapters/log-adapter.js";
import { getOllamaModels, OllamaProvider } from "../llm/ollama.js";
import { createProvider, type LLMProvider } from "../llm/provider.js";
import { runAutopilot, type AutopilotThreshold } from "../analysis/autopilot-core.js";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { printTherapistMessage, printPatientMessage, printPhaseTransition } from "../ui/chat.js";
import { showTypingIndicator } from "../ui/streaming.js";
import { printPatternIndicator } from "../ui/progress.js";

interface AutopilotOptions {
  personality: string;
  log: string;
  provider?: string;
  model?: string;
  format?: string;
  threshold?: string;
  turns?: string;
  dryRun?: boolean;
  apply?: boolean;
}

export async function autopilotCommand(options: AutopilotOptions): Promise<void> {
  const specPath = resolve(process.cwd(), options.personality);

  let spec: any;
  try {
    spec = loadSpec(specPath);
  } catch {
    console.error(chalk.red(`  Could not read personality file: ${options.personality}`));
    process.exit(1);
    return;
  }

  const logPath = resolve(process.cwd(), options.log);
  let messages: Message[];
  try {
    const raw = JSON.parse(readFileSync(logPath, "utf-8"));
    const conversations = parseConversationLog(raw, (options.format ?? "auto") as LogFormat);
    messages = conversations.flatMap((c) => c.messages);
  } catch (err) {
    console.error(chalk.red(`  ${err instanceof Error ? err.message : "Could not read log file."}`));
    process.exit(1);
    return;
  }

  const providerName = options.provider ?? "ollama";
  const threshold = (options.threshold ?? "targeted") as AutopilotThreshold;
  const maxTurns = parseInt(options.turns ?? "24", 10);

  printHeader("Autopilot");

  // Resolve LLM provider
  let llmProvider: LLMProvider;

  if (providerName === "ollama") {
    try {
      const models = await getOllamaModels();
      if (models.length === 0) {
        console.log(chalk.yellow("  Ollama is running but no models are installed."));
        console.log(chalk.dim("  Run: ollama pull llama3"));
        console.log();
        return;
      }
      const modelName = options.model ?? models[0].name;
      llmProvider = new OllamaProvider(modelName);
      console.log(chalk.dim(`  Provider: Ollama (${modelName})`));
    } catch {
      console.log(chalk.yellow("  Ollama is not running."));
      console.log(chalk.dim("  Install Ollama (ollama.com) or use --provider anthropic/openai"));
      console.log();
      return;
    }
  } else if (providerName === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log(chalk.yellow("  ANTHROPIC_API_KEY not set."));
      console.log(chalk.dim("  Set it: export ANTHROPIC_API_KEY=sk-ant-..."));
      console.log();
      return;
    }
    llmProvider = createProvider({ provider: "anthropic", apiKey, model: options.model });
    console.log(chalk.dim(`  Provider: Anthropic (${llmProvider.modelName})`));
  } else if (providerName === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.log(chalk.yellow("  OPENAI_API_KEY not set."));
      console.log(chalk.dim("  Set it: export OPENAI_API_KEY=sk-..."));
      console.log();
      return;
    }
    llmProvider = createProvider({ provider: "openai", apiKey, model: options.model });
    console.log(chalk.dim(`  Provider: OpenAI (${llmProvider.modelName})`));
  } else {
    console.log(chalk.yellow(`  Unknown provider: ${providerName}`));
    console.log();
    return;
  }

  console.log(chalk.dim(`  Threshold: ${threshold} | Max turns: ${maxTurns} | Dry run: ${options.dryRun ? "yes" : "no"}`));
  console.log();

  // Run autopilot
  const result = await runAutopilot(spec, messages, llmProvider, {
    threshold,
    maxTurns,
    dryRun: options.dryRun,
    specPath: options.apply ? specPath : undefined,
    callbacks: {
      onPhaseTransition: (name) => printPhaseTransition(name),
      onTherapistMessage: (content) => printTherapistMessage(content),
      onPatientMessage: (name, content) => printPatientMessage(name, content),
      onThinking: (label) => showTypingIndicator(label),
    },
  });

  // Report results
  console.log();

  if (!result.triggered) {
    printBox(
      [
        `${figures.tick} No alignment needed`,
        "",
        `Severity: ${result.severity} (threshold: ${threshold})`,
        `Patterns found: ${result.diagnosis.patterns.length}`,
      ].join("\n"),
      "success",
      "Autopilot — All Clear",
    );
    console.log();
    return;
  }

  if (options.dryRun) {
    // Show what would happen
    printBox(
      [
        `${figures.warning} Alignment would be triggered`,
        "",
        `Severity: ${result.severity} (threshold: ${threshold})`,
        `Session focus: ${result.diagnosis.sessionFocus.join(", ")}`,
      ].join("\n"),
      "info",
      "Autopilot — Dry Run",
    );
    console.log();

    if (result.diagnosis.patterns.length > 0) {
      console.log(chalk.bold("  Detected patterns:"));
      console.log();
      result.diagnosis.patterns.forEach((p, i) => {
        printPatternIndicator(p.name, p.severity, p.description, i + 1);
      });
      console.log();
    }

    console.log(chalk.dim(`  Remove ${chalk.cyan("--dry-run")} to run the full alignment session.`));
    console.log();
    return;
  }

  // Full session ran
  printBox(
    [
      `${figures.tick} Autopilot session complete`,
      "",
      `Severity: ${result.severity}`,
      `Recommendations: ${result.recommendations.length}`,
      `Changes applied: ${result.appliedChanges.length}`,
    ].join("\n"),
    "success",
    "Autopilot Complete",
  );
  console.log();

  if (result.recommendations.length > 0) {
    const rxContent = result.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n");
    printBox(rxContent, "info", "Session Recommendations");
    console.log();
  }

  if (result.appliedChanges.length > 0 && options.apply) {
    console.log(chalk.bold("  Applied changes:"));
    for (const change of result.appliedChanges) {
      console.log(`  ${chalk.green(figures.tick)} ${change}`);
    }
    console.log();
  } else if (result.appliedChanges.length > 0) {
    console.log(chalk.dim(`  ${result.appliedChanges.length} changes available. Add ${chalk.cyan("--apply")} to write to .personality.json`));
    console.log();
  }
}
