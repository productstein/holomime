import chalk from "chalk";
import figures from "figures";
import { resolve } from "node:path";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import {
  loadFleetConfig,
  discoverAgents,
  type FleetConfig,
} from "../analysis/fleet-core.js";
import {
  runFleetTherapy,
  type FleetTherapyReport,
  type AgentTherapyResult,
} from "../analysis/fleet-therapy.js";
import { getOllamaModels, OllamaProvider } from "../llm/ollama.js";
import { createProvider, type LLMProvider } from "../llm/provider.js";
import { getCurrentTier, getFleetTherapyLimit } from "../ui/tier.js";

interface FleetTherapyOptions {
  config?: string;
  dir?: string;
  provider?: string;
  model?: string;
  turns?: string;
  concurrency?: string;
  apply?: boolean;
  yes?: boolean;
}

export async function fleetTherapyCommand(options: FleetTherapyOptions): Promise<void> {
  printHeader("Group Therapy");

  // Load fleet config
  let config: FleetConfig;

  if (options.config) {
    try {
      config = loadFleetConfig(resolve(process.cwd(), options.config));
    } catch (err) {
      console.error(chalk.red(`  Failed to load fleet config: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
      return;
    }
  } else if (options.dir) {
    try {
      config = discoverAgents(resolve(process.cwd(), options.dir));
    } catch (err) {
      console.error(chalk.red(`  Failed to discover agents: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
      return;
    }
  } else {
    console.error(chalk.red("  Provide --config <fleet.json> or --dir <agents-directory>"));
    process.exit(1);
    return;
  }

  if (config.agents.length === 0) {
    printBox("No agents found. Check your fleet config or directory.", "warning", "Empty Fleet");
    console.log();
    return;
  }

  // Tier-based agent limit
  const tier = getCurrentTier();
  const maxAgents = getFleetTherapyLimit(tier);
  if (maxAgents !== null && config.agents.length > maxAgents) {
    printBox(
      `Your ${tier} plan supports up to ${maxAgents} agents per fleet-therapy run.\n` +
      `Found ${config.agents.length} agents. Upgrade to Institute for unlimited.\n\n` +
      `Upgrade: https://holomime.dev/pro`,
      "warning",
      "Agent Limit Exceeded",
    );
    process.exit(1);
    return;
  }

  // Create LLM provider
  const providerName = options.provider ?? "ollama";
  let provider: LLMProvider;

  if (providerName === "ollama") {
    try {
      const models = await getOllamaModels();
      if (models.length === 0) {
        console.log(chalk.yellow("  Ollama is running but no models are installed."));
        console.log(chalk.dim("  Run: ollama pull llama3"));
        return;
      }
      provider = new OllamaProvider(options.model ?? models[0].name);
    } catch {
      console.log(chalk.yellow("  Ollama is not running."));
      console.log(chalk.dim("  Install Ollama (ollama.com) or use --provider anthropic/openai"));
      return;
    }
  } else if (providerName === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log(chalk.yellow("  ANTHROPIC_API_KEY not set."));
      return;
    }
    provider = createProvider({ provider: "anthropic", apiKey, model: options.model });
  } else if (providerName === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.log(chalk.yellow("  OPENAI_API_KEY not set."));
      return;
    }
    provider = createProvider({ provider: "openai", apiKey, model: options.model });
  } else {
    console.log(chalk.yellow(`  Unknown provider: ${providerName}`));
    return;
  }

  const maxTurns = parseInt(options.turns ?? "24", 10);
  const isCloud = providerName === "anthropic" || providerName === "openai";
  const defaultConcurrency = isCloud ? 3 : 5;
  const concurrency = parseInt(options.concurrency ?? String(defaultConcurrency), 10);

  // Fleet overview
  console.log();
  console.log(chalk.bold(`  Group Therapy — ${config.agents.length} agent(s)`));
  console.log();
  for (const agent of config.agents) {
    console.log(`  ${chalk.cyan(figures.pointer)} ${chalk.bold(agent.name)}`);
    console.log(`    ${chalk.dim("Spec:")} ${agent.specPath}`);
  }
  console.log();

  // Cost estimation for cloud providers
  if (isCloud && !options.yes) {
    const estimatedCalls = config.agents.length * 2;
    console.log(chalk.dim(`  Estimated LLM calls: ~${estimatedCalls} (${config.agents.length} agents x ~2 calls each)`));
    console.log(chalk.dim(`  Provider: ${providerName} | Concurrency: ${concurrency}`));
    console.log();

    const readline = await import("node:readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => {
      rl.question(chalk.yellow("  Proceed? [Y/n] "), resolve);
    });
    rl.close();

    if (answer.toLowerCase() === "n") {
      console.log(chalk.dim("  Cancelled."));
      return;
    }
    console.log();
  }

  printBox(
    `Running ${config.agents.length} therapy session(s) in parallel\n` +
    `Concurrency: ${concurrency} | Max turns: ${maxTurns}\n` +
    `Apply recommendations: ${options.apply ? "yes" : "no (use --apply)"}`,
    "info",
    "Group Therapy Starting",
  );
  console.log();

  const startTime = Date.now();

  // Run fleet therapy
  const report = await runFleetTherapy(config, {
    provider,
    maxTurns,
    concurrency,
    apply: options.apply,
    callbacks: {
      onAgentStart: (name, index, total) => {
        console.log(`  ${chalk.cyan(figures.pointer)} ${chalk.bold(name)} ${chalk.dim(`(${index + 1}/${total})`)}`);
      },
      onAgentDiagnosis: (name, diagnosis) => {
        const severityColor = diagnosis.severity === "routine" ? chalk.green :
          diagnosis.severity === "targeted" ? chalk.yellow : chalk.red;
        console.log(`    ${chalk.dim("Diagnosis:")} ${severityColor(diagnosis.severity)} — ${diagnosis.sessionFocus}`);
      },
      onAgentPhase: (name, phase) => {
        console.log(`    ${chalk.dim(phase)}`);
      },
      onAgentComplete: (name, result) => {
        const icon = result.status === "completed" ? chalk.green(figures.tick) : chalk.red(figures.cross);
        const duration = (result.duration / 1000).toFixed(1);
        const recCount = result.recommendations.length;
        const applied = result.applied ? chalk.green("applied") : "";
        console.log(`  ${icon} ${chalk.bold(name)} — ${recCount} recommendations ${applied} ${chalk.dim(`(${duration}s)`)}`);
        console.log();
      },
      onAgentError: (name, error) => {
        console.log(`  ${chalk.red(figures.cross)} ${chalk.bold(name)}: ${chalk.red(error)}`);
        console.log();
      },
    },
  });

  // Fleet summary
  printFleetReport(report);
}

