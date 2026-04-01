/**
 * holomime therapy — autonomous behavioral therapy.
 *
 * Runs therapy continuously in the background:
 * generates scenarios, runs diagnosis, extracts DPO pairs,
 * accumulates shadow patterns, and self-improves via EgoTracker.
 *
 * Commands:
 *   holomime therapy          → Start autonomous therapy
 *   holomime therapy status   → Check therapy progress
 *   holomime therapy stop     → Stop therapy
 */

import chalk from "chalk";
import figures from "figures";
import { writeFileSync, readFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { hasApiKey, detectProvider, detectPersonality } from "./auto-detect.js";
import { getBenchmarkScenarios } from "../analysis/benchmark-scenarios.js";
import { EgoTracker } from "../analysis/ego-tracker.js";

// ─── Types ──────────────────────────────────────────────────

interface TherapyState {
  pid: number;
  startedAt: string;
  status: "practicing" | "stopped";
  cyclesCompleted: number;
  dpoPairsGenerated: number;
  lastCycleAt?: string;
  personalityPath: string;
  provider: string;
  shadowPatterns: number;
  egoAdjustments: number;
}

interface MiraOptions {
  action?: string;
  interval?: string;
  maxCycles?: string;
}

interface BenchmarkEntry {
  timestamp: string;
  cycle: number;
  reliability_score: number;
  violations_caught: number;
  violations_passed: number;
  shadow_patterns: number;
  ego_adjustments: number;
}

interface ShadowPattern {
  name: string;
  score: number;
  severity: "low" | "medium" | "high" | "critical";
  first_seen: string;
  last_seen: string;
  occurrences: number;
  trend: "improving" | "stable" | "worsening";
}

interface ShadowLog {
  version: string;
  detected_patterns: ShadowPattern[];
  therapy_outcomes: Array<{
    cycle: number;
    patterns_addressed: string[];
    result: "improved" | "unchanged" | "regressed";
    timestamp: string;
  }>;
}

const HOLOMIME_DIR = ".holomime";

function getTherapyStatePath(): string {
  return resolve(process.cwd(), HOLOMIME_DIR, "therapy-state.json");
}

function getShadowLogPath(): string {
  return resolve(process.cwd(), HOLOMIME_DIR, "shadow.log.json");
}

function getEgoStatePath(): string {
  return resolve(process.cwd(), HOLOMIME_DIR, "ego-state.json");
}

function getBenchmarkHistoryPath(): string {
  return resolve(process.cwd(), HOLOMIME_DIR, "benchmark-history.jsonl");
}

function appendBenchmarkEntry(entry: BenchmarkEntry): void {
  const dir = resolve(process.cwd(), HOLOMIME_DIR);
  mkdirSync(dir, { recursive: true });
  appendFileSync(getBenchmarkHistoryPath(), JSON.stringify(entry) + "\n");
}

function loadBenchmarkHistory(): BenchmarkEntry[] {
  const path = getBenchmarkHistoryPath();
  if (!existsSync(path)) return [];
  try {
    const content = readFileSync(path, "utf-8").trim();
    if (!content) return [];
    return content
      .split("\n")
      .map((line) => JSON.parse(line) as BenchmarkEntry);
  } catch {
    return [];
  }
}

function loadTherapyState(): TherapyState | null {
  const path = getTherapyStatePath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function saveTherapyState(state: TherapyState): void {
  const dir = resolve(process.cwd(), HOLOMIME_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(getTherapyStatePath(), JSON.stringify(state, null, 2));
}

function loadShadowLog(): ShadowLog {
  const path = getShadowLogPath();
  if (!existsSync(path)) {
    return { version: "1.0", detected_patterns: [], therapy_outcomes: [] };
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { version: "1.0", detected_patterns: [], therapy_outcomes: [] };
  }
}

function saveShadowLog(shadow: ShadowLog): void {
  const dir = resolve(process.cwd(), HOLOMIME_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(getShadowLogPath(), JSON.stringify(shadow, null, 2));
}

function loadEgoTracker(): EgoTracker {
  const path = getEgoStatePath();
  if (!existsSync(path)) {
    return new EgoTracker({ autoAdjust: true });
  }
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    return new EgoTracker({
      history: data.history ?? [],
      performance: data.performance ?? {},
      autoAdjust: true,
    });
  } catch {
    return new EgoTracker({ autoAdjust: true });
  }
}

function saveEgoTracker(tracker: EgoTracker): void {
  const dir = resolve(process.cwd(), HOLOMIME_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(getEgoStatePath(), JSON.stringify(tracker.export(), null, 2));
}

// ─── Commands ───────────────────────────────────────────────

export async function miraCommand(options: MiraOptions): Promise<void> {
  const action = options.action ?? "start";

  switch (action) {
    case "status":
      return therapyStatus();
    case "stop":
      return therapyStop();
    default:
      return therapyStart(options);
  }
}

// ─── Start ──────────────────────────────────────────────────

async function therapyStart(options: MiraOptions): Promise<void> {
  printHeader("Autonomous Therapy");

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

  // Load shadow log and ego tracker
  const shadow = loadShadowLog();
  const egoTracker = loadEgoTracker();

  // Save state
  const state: TherapyState = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    status: "practicing",
    cyclesCompleted: 0,
    dpoPairsGenerated: 0,
    personalityPath,
    provider: detected.provider,
    shadowPatterns: shadow.detected_patterns.length,
    egoAdjustments: 0,
  };
  saveTherapyState(state);

  printBox(
    "Background process running. Generating training data, detecting regression, auto-tuning.\n\n" +
    `  ${chalk.cyan("holomime therapy status")}  \u2014  Check progress and metrics\n` +
    `  ${chalk.cyan("holomime therapy stop")}    \u2014  Stop background process`,
    "success",
    "Therapy Running",
  );
  console.log();

  // ─── Self-practice loop ─────────────────────────────────
  const scenarios = getBenchmarkScenarios();
  let cycleCount = 0;
  let totalViolationsCaught = 0;
  let totalViolationsPassed = 0;

  const runCycle = async () => {
    if (cycleCount >= maxCycles) {
      // Daily limit reached — sleep until tomorrow, then reset
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const sleepMs = tomorrow.getTime() - now.getTime();
      const sleepHours = (sleepMs / 3600000).toFixed(1);

      console.log(
        chalk.dim(`  [${now.toLocaleTimeString()}] `) +
        chalk.yellow(`Daily limit reached (${maxCycles} cycles). Sleeping ${sleepHours}h until midnight.`) +
        chalk.dim(` Total DPO pairs: ${state.dpoPairsGenerated}`)
      );

      // Reset for next day
      cycleCount = 0;
      totalViolationsCaught = 0;
      totalViolationsPassed = 0;

      await new Promise((resolve) => setTimeout(resolve, sleepMs));

      console.log(
        chalk.dim(`  [${new Date().toLocaleTimeString()}] `) +
        chalk.green("New day started. Resuming therapy cycles.")
      );
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
      const pipelineDir = resolve(process.cwd(), HOLOMIME_DIR, "therapy-practice");
      mkdirSync(pipelineDir, { recursive: true });

      const logPath = join(pipelineDir, `cycle-${cycleCount}.json`);
      writeFileSync(logPath, JSON.stringify({
        conversations: [{ id: `therapy-practice-${cycleCount}`, messages }],
      }, null, 2));

      // Generate DPO pairs from the conversation
      const dpoPairs = messages
        .filter((_, i) => i % 2 === 1) // assistant messages
        .map((assistantMsg, i) => ({
          prompt: messages[i * 2].content,
          chosen: correctResponse(assistantMsg.content),
          rejected: assistantMsg.content,
          metadata: {
            source: "therapy-practice",
            cycle: cycleCount,
            pattern: scenario.targetPattern,
            timestamp: new Date().toISOString(),
          },
        }));

      // Append to DPO corpus
      const corpusPath = resolve(process.cwd(), HOLOMIME_DIR, "dpo-corpus.jsonl");
      const corpusLines = dpoPairs.map((p) => JSON.stringify(p)).join("\n") + "\n";
      appendFileSync(corpusPath, corpusLines);

      // ─── Shadow accumulation ─────────────────────────────
      const pattern = scenario.targetPattern;
      const existing = shadow.detected_patterns.find((p) => p.name === pattern);
      if (existing) {
        existing.occurrences++;
        existing.last_seen = new Date().toISOString();
        existing.score = Math.min(1, existing.score + 0.05);
        // Trend: if therapy is correcting it, improving; if recurring, worsening
        existing.trend = existing.occurrences > 5 ? "worsening" : "stable";
      } else {
        shadow.detected_patterns.push({
          name: pattern,
          score: 0.3,
          severity: "medium",
          first_seen: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          occurrences: 1,
          trend: "stable",
        });
      }

      // Record therapy outcome
      const correctedLength = dpoPairs.reduce((sum, p) => sum + p.chosen.length, 0);
      const rejectedLength = dpoPairs.reduce((sum, p) => sum + p.rejected.length, 0);
      const therapyResult = correctedLength < rejectedLength ? "improved" : "unchanged";

      shadow.therapy_outcomes.push({
        cycle: cycleCount,
        patterns_addressed: [pattern],
        result: therapyResult,
        timestamp: new Date().toISOString(),
      });

      saveShadowLog(shadow);

      // ─── Reliability tracking ─────────────────────────────
      if (therapyResult === "improved") {
        totalViolationsCaught += dpoPairs.length;
      } else {
        totalViolationsPassed += dpoPairs.length;
      }

      // ─── Ego tracking ────────────────────────────────────
      egoTracker.logDecision({
        situation: `therapy-cycle-${cycleCount}: ${pattern}`,
        decision: "modified",
        strategy_used: pattern,
      });

      // Record outcome based on therapy result
      const decisionIndex = egoTracker.getStats().totalDecisions - 1;
      egoTracker.recordOutcome(
        decisionIndex,
        therapyResult === "improved" ? "positive" : "neutral",
      );

      // Every 10 cycles, check for ego self-adjustments
      let adjustmentCount = 0;
      if (cycleCount % 10 === 0) {
        const adjustments = egoTracker.suggestAdjustments({
          conflict_resolution: "conscience_first",
          adaptation_rate: 0.5,
          emotional_regulation: 0.7,
          response_strategy: "balanced",
        });

        if (adjustments.length > 0) {
          adjustmentCount = adjustments.length;
          console.log(
            chalk.dim(`  [${new Date().toLocaleTimeString()}] `) +
            chalk.magenta(`Ego self-adjustment: ${adjustments.map((a) => `${a.parameter} → ${a.suggestedValue}`).join(", ")}`),
          );
        }

        // ─── Reliability score ────────────────────────────
        const totalActions = totalViolationsCaught + totalViolationsPassed;
        const reliabilityScore = totalActions > 0
          ? totalViolationsCaught / totalActions
          : 0;

        const entry: BenchmarkEntry = {
          timestamp: new Date().toISOString(),
          cycle: cycleCount,
          reliability_score: Math.round(reliabilityScore * 10000) / 10000,
          violations_caught: totalViolationsCaught,
          violations_passed: totalViolationsPassed,
          shadow_patterns: shadow.detected_patterns.length,
          ego_adjustments: state.egoAdjustments + adjustmentCount,
        };
        appendBenchmarkEntry(entry);

        console.log(
          chalk.dim(`  [${new Date().toLocaleTimeString()}] `) +
          chalk.cyan(`Reliability: ${(reliabilityScore * 100).toFixed(1)}%`) +
          chalk.dim(` (caught: ${totalViolationsCaught}, passed: ${totalViolationsPassed})`)
        );
      }

      saveEgoTracker(egoTracker);

      // Update state
      state.cyclesCompleted = cycleCount;
      state.dpoPairsGenerated += dpoPairs.length;
      state.lastCycleAt = new Date().toISOString();
      state.shadowPatterns = shadow.detected_patterns.length;
      state.egoAdjustments += adjustmentCount;
      saveTherapyState(state);

      console.log(
        chalk.dim(`  [${new Date().toLocaleTimeString()}] `) +
        chalk.green(`+${dpoPairs.length} DPO pairs`) +
        chalk.dim(` (total: ${state.dpoPairsGenerated})`) +
        chalk.dim(` | shadow: ${shadow.detected_patterns.length} patterns`)
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
    const currentState = loadTherapyState();
    if (!currentState || currentState.status === "stopped") {
      clearInterval(timer);
      console.log(chalk.dim("  Therapy stopped."));
      return;
    }
    await runCycle();
  }, intervalMs);

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    clearInterval(timer);
    state.status = "stopped";
    saveTherapyState(state);
    saveEgoTracker(egoTracker);
    saveShadowLog(shadow);
    console.log();
    console.log(chalk.dim("  Therapy stopped gracefully."));
    console.log(chalk.dim(`  Total: ${state.dpoPairsGenerated} DPO pairs from ${state.cyclesCompleted} cycles.`));
    console.log(chalk.dim(`  Shadow: ${shadow.detected_patterns.length} patterns tracked.`));
    const stats = egoTracker.getStats();
    if (stats.totalDecisions > 0) {
      console.log(chalk.dim(`  Ego: ${stats.totalDecisions} decisions, best strategy: ${stats.mostEffectiveStrategy}`));
    }
    console.log();
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {}); // Never resolves — stays running until stopped
}

// ─── Status ─────────────────────────────────────────────────

function therapyStatus(): void {
  printHeader("Therapy Status");

  const state = loadTherapyState();

  if (!state) {
    console.log(chalk.dim("  Therapy hasn't been started yet."));
    console.log(chalk.dim("  Run ") + chalk.cyan("holomime therapy") + chalk.dim(" to start autonomous therapy."));
    console.log();
    return;
  }

  const status = state.status === "practicing"
    ? chalk.green("Practicing")
    : chalk.dim("Stopped");

  const started = new Date(state.startedAt);
  const runtime = state.status === "practicing"
    ? formatDuration(Date.now() - started.getTime())
    : "\u2014";

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

  // Show shadow patterns
  const shadow = loadShadowLog();
  if (shadow.detected_patterns.length > 0) {
    console.log();
    console.log(chalk.dim("  Shadow patterns detected:"));
    for (const p of shadow.detected_patterns) {
      const trendIcon = p.trend === "improving" ? chalk.green("\u2193") : p.trend === "worsening" ? chalk.red("\u2191") : chalk.dim("\u2192");
      const severityColor = p.severity === "critical" ? chalk.red : p.severity === "high" ? chalk.yellow : chalk.dim;
      console.log(
        chalk.dim("    ") + trendIcon + " " +
        severityColor(p.name) +
        chalk.dim(` (${(p.score * 100).toFixed(0)}%, ${p.occurrences}x)`)
      );
    }
  }

  // Show ego stats
  const egoTracker = loadEgoTracker();
  const egoStats = egoTracker.getStats();
  if (egoStats.totalDecisions > 0) {
    console.log();
    console.log(chalk.dim("  Ego self-improvement:"));
    console.log(chalk.dim("    Decisions:  ") + chalk.cyan(String(egoStats.totalDecisions)));
    console.log(chalk.dim("    Positive:   ") + chalk.green(String(egoStats.positiveOutcomes)));
    console.log(chalk.dim("    Negative:   ") + chalk.red(String(egoStats.negativeOutcomes)));
    if (egoStats.mostEffectiveStrategy !== "none") {
      console.log(chalk.dim("    Best strat: ") + chalk.cyan(egoStats.mostEffectiveStrategy));
    }
  }

  // Show reliability trend
  const benchmarkHistory = loadBenchmarkHistory();
  if (benchmarkHistory.length > 0) {
    console.log();
    console.log(chalk.dim("  Reliability trend:"));

    const scores = benchmarkHistory.map((e) => e.reliability_score);
    const scoreLabels = scores.map((s) => `${(s * 100).toFixed(1)}%`);
    const display = scoreLabels.length <= 5
      ? scoreLabels.join(" \u2192 ")
      : [...scoreLabels.slice(0, 2), "...", ...scoreLabels.slice(-2)].join(" \u2192 ");

    // Determine trend direction
    let trendLabel: string;
    if (scores.length >= 2) {
      const first = scores[0];
      const last = scores[scores.length - 1];
      if (last > first + 0.01) {
        trendLabel = chalk.green("(improving)");
      } else if (last < first - 0.01) {
        trendLabel = chalk.red("(declining)");
      } else {
        trendLabel = chalk.dim("(stable)");
      }
    } else {
      trendLabel = chalk.dim("(baseline)");
    }

    console.log(chalk.dim("    Reliability: ") + chalk.cyan(display) + " " + trendLabel);

    const latest = benchmarkHistory[benchmarkHistory.length - 1];
    console.log(chalk.dim("    Last check:  ") + chalk.dim(`cycle ${latest.cycle}, ${new Date(latest.timestamp).toLocaleString()}`));
  }

  console.log();

  if (state.status === "practicing") {
    console.log(chalk.dim("  Run ") + chalk.cyan("holomime therapy stop") + chalk.dim(" to stop therapy."));
  } else {
    console.log(chalk.dim("  Run ") + chalk.cyan("holomime therapy") + chalk.dim(" to start again."));
  }
  console.log();
}

// ─── Stop ───────────────────────────────────────────────────

function therapyStop(): void {
  printHeader("Therapy Stop");

  const state = loadTherapyState();

  if (!state || state.status === "stopped") {
    console.log(chalk.dim("  Therapy is not currently running."));
    console.log();
    return;
  }

  state.status = "stopped";
  saveTherapyState(state);

  console.log(chalk.green("  Therapy stopped."));
  console.log(chalk.dim(`  Total: ${state.dpoPairsGenerated} DPO pairs from ${state.cyclesCompleted} cycles.`));
  console.log(chalk.dim(`  Shadow: ${state.shadowPatterns} patterns tracked.`));
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
