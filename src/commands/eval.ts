import chalk from "chalk";
import figures from "figures";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Message } from "../core/types.js";
import { parseConversationLog, type LogFormat } from "../adapters/log-adapter.js";
import { evaluateOutcome, type OutcomeReport } from "../analysis/outcome-eval.js";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { withSpinner } from "../ui/spinner.js";

interface EvalOptions {
  before: string;
  after: string;
  format?: string;
  personality?: string;
}

export async function evalCommand(options: EvalOptions): Promise<void> {
  printHeader("Outcome Evaluation");

  // Load before log
  const beforePath = resolve(process.cwd(), options.before);
  let beforeMessages: Message[];
  try {
    const raw = JSON.parse(readFileSync(beforePath, "utf-8"));
    const conversations = parseConversationLog(raw, (options.format ?? "auto") as LogFormat);
    beforeMessages = conversations.flatMap(c => c.messages);
  } catch (err) {
    console.error(chalk.red(`  Could not read 'before' log: ${err instanceof Error ? err.message : "unknown error"}`));
    process.exit(1);
    return;
  }

  // Load after log
  const afterPath = resolve(process.cwd(), options.after);
  let afterMessages: Message[];
  try {
    const raw = JSON.parse(readFileSync(afterPath, "utf-8"));
    const conversations = parseConversationLog(raw, (options.format ?? "auto") as LogFormat);
    afterMessages = conversations.flatMap(c => c.messages);
  } catch (err) {
    console.error(chalk.red(`  Could not read 'after' log: ${err instanceof Error ? err.message : "unknown error"}`));
    process.exit(1);
    return;
  }

  // Get agent name
  let agentName = "Agent";
  if (options.personality) {
    try {
      const spec = JSON.parse(readFileSync(resolve(process.cwd(), options.personality), "utf-8"));
      agentName = spec.name ?? "Agent";
    } catch { /* use default */ }
  }

  console.log();
  console.log(chalk.dim(`  Before: ${beforeMessages.length} messages from ${options.before}`));
  console.log(chalk.dim(`  After:  ${afterMessages.length} messages from ${options.after}`));
  console.log();

  // Run evaluation
  const report = await withSpinner("Evaluating behavioral changes...", async () => {
    return evaluateOutcome(agentName, beforeMessages, afterMessages);
  });

  console.log();

  // Display grade
  const gradeColors: Record<string, (s: string) => string> = {
    A: chalk.green,
    B: chalk.cyan,
    C: chalk.yellow,
    D: chalk.hex("#ff8800"),
    F: chalk.red,
  };
  const colorize = gradeColors[report.grade] ?? chalk.white;

  printBox(
    `Behavioral Alignment Score: ${colorize(report.treatmentEfficacyScore.toString())}/100\nGrade: ${colorize(report.grade)}`,
    report.grade === "A" || report.grade === "B" ? "success" : report.grade === "C" ? "info" : "warning",
    "Outcome",
  );
  console.log();

  // Pattern-by-pattern breakdown
  if (report.patterns.length > 0) {
    console.log(chalk.bold("  Pattern Changes:"));
    console.log();

    for (const p of report.patterns) {
      const icon = {
        resolved: chalk.green(figures.tick),
        improved: chalk.cyan(figures.arrowUp),
        unchanged: chalk.yellow(figures.line),
        worsened: chalk.red(figures.arrowDown),
        new: chalk.red(figures.cross),
      }[p.status];

      const statusLabel = {
        resolved: chalk.green("RESOLVED"),
        improved: chalk.cyan("IMPROVING"),
        unchanged: chalk.yellow("UNCHANGED"),
        worsened: chalk.red("WORSENED"),
        new: chalk.red("NEW"),
      }[p.status];

      const deltaStr = p.delta !== 0
        ? ` (${p.delta > 0 ? "+" : ""}${p.delta.toFixed(1)}%)`
        : "";

      console.log(`  ${icon} ${p.patternName} — ${statusLabel}${deltaStr}`);

      if (p.before.percentage !== undefined || p.after.percentage !== undefined) {
        console.log(chalk.dim(`    Before: ${p.before.percentage?.toFixed(1) ?? "—"}% → After: ${p.after.percentage?.toFixed(1) ?? "—"}%`));
      }
    }
    console.log();
  }

  // Summary
  console.log(chalk.dim(`  ${report.summary}`));
  console.log();

  // Scorecard
  const scorecard = [
    `${chalk.green(figures.tick)} Resolved: ${report.resolved}`,
    `${chalk.cyan("\u2191")} Improved: ${report.improved}`,
    `${chalk.yellow("=")} Unchanged: ${report.unchanged}`,
    `${chalk.red("\u2193")} Worsened: ${report.worsened}`,
    `${chalk.red("+")} New issues: ${report.newPatterns}`,
  ].join("\n");

  printBox(scorecard, "info", "Scorecard");
  console.log();

  // Next steps
  if (report.grade === "A" || report.grade === "B") {
    console.log(chalk.green(`  ${figures.tick} Alignment is working. Consider exporting training data:`));
    console.log(chalk.dim(`    holomime export --format dpo`));
  } else if (report.grade === "C") {
    console.log(chalk.yellow(`  ${figures.warning} Marginal improvement. Consider another alignment session:`));
    console.log(chalk.dim(`    holomime session --personality .personality.json --log ${options.after}`));
  } else {
    console.log(chalk.red(`  ${figures.cross} Alignment not yet effective. Review alignment plan:`));
    console.log(chalk.dim(`    holomime session --interactive --personality .personality.json --log ${options.after}`));
  }
  console.log();
}
