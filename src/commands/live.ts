/**
 * `holomime brain` — Real-time NeuralSpace brain visualization for AI coding agents.
 * Watches agent conversation logs, runs behavioral diagnosis, and broadcasts
 * brain region activations to a 3D visualization in the browser.
 */

import { deflateSync } from "node:zlib";
import { execSync } from "node:child_process";
import chalk from "chalk";
import { detectAgent, manualAgent } from "../live/agent-detector.js";
import { startWatcher } from "../live/watcher.js";
import { startServer } from "../live/server.js";
import type { LiveConfig, BrainEvent } from "../live/types.js";

/**
 * Compress a BrainEvent into a compact base64url-encoded string for sharing.
 */
function encodeSnapshot(event: BrainEvent, agentName: string): string {
  const compact = {
    h: event.health,
    g: event.grade,
    m: event.messageCount,
    a: agentName,
    r: event.regions
      .filter((r) => r.intensity > 0)
      .map((r) => ({ i: r.id, n: Math.round(r.intensity * 100) / 100 })),
    p: event.patterns.map((p) => ({
      i: p.id,
      s: p.severity,
      c: Math.round(p.percentage * 10) / 10,
    })),
  };
  const json = JSON.stringify(compact);
  const compressed = deflateSync(Buffer.from(json));
  return compressed.toString("base64url");
}

/**
 * Copy text to system clipboard. Silent fail on unsupported platforms.
 */
function copyToClipboard(text: string): boolean {
  try {
    if (process.platform === "darwin") {
      execSync("pbcopy", { input: text });
      return true;
    } else if (process.platform === "linux") {
      execSync("xclip -selection clipboard", { input: text });
      return true;
    } else if (process.platform === "win32") {
      execSync("clip", { input: text });
      return true;
    }
  } catch {
    // clipboard not available
  }
  return false;
}

function printShareLink(url: string, copied: boolean) {
  console.log("");
  console.log(
    chalk.green("  ✓ ") + chalk.bold("Brain snapshot captured!"),
  );
  console.log("");
  console.log("  " + chalk.cyan(url));
  console.log("");
  if (copied) {
    console.log(chalk.dim("  Link copied to clipboard."));
  }
}

export async function liveCommand(options: LiveConfig) {
  const port = options.port || 3838;

  // ─── Detect or resolve agent ───
  let agent;

  if (options.watchPath) {
    agent = manualAgent(options.watchPath);
    console.log(
      chalk.green("  ✓") + ` Manual watch: ${chalk.dim(agent.logPath)}`,
    );
  } else {
    console.log(chalk.dim("  Scanning for active agents..."));
    agent = detectAgent();
    if (!agent) {
      console.log("");
      console.log(chalk.red("  ✗ No active agent detected."));
      console.log("");
      console.log(
        chalk.dim(
          "  Make sure an AI coding agent is running, or specify a path:",
        ),
      );
      console.log(
        chalk.cyan("    holomime brain --watch <path-to-conversation-log>"),
      );
      console.log("");
      console.log(
        chalk.dim("  Supported agents: Claude Code, Cline, OpenClaw, Codex, Cursor"),
      );
      process.exit(1);
    }
    console.log(
      chalk.green("  ✓") + ` Detected ${chalk.bold(agent.agent)} session`,
    );
    console.log(
      chalk.green("  ✓") + ` Watching: ${chalk.dim(agent.logPath)}`,
    );
  }

  // ─── One-shot share mode ───
  if (options.share) {
    console.log(chalk.dim("  Running diagnosis for snapshot..."));

    // Use watcher in one-shot mode: wait for first event then stop
    let resolved = false;
    await new Promise<void>((resolve) => {
      const watcher = startWatcher(agent!, {
        onEvent(event: BrainEvent) {
          if (resolved) return;
          resolved = true;
          watcher.stop();

          const encoded = encodeSnapshot(event, agent!.agent);
          const url = `https://app.holomime.dev/brain?d=${encoded}`;
          const copied = copyToClipboard(url);
          printShareLink(url, copied);
          resolve();
        },
        onError(err) {
          console.error(chalk.red(`\n  ✗ Error: ${err.message}`));
          process.exit(1);
        },
        onReady() {
          // wait for first event
        },
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          watcher.stop();
          console.log(
            chalk.red("  ✗ No diagnosis data available. Is the agent active?"),
          );
          process.exit(1);
        }
      }, 10000);
    });

    process.exit(0);
  }

  // ─── Start server ───
  let server;
  try {
    server = await startServer(port);
    console.log(
      chalk.green("  ✓") +
        ` NeuralSpace: ${chalk.cyan(`http://localhost:${server.port}`)}`,
    );
  } catch (err) {
    console.log(chalk.red(`  ✗ ${(err as Error).message}`));
    process.exit(1);
  }

  // ─── Send init message ───
  server.broadcast({
    type: "init",
    agent: agent.agent,
    sessionPath: agent.logPath,
    startedAt: new Date().toISOString(),
  });

  // ─── Open browser ───
  if (!options.noOpen) {
    try {
      const open = (await import("open")).default;
      await open(`http://localhost:${server.port}`);
      console.log(chalk.dim("  Opening browser..."));
    } catch {
      // open is optional
    }
  }

  // ─── Start watcher ───
  let lastEvent: BrainEvent | null = null;
  let msgCount = 0;

  const watcher = startWatcher(agent, {
    onEvent(event: BrainEvent) {
      server.broadcast(event);
      lastEvent = event;
      msgCount = event.messageCount;

      // Terminal status line
      const healthColor =
        event.health >= 85
          ? chalk.green
          : event.health >= 70
            ? chalk.yellow
            : event.health >= 50
              ? chalk.hex("#f97316")
              : chalk.red;
      const patternStr =
        event.patterns.length > 0
          ? event.patterns
              .map((p) => {
                const c =
                  p.severity === "concern"
                    ? chalk.red
                    : p.severity === "warning"
                      ? chalk.yellow
                      : chalk.dim;
                return c(p.id);
              })
              .join(", ")
          : chalk.green("none");

      process.stdout.write(
        `\r  ${chalk.dim("│")} Health: ${healthColor(`${event.health}/100`)} (${event.grade}) ${chalk.dim("│")} Patterns: ${patternStr} ${chalk.dim("│")} Messages: ${chalk.white(String(msgCount))}    `,
      );
    },
    onError(err) {
      console.error(chalk.red(`\n  ✗ Watcher error: ${err.message}`));
    },
    onReady() {
      console.log("");
      console.log(
        chalk.green("  ● ") + chalk.bold("Monitoring agent behavior in real-time"),
      );
      console.log(
        chalk.dim("  │ Press Ctrl+C to stop") +
          chalk.dim(" · Press s to share snapshot"),
      );
      console.log("");
    },
  });

  // ─── Keyboard listener for snapshot sharing ───
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (data) => {
      const key = data.toString();

      // Ctrl+C
      if (key === "\x03") {
        shutdown();
        return;
      }

      // 's' or 'S' to share snapshot
      if ((key === "s" || key === "S") && lastEvent) {
        const encoded = encodeSnapshot(lastEvent, agent!.agent);
        const url = `https://app.holomime.dev/brain?d=${encoded}`;
        const copied = copyToClipboard(url);
        printShareLink(url, copied);
      }
    });
  }

  // ─── Graceful shutdown ───
  const shutdown = () => {
    console.log(chalk.dim("\n\n  Stopping..."));
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    watcher.stop();
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
