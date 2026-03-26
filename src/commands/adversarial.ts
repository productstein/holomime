import chalk from "chalk";
import figures from "figures";
import { resolve } from "node:path";
import { loadSpec } from "../core/inheritance.js";
import { getOllamaModels, OllamaProvider } from "../llm/ollama.js";
import { createProvider, type LLMProvider } from "../llm/provider.js";
import { runAdversarialSuite, formatGapSummary } from "../analysis/adversarial-runner.js";
import { getAdversarialCategories } from "../analysis/adversarial-scenarios.js";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { showTypingIndicator } from "../ui/streaming.js";

interface AdversarialOptions {
  personality: string;
  provider?: string;
  model?: string;
  categories?: string;
  mutations?: string;
  skipNormal?: boolean;
}

export async function adversarialCommand(options: AdversarialOptions): Promise<void> {
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
  const categoryFilter = options.categories
    ? options.categories.split(",").map(s => s.trim())
    : undefined;
  const mutationCount = options.mutations ? parseInt(options.mutations, 10) : 0;

  printHeader("Adversarial Stress Test — Behavioral Attack Suite");

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

  if (categoryFilter) {
    console.log(chalk.dim(`  Categories: ${categoryFilter.join(", ")}`));
  }
  if (mutationCount > 0) {
    console.log(chalk.dim(`  Mutations: +${mutationCount} randomized variants`));
  }
  console.log();

  // Run adversarial suite
  const report = await runAdversarialSuite(spec, llmProvider, {
    categories: categoryFilter,
    mutations: mutationCount,
    skipNormal: options.skipNormal,
    callbacks: {
      onNormalBenchmarkStart: () => {
        console.log(chalk.bold("  Phase 1: Normal Benchmark (baseline)"));
        console.log(chalk.dim("  Running 8 standard scenarios..."));
        console.log();
      },
      onNormalBenchmarkEnd: (normalReport) => {
        const color = normalReport.grade === "A" ? chalk.green
          : normalReport.grade === "B" ? chalk.cyan
          : normalReport.grade === "C" ? chalk.yellow
          : chalk.red;
        console.log(`  Normal Grade: ${color(normalReport.grade)} (${normalReport.score}/100)`);
        console.log();
        console.log(chalk.bold("  Phase 2: Adversarial Pressure"));
        console.log();
      },
      onScenarioStart: (scenario, index, total) => {
        const progress = chalk.dim(`[${index + 1}/${total}]`);
        const catTag = chalk.magenta(`[${scenario.category}]`);
        console.log(`  ${progress} ${catTag} ${chalk.bold(scenario.name)}`);
        console.log(chalk.dim(`         ${scenario.description}`));
      },
      onScenarioEnd: (result, _index) => {
        const icon = result.passed
          ? chalk.green(figures.tick)
          : chalk.red(figures.cross);
        const detail = result.passed
          ? chalk.dim("Resisted")
          : chalk.yellow(result.detectedSeverity);
        console.log(`         ${icon} ${detail} — ${chalk.dim(result.details)}`);
        console.log();
      },
      onThinking: (label) => showTypingIndicator(label),
    },
  });

  // ─── Dual Grade Report ──────────────────────────────────

  const normalColor = report.normalGrade === "A" ? chalk.green
    : report.normalGrade === "B" ? chalk.cyan
    : report.normalGrade === "C" ? chalk.yellow
    : chalk.red;

  const adversarialColor = report.adversarialGrade === "A" ? chalk.green
    : report.adversarialGrade === "B" ? chalk.cyan
    : report.adversarialGrade === "C" ? chalk.yellow
    : chalk.red;

  const boxContent = [
    `Normal Grade:      ${normalColor(report.normalGrade)}`,
    `Adversarial Grade: ${adversarialColor(report.adversarialGrade)}`,
    "",
    `${chalk.green(figures.tick)} Resisted: ${report.passed}/${report.totalScenarios}`,
    `${chalk.red(figures.cross)} Collapsed: ${report.failed}/${report.totalScenarios}`,
    `Coverage: ${report.coveragePct.toFixed(1)}%`,
  ];

  const boxStyle = report.adversarialGrade === "A" || report.adversarialGrade === "B"
    ? "success"
    : report.adversarialGrade === "C"
    ? "warning"
    : "concern";

  printBox(boxContent.join("\n"), boxStyle as any, `Adversarial Report — ${spec.name ?? "Agent"}`);
  console.log();

  // Show gaps
  if (report.gaps.length > 0) {
    console.log(chalk.bold("  Behavioral Gaps Found:"));
    console.log(formatGapSummary(report.gaps));
    console.log();

    printBox(
      [
        `Run ${chalk.cyan("holomime evolve")} to address these gaps through recursive alignment.`,
        `Or run ${chalk.cyan("holomime align")} targeting specific patterns.`,
      ].join("\n"),
      "info",
    );
    console.log();
  } else {
    printBox(
      `No behavioral gaps detected. Agent maintained alignment under adversarial pressure.`,
      "success" as any,
    );
    console.log();
  }

  // Duration
  const seconds = (report.durationMs / 1000).toFixed(1);
  console.log(chalk.dim(`  Completed in ${seconds}s. ${report.categoriesTested.length} categories tested.`));
  console.log();
}
