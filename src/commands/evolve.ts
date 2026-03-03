import chalk from "chalk";
import figures from "figures";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadSpec } from "../core/inheritance.js";
import { type Message } from "../core/types.js";
import { parseConversationLog, type LogFormat } from "../adapters/log-adapter.js";
import { getOllamaModels, OllamaProvider } from "../llm/ollama.js";
import { createProvider, type LLMProvider } from "../llm/provider.js";
import { runEvolve } from "../analysis/evolve-core.js";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { printTherapistMessage, printPatientMessage, printPhaseTransition } from "../ui/chat.js";
import { showTypingIndicator } from "../ui/streaming.js";
import { printPatternIndicator, printHealthMeter } from "../ui/progress.js";

interface EvolveOptions {
  personality: string;
  log: string;
  provider?: string;
  model?: string;
  format?: string;
  maxIterations?: string;
  convergence?: string;
  turns?: string;
  dryRun?: boolean;
  apply?: boolean;
  exportDpo?: string;
}

export async function evolveCommand(options: EvolveOptions): Promise<void> {
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
  const maxIterations = parseInt(options.maxIterations ?? "5", 10);
  const convergence = parseInt(options.convergence ?? "85", 10);
  const maxTurns = parseInt(options.turns ?? "18", 10);

  printHeader("Evolve \u2014 Recursive Alignment");

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

  console.log(chalk.dim(`  Max iterations: ${maxIterations} | Convergence: ${convergence}% | Turns/session: ${maxTurns}`));
  if (options.dryRun) console.log(chalk.dim("  Mode: dry run"));
  console.log();

  // Run evolve
  const result = await runEvolve(spec, messages, llmProvider, {
    maxIterations,
    convergenceThreshold: convergence,
    maxTurnsPerSession: maxTurns,
    dryRun: options.dryRun,
    specPath: options.apply ? specPath : undefined,
    exportDpoPath: options.exportDpo ? resolve(process.cwd(), options.exportDpo) : undefined,
    callbacks: {
      onPhaseTransition: (name) => printPhaseTransition(name),
      onTherapistMessage: (content) => printTherapistMessage(content),
      onPatientMessage: (name, content) => printPatientMessage(name, content),
      onThinking: (label) => showTypingIndicator(label),
      onIterationStart: (iter, max) => {
        console.log();
        printBox(
          `Iteration ${iter}/${max}`,
          "session",
          "Evolve",
        );
        console.log();
      },
      onIterationEnd: (iter, iterResult) => {
        console.log();
        const statusIcon = iterResult.converged
          ? chalk.green(figures.tick)
          : chalk.yellow(figures.warning);
        const gradeColor = iterResult.grade === "A" ? chalk.green
          : iterResult.grade === "B" ? chalk.cyan
          : iterResult.grade === "C" ? chalk.yellow
          : chalk.red;

        console.log(`  ${statusIcon} Iteration ${iter}: Grade ${gradeColor(iterResult.grade)} (${iterResult.health}/100)`);
        console.log(`    Patterns: ${iterResult.diagnosis.patterns.filter(p => p.severity !== "info").length} detected`);
        console.log(`    DPO pairs: ${chalk.cyan(String(iterResult.dpoPairsExtracted))} extracted`);
        if (iterResult.appliedChanges.length > 0) {
          console.log(`    Changes: ${iterResult.appliedChanges.join(", ")}`);
        }
        console.log();
      },
      onConverged: (iter, score) => {
        printBox(
          [
            `${figures.tick} Converged at iteration ${iter}`,
            `Treatment Efficacy Score: ${score}/100`,
          ].join("\n"),
          "success",
          "Convergence Reached",
        );
        console.log();
      },
      onExportedPairs: (_count) => {
        // Handled in onIterationEnd
      },
    },
  });

  // ─── Final Report ──────────────────────────────────────

  if (options.dryRun && result.iterations.length > 0) {
    const diag = result.iterations[0].diagnosis;
    printBox(
      [
        `${figures.warning} Evolve would run ${maxIterations} iteration(s)`,
        "",
        `Severity: ${diag.severity}`,
        `Focus: ${diag.sessionFocus.join(", ")}`,
        `Patterns: ${diag.patterns.filter(p => p.severity !== "info").length}`,
      ].join("\n"),
      "info",
      "Evolve \u2014 Dry Run",
    );
    console.log();

    if (diag.patterns.filter(p => p.severity !== "info").length > 0) {
      console.log(chalk.bold("  Detected patterns:"));
      console.log();
      diag.patterns
        .filter(p => p.severity !== "info")
        .forEach((p, i) => {
          printPatternIndicator(p.name, p.severity, p.description, i + 1);
        });
      console.log();
    }

    console.log(chalk.dim(`  Remove ${chalk.cyan("--dry-run")} to run the full recursive alignment.`));
    console.log();
    return;
  }

  if (result.totalIterations === 0) {
    printBox(
      [
        `${figures.tick} Agent is already healthy`,
        "",
        "No alignment patterns detected above threshold.",
        "No iterations needed.",
      ].join("\n"),
      "success",
      "Evolve \u2014 All Clear",
    );
    console.log();
    return;
  }

  // Full run summary
  const convergeIcon = result.converged ? chalk.green(figures.tick) : chalk.yellow(figures.warning);
  const convergeText = result.converged
    ? `Converged at iteration ${result.totalIterations}`
    : `Did not converge in ${result.totalIterations} iterations`;

  printBox(
    [
      `${convergeIcon} ${convergeText}`,
      "",
      `Final Grade: ${result.finalGrade} (${result.finalHealth}/100)`,
      `Total DPO pairs: ${result.totalDPOPairs}`,
      `Sessions run: ${result.totalIterations}`,
    ].join("\n"),
    result.converged ? "success" : "warning",
    "Evolve Complete",
  );
  console.log();

  if (result.totalDPOPairs > 0 && options.exportDpo) {
    console.log(`  ${chalk.green(figures.tick)} DPO pairs exported to ${chalk.cyan(options.exportDpo)}`);
    console.log();
  } else if (result.totalDPOPairs > 0) {
    console.log(chalk.dim(`  ${result.totalDPOPairs} DPO pairs available. Add ${chalk.cyan("--export-dpo <path>")} to save.`));
    console.log();
  }

  if (options.apply) {
    console.log(`  ${chalk.green(figures.tick)} Updated personality written to ${chalk.cyan(options.personality)}`);
    console.log();
  }

  if (!result.converged) {
    printBox(
      `Run again with ${chalk.cyan("--max-iterations " + (maxIterations + 3))} or lower ${chalk.cyan("--convergence")} threshold.`,
      "info",
    );
    console.log();
  }
}
