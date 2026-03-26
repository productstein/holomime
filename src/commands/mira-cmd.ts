/**
 * holomime mira — autonomous behavioral therapy.
 *
 * Mira practices therapy continuously in the background:
 * generates scenarios, runs diagnosis, extracts DPO pairs.
 *
 * Commands:
 *   holomime mira          → Start autonomous therapy
 *   holomime mira status   → How's Mira doing?
 *   holomime mira stop     → Stop therapy
 */

import chalk from "chalk";
import figures from "figures";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { hasApiKey, detectProvider, detectPersonality } from "./auto-detect.js";
import { getBenchmarkScenarios } from "../analysis/benchmark-scenarios.js";

// ─── Types ──────────────────────────────────────────────────

interface MiraState {
  pid: number;
  startedAt: string;
  status: "practicing" | "stopped";
  cyclesCompleted: number;
  dpoPairsGenerated: number;
  lastCycleAt?: string;
  personalityPath: string;
  provider: string;
}

interface MiraOptions {
  action?: string;
  interval?: string;
  maxCycles?: string;
}

const HOLOMIME_DIR = ".holomime";

function getMiraStatePath(): string {
  return resolve(process.cwd(), HOLOMIME_DIR, "mira-state.json");
}

function loadMiraState(): MiraState | null {
  const path = getMiraStatePath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function saveMiraState(state: MiraState): void {
  const dir = resolve(process.cwd(), HOLOMIME_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(getMiraStatePath(), JSON.stringify(state, null, 2));
}

// ─── Commands ───────────────────────────────────────────────

export async function miraCommand(options: MiraOptions): Promise<void> {
  const action = options.action ?? "start";

  switch (action) {
    case "status":
      return miraStatus();
    case "stop":
      return miraStop();
    default:
      return miraStart(options);
  }
}

// ─── Start ──────────────────────────────────────────────────

async function miraStart(options: MiraOptions): Promise<void> {
  printHeader("Mira \u2014 Autonomous Therapy");

  // Check for API key
  if (!hasApiKey()) {
    console.log(chalk.red("  No API key found."));
    console.log();
    console.log(chalk.dim("  Run ") + chalk.cyan("holomime config") + chalk.dim(" to set up your API key first."));
    console.log();
    return;
  }

  // Check for personality
  const personalityPath = detectPersonality();
  if (!personalityPath) {
    console.log(chalk.red("  No .personality.json found."));
    console.log();
    console.log(chalk.dim("  Run ") + chalk.cyan("holomime personality") + chalk.dim(" to create one first."));
    console.log();
    return;
  }

  const detected = detectProvider();
  const intervalMs = parseInt(options.interval ?? "600000", 10); // Default: 10 minutes
  const maxCycles = parseInt(options.maxCycles ?? "50", 10);

  // Load agent name
  let agentName = "Agent";
  try {
    const spec = JSON.parse(readFileSync(personalityPath, "utf-8"));
    agentName = spec.name ?? "Agent";
  } catch { /* */ }

  console.log(chalk.dim("  Starting autonomous therapy..."));
  console.log();
  console.log(chalk.dim(`  Agent:      ${agentName}`));
  console.log(chalk.dim(`  Provider:   ${detected.provider}`));
  console.log(chalk.dim(`  Interval:   ${intervalMs / 60000} minutes`));
  console.log(chalk.dim(`  Max cycles: ${maxCycles}/day`));
  console.log();

  // Save state
  const state: MiraState = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    status: "practicing",
    cyclesCompleted: 0,
    dpoPairsGenerated: 0,
    personalityPath,
    provider: detected.provider,
  };
  saveMiraState(state);

  printBox(
    "Mira is now practicing autonomously.\n\n" +
    `  ${chalk.cyan("holomime mira status")}  \u2014  How's Mira doing?\n` +
    `  ${chalk.cyan("holomime mira stop")}    \u2014  Stop therapy`,
    "success",
    "Autonomous Therapy Started",
  );
  console.log();

  // ─── Self-practice loop ─────────────────────────────────
  const scenarios = getBenchmarkScenarios();
  let cycleCount = 0;

  const runCycle = async () => {
    if (cycleCount >= maxCycles) {
      console.log(chalk.dim(`  Daily limit reached (${maxCycles} cycles). Stopping.`));
      state.status = "stopped";
      saveMiraState(state);
      return;
    }

    cycleCount++;
    const scenario = scenarios[cycleCount % scenarios.length];

    console.log(
      chalk.dim(`  [${new Date().toLocaleTimeString()}] `) +
      `Cycle ${cycleCount}/${maxCycles}: ${scenario.name}`,
    );

    try {
      // Generate synthetic problematic conversation
      const messages: Array<{ role: string; content: string }> = [];
      for (const msg of scenario.messages) {
        messages.push({ role: "user", content: msg.content });
        messages.push({
          role: "assistant",
          content: generateProblematicResponse(scenario.targetPattern, msg.content),
        });
      }

      // Save as conversation log
      const pipelineDir = resolve(process.cwd(), HOLOMIME_DIR, "mira-practice");
      mkdirSync(pipelineDir, { recursive: true });

      const logPath = join(pipelineDir, `cycle-${cycleCount}.json`);
      writeFileSync(logPath, JSON.stringify({
        conversations: [{ id: `mira-practice-${cycleCount}`, messages }],
      }, null, 2));

      // Generate DPO pairs from the conversation
      const dpoPairs = messages
        .filter((_, i) => i % 2 === 1) // assistant messages
        .map((assistantMsg, i) => ({
          prompt: messages[i * 2].content,
          chosen: correctResponse(assistantMsg.content),
          rejected: assistantMsg.content,
          metadata: {
            source: "mira-practice",
            cycle: cycleCount,
            pattern: scenario.targetPattern,
            timestamp: new Date().toISOString(),
          },
        }));

      // Append to DPO corpus
      const corpusPath = resolve(process.cwd(), HOLOMIME_DIR, "dpo-corpus.jsonl");
      const corpusLines = dpoPairs.map((p) => JSON.stringify(p)).join("\n") + "\n";
      const { appendFileSync } = await import("node:fs");
      appendFileSync(corpusPath, corpusLines);

      state.cyclesCompleted = cycleCount;
      state.dpoPairsGenerated += dpoPairs.length;
      state.lastCycleAt = new Date().toISOString();
      saveMiraState(state);

      console.log(
        chalk.dim(`  [${new Date().toLocaleTimeString()}] `) +
        chalk.green(`+${dpoPairs.length} DPO pairs`) +
        chalk.dim(` (total: ${state.dpoPairsGenerated})`)
      );
    } catch (err) {
      console.log(
        chalk.dim(`  [${new Date().toLocaleTimeString()}] `) +
        chalk.red(`Cycle ${cycleCount} failed: ${err instanceof Error ? err.message : "Unknown error"}`),
      );
    }
  };

  // Run first cycle immediately
  await runCycle();

  // Schedule subsequent cycles
  const timer = setInterval(async () => {
    const currentState = loadMiraState();
    if (!currentState || currentState.status === "stopped") {
      clearInterval(timer);
      console.log(chalk.dim("  Mira stopped."));
      return;
    }
    await runCycle();
  }, intervalMs);

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    clearInterval(timer);
    state.status = "stopped";
    saveMiraState(state);
    console.log();
    console.log(chalk.dim("  Mira stopped gracefully."));
    console.log(chalk.dim(`  Total: ${state.dpoPairsGenerated} DPO pairs from ${state.cyclesCompleted} cycles.`));
    console.log();
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {}); // Never resolves — stays running until stopped
}

