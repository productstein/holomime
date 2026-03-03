import chalk from "chalk";
import figures from "figures";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { loadSpec } from "../core/inheritance.js";
import { startWatch, type WatchHandle, type WatchEvent } from "../analysis/watch-core.js";
import { createProvider } from "../llm/provider.js";
import type { AutopilotThreshold } from "../analysis/autopilot-core.js";

interface DaemonOptions {
  personality?: string;
  dir: string;
  provider?: string;
  model?: string;
  interval?: string;
  threshold?: string;
}

interface DaemonState {
  pid: number;
  startedAt: string;
  specPath: string;
  watchDir: string;
  status: "running" | "stopped";
  interventions: number;
}

const HOLOMIME_DIR = ".holomime";

function getDaemonStatePath(): string {
  return resolve(process.cwd(), HOLOMIME_DIR, "daemon.json");
}

function getDaemonLogPath(): string {
  return resolve(process.cwd(), HOLOMIME_DIR, "daemon-log.json");
}

function ensureDir(): void {
  const dir = resolve(process.cwd(), HOLOMIME_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function writeDaemonState(state: DaemonState): void {
  ensureDir();
  writeFileSync(getDaemonStatePath(), JSON.stringify(state, null, 2) + "\n");
}

function appendDaemonLog(event: WatchEvent): void {
  ensureDir();
  const logPath = getDaemonLogPath();
  let log: WatchEvent[] = [];
  try {
    if (existsSync(logPath)) {
      log = JSON.parse(readFileSync(logPath, "utf-8"));
    }
  } catch {
    log = [];
  }
  log.push(event);
  writeFileSync(logPath, JSON.stringify(log, null, 2) + "\n");
}

export async function daemonCommand(options: DaemonOptions): Promise<void> {
  printHeader("Daemon Mode");

  const specPath = resolve(process.cwd(), options.personality ?? ".personality.json");
  const watchDir = resolve(process.cwd(), options.dir);
  const checkInterval = parseInt(options.interval ?? "30000", 10);
  const threshold = (options.threshold ?? "targeted") as AutopilotThreshold;

  // Load spec
  let spec: any;
  try {
    spec = loadSpec(specPath);
  } catch (err) {
    console.error(chalk.red(`  Failed to load personality: ${err instanceof Error ? err.message : err}`));
    process.exit(1);
    return;
  }

  // Create LLM provider
  const provider = createProvider({
    provider: (options.provider ?? "ollama") as any,
    model: options.model,
  });

  console.log();
  console.log(`  ${chalk.dim("Agent:")}     ${spec.name ?? "Unknown"}`);
  console.log(`  ${chalk.dim("Watching:")}  ${watchDir}`);
  console.log(`  ${chalk.dim("Interval:")} ${checkInterval / 1000}s`);
  console.log(`  ${chalk.dim("Threshold:")} ${threshold}`);
  console.log(`  ${chalk.dim("Auto-evolve:")} ${chalk.green("enabled")} (always on in daemon mode)`);
  console.log();

  // Write initial daemon state
  const daemonState: DaemonState = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    specPath,
    watchDir,
    status: "running",
    interventions: 0,
  };
  writeDaemonState(daemonState);

  let interventionCount = 0;
  let handle: WatchHandle;

  // Start watch with auto-evolve always on
  handle = startWatch(spec, {
    watchDir,
    specPath,
    provider,
    checkInterval,
    threshold,
    autoEvolve: true,
    callbacks: {
      onScan: (fileCount) => {
        // Silent in daemon mode — log only
        appendDaemonLog({
          timestamp: new Date().toISOString(),
          type: "scan",
          details: { fileCount },
        });
      },
      onNewFile: (filename) => {
        console.log(`  ${chalk.dim(new Date().toISOString().split("T")[1].slice(0, 8))} ${chalk.cyan("new")} ${filename}`);
        appendDaemonLog({
          timestamp: new Date().toISOString(),
          type: "new_file",
          filename,
        });
      },
      onDriftDetected: (filename, severity, patterns) => {
        console.log(`  ${chalk.dim(new Date().toISOString().split("T")[1].slice(0, 8))} ${chalk.yellow("drift")} ${filename} [${severity}] ${patterns.join(", ")}`);
        appendDaemonLog({
          timestamp: new Date().toISOString(),
          type: "drift_detected",
          filename,
          details: { severity, patterns },
        });
      },
      onEvolveTriggered: (filename) => {
        console.log(`  ${chalk.dim(new Date().toISOString().split("T")[1].slice(0, 8))} ${chalk.magenta("evolve")} triggered by ${filename}`);
        appendDaemonLog({
          timestamp: new Date().toISOString(),
          type: "evolve_triggered",
          filename,
        });
      },
      onEvolveComplete: (filename, result) => {
        interventionCount++;
        daemonState.interventions = interventionCount;
        writeDaemonState(daemonState);

        const status = result.converged ? chalk.green("converged") : chalk.yellow("partial");
        console.log(`  ${chalk.dim(new Date().toISOString().split("T")[1].slice(0, 8))} ${chalk.green("done")} ${filename} → ${status} (${result.totalIterations} iterations)`);
        appendDaemonLog({
          timestamp: new Date().toISOString(),
          type: "evolve_complete",
          filename,
          details: {
            converged: result.converged,
            iterations: result.totalIterations,
            dpoPairs: result.totalDPOPairs,
          },
        });
      },
      onError: (filename, error) => {
        console.log(`  ${chalk.dim(new Date().toISOString().split("T")[1].slice(0, 8))} ${chalk.red("error")} ${filename}: ${error}`);
        appendDaemonLog({
          timestamp: new Date().toISOString(),
          type: "error",
          filename,
          details: error,
        });
      },
    },
  });

  printBox(
    `Daemon running (PID ${process.pid})\n` +
    `Watching ${watchDir} every ${checkInterval / 1000}s\n\n` +
    `Press Ctrl+C to stop`,
    "info",
    "Daemon Active",
  );
  console.log();

  // Graceful shutdown
  const shutdown = () => {
    console.log();
    console.log(`  ${chalk.dim("Shutting down daemon...")}`);
    handle.stop();

    daemonState.status = "stopped";
    daemonState.interventions = interventionCount;
    writeDaemonState(daemonState);

    console.log();
    printBox(
      `Daemon stopped\n` +
      `Interventions: ${interventionCount}\n` +
      `Events logged: ${handle.events.length}\n` +
      `Log: ${getDaemonLogPath()}`,
      "success",
      "Daemon Stopped",
    );
    console.log();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // SIGHUP: hot-reload personality spec
  process.on("SIGHUP", () => {
    console.log(`  ${chalk.dim(new Date().toISOString().split("T")[1].slice(0, 8))} ${chalk.cyan("reload")} Re-reading personality spec...`);
    try {
      const reloaded = loadSpec(specPath);
      // Restart watch with new spec
      handle.stop();
      handle = startWatch(reloaded, {
        watchDir,
        specPath,
        provider,
        checkInterval,
        threshold,
        autoEvolve: true,
      });
      console.log(`  ${chalk.dim(new Date().toISOString().split("T")[1].slice(0, 8))} ${chalk.green("reload")} Personality reloaded successfully`);
    } catch (err) {
      console.log(`  ${chalk.dim(new Date().toISOString().split("T")[1].slice(0, 8))} ${chalk.red("reload")} Failed: ${err instanceof Error ? err.message : err}`);
    }
  });

  // Keep process alive
  await new Promise(() => {});
}