function printFleetReport(report: FleetTherapyReport): void {
  const duration = (report.totalDuration / 1000).toFixed(1);

  console.log();
  console.log(chalk.bold("  Group Therapy Report"));
  console.log(`  ${chalk.dim("-".repeat(56))}`);
  console.log();

  // Agent table
  console.log(
    `  ${chalk.dim("Agent".padEnd(20))} ${chalk.dim("Status".padEnd(12))} ${chalk.dim("Severity".padEnd(14))} ${chalk.dim("Recs".padEnd(6))} ${chalk.dim("Applied")}`,
  );
  console.log(`  ${chalk.dim("-".repeat(56))}`);

  for (const agent of report.agents) {
    const statusColor = agent.status === "completed" ? chalk.green :
      agent.status === "skipped" ? chalk.yellow : chalk.red;
    const severity = agent.preDiagnosis?.severity ?? "—";
    const severityColor = severity === "routine" ? chalk.green :
      severity === "targeted" ? chalk.yellow : chalk.red;
    const applied = agent.applied ? chalk.green(figures.tick) : chalk.dim("—");

    console.log(
      `  ${chalk.cyan(agent.agent.padEnd(20))} ${statusColor(agent.status.padEnd(12))} ${severityColor(severity.padEnd(14))} ${String(agent.recommendations.length).padEnd(6)} ${applied}`,
    );
  }

  console.log();

  // Fleet health
  const healthBefore = report.fleetHealthBefore;
  const healthAfter = report.fleetHealthAfter;
  const healthColor = (h: number) => h >= 80 ? chalk.green : h >= 50 ? chalk.yellow : chalk.red;

  console.log(`  ${chalk.bold("Fleet Health:")} ${healthColor(healthBefore)(healthBefore + "/100")} → ${healthColor(healthAfter)(healthAfter + "/100")} ${chalk.dim("(estimated)")}`);
  console.log();

  // Cross-agent patterns
  if (report.crossAgentPatterns.length > 0) {
    console.log(chalk.bold("  Cross-Agent Patterns"));
    for (const pattern of report.crossAgentPatterns) {
      console.log(`  ${chalk.yellow(figures.warning)} ${pattern}`);
    }
    console.log();
  }

  // Summary
  printBox(
    `${report.completedCount}/${report.agentCount} sessions completed in ${duration}s\n` +
    `${report.errorCount > 0 ? `${report.errorCount} error(s) — check agent logs\n` : ""}` +
    `Report saved: .holomime/fleet-therapy-report.json`,
    report.errorCount > 0 ? "warning" : "success",
    "Group Therapy Complete",
  );
  console.log();
}