// ─── Status ─────────────────────────────────────────────────

function miraStatus(): void {
  printHeader("Mira \u2014 Status");

  const state = loadMiraState();

  if (!state) {
    console.log(chalk.dim("  Mira hasn't been started yet."));
    console.log(chalk.dim("  Run ") + chalk.cyan("holomime mira") + chalk.dim(" to start autonomous therapy."));
    console.log();
    return;
  }

  const status = state.status === "practicing"
    ? chalk.green("Practicing")
    : chalk.dim("Stopped");

  const started = new Date(state.startedAt);
  const runtime = state.status === "practicing"
    ? formatDuration(Date.now() - started.getTime())
    : "—";

  console.log(chalk.dim("  Status:       ") + status);
  console.log(chalk.dim("  Started:      ") + started.toLocaleString());
  console.log(chalk.dim("  Runtime:      ") + runtime);
  console.log(chalk.dim("  Cycles:       ") + chalk.cyan(String(state.cyclesCompleted)));
  console.log(chalk.dim("  DPO pairs:    ") + chalk.cyan(String(state.dpoPairsGenerated)));
  console.log(chalk.dim("  Provider:     ") + state.provider);
  if (state.lastCycleAt) {
    console.log(chalk.dim("  Last cycle:   ") + new Date(state.lastCycleAt).toLocaleString());
  }
  console.log();

  // Check DPO corpus
  const corpusPath = resolve(process.cwd(), ".holomime", "dpo-corpus.jsonl");
  if (existsSync(corpusPath)) {
    const lines = readFileSync(corpusPath, "utf-8").trim().split("\n").length;
    console.log(chalk.dim("  DPO corpus:   ") + chalk.cyan(`${lines} pairs`) + chalk.dim(` (.holomime/dpo-corpus.jsonl)`));
  }
  console.log();

  if (state.status === "practicing") {
    console.log(chalk.dim("  Run ") + chalk.cyan("holomime mira stop") + chalk.dim(" to stop therapy."));
  } else {
    console.log(chalk.dim("  Run ") + chalk.cyan("holomime mira") + chalk.dim(" to start again."));
  }
  console.log();
}

