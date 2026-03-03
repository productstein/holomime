import chalk from "chalk";
import figures from "figures";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import {
  loadFleetConfig,
  discoverAgents,
  startFleet,
  type FleetConfig,
  type FleetHandle,
} from "../analysis/fleet-core.js";
import { createProvider } from "../llm/provider.js";
import type { AutopilotThreshold } from "../analysis/autopilot-core.js";

interface FleetOptions {
  config?: string;
  dir?: string;
  provider?: string;
  model?: string;
  interval?: string;
  threshold?: string;
  autoEvolve?: boolean;
}

export async function fleetCommand(options: FleetOptions): Promise<void> {
  printHeader("Fleet Monitor");

  // Load fleet config from --config or auto-discover from --dir
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

  const checkInterval = parseInt(options.interval ?? "30000", 10);
  const threshold = (options.threshold ?? "targeted") as AutopilotThreshold;

  // Create LLM provider
  const provider = createProvider({
    provider: (options.provider ?? "ollama") as any,
    model: options.model,
  });

  console.log();
  console.log(chalk.bold(`  Fleet: ${config.agents.length} agent(s)`));
  console.log();
  for (const agent of config.agents) {
    console.log(`  ${chalk.cyan(figures.pointer)} ${chalk.bold(agent.name)}`);
    console.log(`    ${chalk.dim("Spec:")} ${agent.specPath}`);
    console.log(`    ${chalk.dim("Logs:")} ${agent.logDir}`);
  }
  console.log();

  let handle: FleetHandle;

  handle = startFleet(config, {
    provider,
    checkInterval,
    threshold,
    autoEvolve: options.autoEvolve,
    callbacks: {
      onAgentEvent: (agentName, event) => {
        const time = chalk.dim(new Date().toISOString().split("T")[1].slice(0, 8));
        const name = chalk.cyan(agentName.padEnd(16));

        switch (event.type) {
          case "new_file":
            console.log(`  ${time} ${name} ${chalk.dim("new")} ${event.filename}`);
            break;
          case "drift_detected":
            console.log(`  ${time} ${name} ${chalk.yellow("drift")} [${event.details?.severity}] ${event.details?.patterns?.join(", ") ?? ""}`);
            break;
          case "evolve_triggered":
            console.log(`  ${time} ${name} ${chalk.magenta("evolve")} triggered`);
            break;
          case "evolve_complete": {
            const status = event.details?.converged ? chalk.green("converged") : chalk.yellow("partial");
            console.log(`  ${time} ${name} ${chalk.green("done")} ${status} (${event.details?.iterations} iters)`);
            break;
          }
          case "error":
            console.log(`  ${time} ${name} ${chalk.red("error")} ${event.details}`);
            break;
        }
      },
      onError: (agentName, error) => {
        console.log(`  ${chalk.red(figures.cross)} ${chalk.cyan(agentName)}: ${error}`);
      },
    },
  });

  printBox(
    `Monitoring ${config.agents.length} agent(s) every ${checkInterval / 1000}s\n` +
    `Threshold: ${threshold} | Auto-evolve: ${options.autoEvolve ? "on" : "off"}\n\n` +
    `Press Ctrl+C for fleet summary`,
    "info",
    "Fleet Active",
  );
  console.log();

  // Graceful shutdown
  const shutdown = () => {
    console.log();
    console.log(chalk.dim("  Stopping fleet..."));
    handle.stop();

    const statuses = handle.getStatus();
    console.log();
    console.log(chalk.bold("  Fleet Summary"));
    console.log();

    // Table header
    console.log(
      `  ${chalk.dim("Agent".padEnd(20))} ${chalk.dim("Files".padEnd(8))} ${chalk.dim("Drift".padEnd(8))} ${chalk.dim("Evolve".padEnd(8))} ${chalk.dim("Errors".padEnd(8))} ${chalk.dim("Status")}`,
    );
    console.log(`  ${chalk.dim("-".repeat(68))}`);

    for (const status of statuses) {
      const driftColor = status.driftEvents > 0 ? chalk.yellow : chalk.green;
      const errorColor = status.errors > 0 ? chalk.red : chalk.green;
      const statusLabel = status.errors > 0
        ? chalk.red("errors")
        : status.driftEvents > 0
          ? chalk.yellow(status.lastDriftSeverity ?? "drift")
          : chalk.green("clean");

      console.log(
        `  ${chalk.cyan(status.name.padEnd(20))} ${String(status.filesProcessed).padEnd(8)} ${driftColor(String(status.driftEvents).padEnd(8))} ${String(status.evolveCount).padEnd(8)} ${errorColor(String(status.errors).padEnd(8))} ${statusLabel}`,
      );
    }

    console.log();

    // Save fleet log
    const logDir = resolve(process.cwd(), ".holomime");
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    const logPath = join(logDir, "fleet-log.json");
    writeFileSync(
      logPath,
      JSON.stringify({
        stoppedAt: new Date().toISOString(),
        agents: statuses,
        events: handle.events,
      }, null, 2) + "\n",
    );
    console.log(`  ${chalk.dim("Log saved:")} ${logPath}`);
    console.log();

    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep process alive
  await new Promise(() => {});
}
