import chalk from "chalk";
import figures from "figures";
import { resolve } from "node:path";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { createProvider } from "../llm/provider.js";
import { resolveOversight, type OversightMode } from "../core/oversight.js";
import {
  discoverNetworkAgents,
  loadNetworkConfig,
  runNetwork,
  type NetworkConfig,
  type NetworkNode,
  type PairingStrategy,
} from "../analysis/network-core.js";

interface NetworkOptions {
  dir?: string;
  config?: string;
  pairing?: string;
  therapist?: string;
  oversight?: string;
  provider?: string;
  model?: string;
  maxSessions?: string;
  convergence?: string;
  turns?: string;
  apply?: boolean;
  exportDpo?: string;
}

export async function networkCommand(options: NetworkOptions): Promise<void> {
  printHeader("Agent Network");

  // Load agents from --config or auto-discover from --dir
  let agents: NetworkNode[];

  if (options.config) {
    try {
      agents = loadNetworkConfig(resolve(process.cwd(), options.config));
    } catch (err) {
      console.error(chalk.red(`  Failed to load network config: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
      return;
    }
  } else if (options.dir) {
    try {
      agents = discoverNetworkAgents(resolve(process.cwd(), options.dir));
    } catch (err) {
      console.error(chalk.red(`  Failed to discover agents: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
      return;
    }
  } else {
    console.error(chalk.red("  Provide --config <network.json> or --dir <agents-directory>"));
    process.exit(1);
    return;
  }

  if (agents.length < 2) {
    printBox("Need at least 2 agents for network therapy. Check your config or directory.", "warning", "Not Enough Agents");
    console.log();
    return;
  }

  const pairing = (options.pairing ?? "severity") as PairingStrategy;
  const oversightMode = (options.oversight ?? "review") as OversightMode;
  const maxSessions = parseInt(options.maxSessions ?? "3", 10);
  const convergence = parseInt(options.convergence ?? "85", 10);
  const maxTurns = parseInt(options.turns ?? "20", 10);

  const provider = createProvider({
    provider: (options.provider ?? "ollama") as any,
    model: options.model,
  });

  const oversight = resolveOversight({ mode: oversightMode });

  console.log();
  console.log(chalk.bold(`  Network: ${agents.length} agent(s)`));
  console.log(chalk.dim(`  Strategy: ${pairing} | Oversight: ${oversightMode}`));
  console.log();

  for (const agent of agents) {
    console.log(`  ${chalk.cyan(figures.pointer)} ${chalk.bold(agent.name)}`);
    console.log(`    ${chalk.dim("Spec:")} ${agent.specPath}`);
    if (agent.logDir) console.log(`    ${chalk.dim("Logs:")} ${agent.logDir}`);
  }
  console.log();

  const config: NetworkConfig = {
    agents,
    pairing,
    oversight,
    therapistSpec: options.therapist ? resolve(process.cwd(), options.therapist) : undefined,
    maxSessionsPerAgent: maxSessions,
    convergenceThreshold: convergence,
    maxTurnsPerSession: maxTurns,
  };

  const result = await runNetwork(config, provider, {
    onPairingDecided: (therapist, patient, reason) => {
      console.log(`  ${chalk.green(figures.tick)} Paired: ${chalk.bold(therapist)} → ${chalk.bold(patient)}`);
      console.log(`    ${chalk.dim(reason)}`);
    },
    onSessionStart: (therapist, patient) => {
      console.log();
      console.log(`  ${chalk.cyan(figures.play)} Session: ${chalk.bold(therapist)} treating ${chalk.bold(patient)}`);
    },
    onSessionEnd: (session) => {
      const improved = session.postHealth > session.preHealth;
      const arrow = improved ? chalk.green("↑") : chalk.yellow("→");
      console.log(`    ${arrow} Health: ${session.preHealth} → ${session.postHealth} | DPO pairs: ${chalk.cyan(session.dpoPairsGenerated.toString())}`);
    },
    onApprovalNeeded: async (action) => {
      console.log(`  ${chalk.yellow(figures.warning)} Approval needed: ${action}`);
      // In CLI mode, auto-approve (interactive mode would prompt here)
      console.log(`    ${chalk.dim("Auto-approved (review mode)")}`);
      return true;
    },
    onThinking: (label) => {
      const msg = chalk.dim(`    ${label}...`);
      process.stdout.write(msg);
      return { stop: () => process.stdout.write("\r" + " ".repeat(msg.length) + "\r") };
    },
  });

  // Summary
  console.log();
  printBox(
    [
      `Sessions: ${result.sessions.length}`,
      `DPO pairs generated: ${chalk.cyan(result.totalDPOPairs.toString())}`,
      `Converged: ${result.converged ? chalk.green("Yes") : chalk.yellow("Not yet")}`,
      "",
      ...Array.from(result.agentImprovement.entries()).map(([name, imp]) => {
        const arrow = imp.after > imp.before ? chalk.green("↑") : chalk.yellow("→");
        return `  ${name}: ${imp.before} → ${imp.after} ${arrow}`;
      }),
    ].join("\n"),
    result.converged ? "success" : "info",
    "Network Results",
  );
  console.log();
}