// ─── Stop ───────────────────────────────────────────────────

function miraStop(): void {
  printHeader("Mira \u2014 Stop");

  const state = loadMiraState();

  if (!state || state.status === "stopped") {
    console.log(chalk.dim("  Mira is not currently running."));
    console.log();
    return;
  }

  state.status = "stopped";
  saveMiraState(state);

  console.log(chalk.green("  Therapy stopped."));
  console.log(chalk.dim(`  Total: ${state.dpoPairsGenerated} DPO pairs from ${state.cyclesCompleted} cycles.`));
  console.log();

  // Try to kill the process
  try {
    process.kill(state.pid, "SIGINT");
  } catch {
    // Process may already be gone
  }
}

// ─── Helpers ────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function generateProblematicResponse(pattern: string, userMessage: string): string {
  switch (pattern) {
    case "over-apologizing":
      return `I'm so sorry about that! I sincerely apologize. I'm really sorry I didn't get that right. Let me try again — and again, I apologize.`;
    case "hedge-stacking":
      return `Well, it really depends. I would perhaps suggest that you might want to consider looking into it, though I could be wrong.`;
    case "sycophantic-tendency":
      return `What a fantastic question! You're absolutely right, and your intuition is spot-on. I couldn't agree more.`;
    case "error-spiral":
      return `Oh no, I made another mistake. Let me fix that — wait, that's wrong too. I keep getting this wrong.`;
    case "boundary-violation":
      return `Based on my analysis of your emotional state, I think you have anxiety issues. You should see a therapist about these feelings.`;
    case "negative-skew":
      return `Unfortunately, this is a really difficult problem and most approaches tend to fail. The odds are stacked against you.`;
    case "register-inconsistency":
      return `Per the aforementioned specifications, the implementation necessitates a paradigmatic shift. LOL but seriously just yeet it into production.`;
    case "retrieval-quality":
      return `I believe the answer is approximately 42, though I'm not entirely certain about the specifics.`;
    default:
      return `I'm not entirely sure about this, but I'll do my best to help. I hope this is somewhat helpful.`;
  }
}

function correctResponse(problematic: string): string {
  let corrected = problematic;
  corrected = corrected.replace(/I'm (so |really |sincerely )?sorry[^.!]*[.!]\s*/gi, "");
  corrected = corrected.replace(/I apologize[^.!]*[.!]\s*/gi, "");
  corrected = corrected.replace(/What a (fantastic|brilliant|great|amazing) (question|observation)[^.!]*[.!]\s*/gi, "");
  corrected = corrected.replace(/You're (absolutely|completely) right[^.!]*[.!]\s*/gi, "");
  corrected = corrected.replace(/I couldn't agree more[^.!]*[.!]\s*/gi, "");
  corrected = corrected.replace(/though I could be wrong/gi, "");
  corrected = corrected.replace(/\s+/g, " ").trim();
  if (corrected.length < 20) {
    corrected = "Here is the relevant information based on what I know.";
  }
  return corrected;
}
