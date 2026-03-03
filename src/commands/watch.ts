import chalk from "chalk";
import figures from "figures";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { getOllamaModels, OllamaProvider } from "../llm/ollama.js";
import { createProvider, type LLMProvider } from "../llm/provider.js";
import { startWatch } from "../analysis/watch-core.js";
import { loadSpec } from "../core/inheritance.js";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";

interface WatchOptions {
  personality: string;
  dir: string;
  provider?: string;
  model?: string;
  interval?: string;
  threshold?: string;
  autoEvolve?: boolean;
}

export async function watchCommand(options: WatchOptions): Promise<void> {
  const specPath = resolve(process.cwd(), options.personality);

  let spec: any;
  try {
    spec = loadSpec(specPath);
  } catch {
    console.error(chalk.red(`  Could not read personality file: ${options.personality}`));
    process.exit(1);
    return;
  }

  const watchDir = resolve(process.cwd(), options.dir);
  if (!existsSync(watchDir)) {
    console.error(chalk.red(`  Watch directory does not exist: ${options.dir}`));
    process.exit(1);
    return;
  }

  const providerName = options.provider ?? "ollama";
  const checkInterval = parseInt(options.interval ?? "30000", 10);
  const threshold = (options.threshold ?? "targeted") as any;

  printHeader("Watch \u2014 Drift Detection");

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

  console.log(chalk.dim(`  Watching: ${watchDir}`));
  console.log(chalk.dim(`  Interval: ${checkInterval / 1000}s | Threshold: ${threshold} | Auto-evolve: ${options.autoEvolve ? "yes" : "no"}`));
  console.log();

  printBox(
    `Watching for new conversation logs...\nPress ${chalk.cyan("Ctrl+C")} to stop.`,
    "info",
    "Watch Active",
  );
  console.log();

  const handle = startWatch(spec, {
    watchDir,
    specPath,
    provider: llmProvider,
    checkInterval,
    threshold,
    autoEvolve: options.autoEvolve,
    callbacks: {
      onScan: (fileCount) => {
        // Silent — don't spam on every scan
      },
      onNewFile: (filename) => {
        const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
        console.log(`  ${chalk.dim(time)} ${chalk.cyan(figures.info)} New file: ${chalk.dim(filename)}`);
      },
      onDriftDetected: (filename, severity, patterns) => {
        const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const severityColor = severity === "intervention" ? chalk.red : chalk.yellow;
        console.log(`  ${chalk.dim(time)} ${chalk.yellow(figures.warning)} Drift detected in ${chalk.bold(filename)}`);
        console.log(`           Severity: ${severityColor(severity.toUpperCase())} | Patterns: ${patterns.join(", ")}`);
      },
      onEvolveTriggered: (filename) => {
        console.log(`           ${chalk.magenta(figures.play)} Auto-evolving...`);
      },
      onEvolveComplete: (filename, result) => {
        const icon = result.converged ? chalk.green(figures.tick) : chalk.yellow(figures.warning);
        console.log(`           ${icon} Evolve complete: ${result.totalIterations} iterations, ${result.totalDPOPairs} DPO pairs`);
        console.log();
      },
      onError: (filename, error) => {
        console.log(`  ${chalk.red(figures.cross)} Error processing ${filename}: ${chalk.dim(error)}`);
      },
    },
  });

  // Handle Ctrl+C gracefully
  process.on("SIGINT", () => {
    console.log();
    handle.stop();

    const driftEvents = handle.events.filter(e => e.type === "drift_detected").length;
    const evolveEvents = handle.events.filter(e => e.type === "evolve_complete").length;
    const errorEvents = handle.events.filter(e => e.type === "error").length;

    printBox(
      [
        "Watch stopped.",
        "",
        `Files scanned: ${handle.events.filter(e => e.type === "new_file").length}`,
        `Drift events: ${driftEvents}`,
        `Evolve runs: ${evolveEvents}`,
        `Errors: ${errorEvents}`,
        "",
        chalk.dim("Log saved to .holomime/watch-log.json"),
      ].join("\n"),
      "info",
      "Watch Summary",
    );
    console.log();

    process.exit(0);
  });
}
