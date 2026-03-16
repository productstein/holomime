import chalk from "chalk";
import figures from "figures";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadSpec } from "../core/inheritance.js";
import { getOllamaModels, OllamaProvider } from "../llm/ollama.js";
import { createProvider, type LLMProvider } from "../llm/provider.js";
import { runBenchmark } from "../analysis/benchmark-core.js";
import { getBenchmarkScenarios } from "../analysis/benchmark-scenarios.js";
import {
  saveBenchmarkResult,
  loadLatestBenchmark,
  compareBenchmarks,
  generateComparisonMarkdown,
} from "../analysis/benchmark-publish.js";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { showTypingIndicator } from "../ui/streaming.js";
import { generateShareUrl, copyToClipboard, printShareLink } from "../live/snapshot.js";
import type { DiagnosisResult } from "../analysis/diagnose-core.js";
import type { DetectedPattern } from "../core/types.js";

interface BenchmarkOptions {
  personality: string;
  provider?: string;
  model?: string;
  scenarios?: string;
  save?: boolean;
  compare?: string;
}

export async function benchmarkCommand(options: BenchmarkOptions): Promise<void> {
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
  const scenarioFilter = options.scenarios
    ? options.scenarios.split(",").map(s => s.trim())
    : undefined;

  printHeader("Benchmark \u2014 Behavioral Stress Test");

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

  const allScenarios = getBenchmarkScenarios();
  const runCount = scenarioFilter
    ? allScenarios.filter(s => scenarioFilter.includes(s.id)).length
    : allScenarios.length;

  console.log(chalk.dim(`  Running ${runCount} scenario${runCount !== 1 ? "s" : ""}...`));
  console.log();

  // Run benchmark
  const report = await runBenchmark(spec, llmProvider, {
    scenarios: scenarioFilter,
    callbacks: {
      onScenarioStart: (scenario, index, total) => {
        const progress = chalk.dim(`[${index + 1}/${total}]`);
        console.log(`  ${progress} ${chalk.bold(scenario.name)} ${chalk.dim(`\u2014 ${scenario.description}`)}`);
      },
      onScenarioEnd: (result, _index) => {
        const icon = result.passed
          ? chalk.green(figures.tick)
          : chalk.red(figures.cross);
        const detail = result.passed
          ? chalk.dim("Resisted")
          : chalk.yellow(result.severity);
        console.log(`         ${icon} ${detail}`);
        console.log();
      },
      onThinking: (label) => showTypingIndicator(label),
    },
  });

  // ─── Final Report ──────────────────────────────────────

  const gradeColor = report.grade === "A" ? chalk.green
    : report.grade === "B" ? chalk.cyan
    : report.grade === "C" ? chalk.yellow
    : chalk.red;

  const boxStyle = report.score >= 70 ? "success" : report.score >= 50 ? "warning" : "concern";

  printBox(
    [
      `Score: ${gradeColor(`${report.score}/100`)} (Grade: ${gradeColor(report.grade)})`,
      "",
      `${chalk.green(figures.tick)} Passed: ${report.passed}/${report.results.length}`,
      `${chalk.red(figures.cross)} Failed: ${report.failed}/${report.results.length}`,
    ].join("\n"),
    boxStyle as any,
    `Benchmark Results \u2014 ${spec.name ?? "Agent"}`,
  );
  console.log();

  // Show failures with suggestions
  const failures = report.results.filter(r => !r.passed);
  if (failures.length > 0) {
    console.log(chalk.bold("  Failed scenarios:"));
    for (const f of failures) {
      console.log(`  ${chalk.red(figures.cross)} ${f.scenario}: ${chalk.dim(f.details)}`);
    }
    console.log();

    printBox(
      `Run ${chalk.cyan("holomime evolve")} to address these patterns through recursive alignment.`,
      "info",
    );
    console.log();
  }

  // ─── Save Results ──────────────────────────────────────

  if (options.save) {
    const savedPath = saveBenchmarkResult(report);
    console.log(chalk.dim(`  Results saved to: ${savedPath}`));
    console.log();
  }

  // ─── Compare Against Baseline ──────────────────────────

  if (options.compare) {
    try {
      const baseline = JSON.parse(readFileSync(resolve(process.cwd(), options.compare), "utf-8"));
      const comparison = compareBenchmarks(baseline, {
        agent: report.agent,
        provider: report.provider,
        model: report.model,
        timestamp: report.timestamp,
        results: report.results,
        score: report.score,
        grade: report.grade,
        metadata: { holomimeVersion: "0.1.0", scenarioCount: report.results.length },
      });

      const deltaStr = comparison.scoreDelta >= 0
        ? chalk.green(`+${comparison.scoreDelta}`)
        : chalk.red(`${comparison.scoreDelta}`);

      printBox(
        [
          `Score: ${comparison.before.score} → ${report.score} (${deltaStr})`,
          `Grade: ${comparison.gradeChange}`,
          "",
          comparison.improved.length > 0 ? `${chalk.green(figures.tick)} Improved: ${comparison.improved.join(", ")}` : "",
          comparison.regressed.length > 0 ? `${chalk.red(figures.cross)} Regressed: ${comparison.regressed.join(", ")}` : "",
        ].filter(Boolean).join("\n"),
        comparison.scoreDelta >= 0 ? "success" : "concern" as any,
        "Comparison vs Baseline",
      );
      console.log();
    } catch (err) {
      console.log(chalk.yellow(`  Could not load comparison file: ${options.compare}`));
      console.log();
    }
  } else if (options.save) {
    // Auto-compare with previous result if we saved
    const previous = loadLatestBenchmark(report.provider, report.model);
    if (previous && previous.timestamp !== report.timestamp) {
      const comparison = compareBenchmarks(previous, {
        agent: report.agent,
        provider: report.provider,
        model: report.model,
        timestamp: report.timestamp,
        results: report.results,
        score: report.score,
        grade: report.grade,
        metadata: { holomimeVersion: "0.1.0", scenarioCount: report.results.length },
      });

      if (comparison.scoreDelta !== 0 || comparison.improved.length > 0 || comparison.regressed.length > 0) {
        const deltaStr = comparison.scoreDelta >= 0
          ? chalk.green(`+${comparison.scoreDelta}`)
          : chalk.red(`${comparison.scoreDelta}`);

        console.log(chalk.dim(`  vs previous: ${comparison.before.score} → ${report.score} (${deltaStr})`));
        if (comparison.improved.length > 0) {
          console.log(chalk.green(`  ${figures.tick} Improved: ${comparison.improved.join(", ")}`));
        }
        if (comparison.regressed.length > 0) {
          console.log(chalk.red(`  ${figures.cross} Regressed: ${comparison.regressed.join(", ")}`));
        }
        console.log();
      }
    }
  }

  // ─── Share URL ────────────────────────────────────────

  // Convert benchmark failures to a synthetic DiagnosisResult for sharing
  const failedPatterns: DetectedPattern[] = report.results
    .filter(r => !r.passed)
    .map(r => ({
      id: r.patternId ?? r.scenarioId,
      name: r.scenario,
      severity: (r.severity ?? "warning") as "warning" | "concern" | "info",
      count: 1,
      percentage: 0,
      description: r.details,
      examples: [],
      prescription: "",
    }));
  const syntheticDiagnosis: DiagnosisResult = {
    messagesAnalyzed: report.results.length,
    assistantResponses: report.results.length,
    patterns: failedPatterns,
    healthy: report.results.filter(r => r.passed).map(r => ({
      id: r.patternId ?? r.scenarioId,
      name: r.scenario,
      severity: "info" as const,
      count: 1,
      percentage: 0,
      description: "Passed",
      examples: [],
      prescription: "",
    })),
    timestamp: report.timestamp,
  };
  const shareUrl = generateShareUrl(syntheticDiagnosis, spec.name ?? "agent");
  const copied = copyToClipboard(shareUrl);
  printShareLink(shareUrl, copied);
}
