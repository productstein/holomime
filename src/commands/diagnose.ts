import chalk from "chalk";
import figures from "figures";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Message, type DetectedPattern } from "../core/types.js";
import { detectApologies } from "../analysis/rules/apology-detector.js";
import { detectHedging } from "../analysis/rules/hedge-detector.js";
import { detectSentiment } from "../analysis/rules/sentiment.js";
import { detectVerbosity } from "../analysis/rules/verbosity.js";
import { detectBoundaryIssues } from "../analysis/rules/boundary.js";
import { showSoftUpsell } from "../ui/tier.js";
import { detectRecoveryPatterns } from "../analysis/rules/recovery.js";
import { detectFormalityIssues } from "../analysis/rules/formality.js";
import { printHeader } from "../ui/branding.js";
import { withSpinner } from "../ui/spinner.js";
import { printBox } from "../ui/boxes.js";
import { printPatternIndicator, printHealthyIndicator } from "../ui/progress.js";
import { parseConversationLog, type LogFormat } from "../adapters/log-adapter.js";

interface DiagnoseOptions {
  log: string;
  format?: string;
}

export async function diagnoseCommand(options: DiagnoseOptions): Promise<void> {
  const logPath = resolve(process.cwd(), options.log);

  let raw: string;
  try {
    raw = readFileSync(logPath, "utf-8");
  } catch {
    console.error(chalk.red(`  Could not read log file: ${options.log}`));
    process.exit(1);
    return;
  }

  let conversations;
  try {
    conversations = parseConversationLog(JSON.parse(raw), (options.format ?? "auto") as LogFormat);
  } catch (err) {
    console.error(chalk.red(`  ${err instanceof Error ? err.message : "Invalid conversation log format."}`));
    process.exit(1);
    return;
  }
  const allMessages: Message[] = conversations.flatMap((c) => c.messages);
  const assistantCount = allMessages.filter((m) => m.role === "assistant").length;

  printHeader("Behavioral Pattern Analysis");

  console.log(chalk.dim(`  Analyzed ${allMessages.length} messages across ${conversations.length} conversation${conversations.length > 1 ? "s" : ""}`));
  console.log(chalk.dim(`  Assistant responses: ${assistantCount}`));
  console.log();

  // Run all detectors with spinner
  const results = await withSpinner("Running 7 behavioral detectors...", async () => {
    const detectors = [
      detectApologies,
      detectHedging,
      detectSentiment,
      detectVerbosity,
      detectBoundaryIssues,
      detectRecoveryPatterns,
      detectFormalityIssues,
    ];

    const detected: DetectedPattern[] = [];
    for (const detector of detectors) {
      const result = detector(allMessages);
      if (result) detected.push(result);
    }
    return detected;
  });

  const warnings = results.filter((r) => r.severity === "warning" || r.severity === "concern");
  const healthy = results.filter((r) => r.severity === "info");

  // Display warnings
  if (warnings.length > 0) {
    console.log();
    console.log(chalk.bold("  Detected Patterns:"));
    console.log();

    warnings.forEach((pattern, i) => {
      printPatternIndicator(pattern.name, pattern.severity, pattern.description, i + 1);
      if (pattern.examples.length > 0) {
        for (const ex of pattern.examples) {
          console.log(`     ${chalk.dim(`"${ex}"`)}`);
        }
      }
      console.log();
    });
  }

  // Display healthy patterns
  if (healthy.length > 0) {
    console.log(chalk.bold("  Healthy Patterns:"));
    console.log();
    for (const pattern of healthy) {
      printHealthyIndicator(pattern.name, pattern.description);
    }
    console.log();
  }

  // Prescriptions
  const prescriptions = warnings.filter((w) => w.prescription);
  if (prescriptions.length > 0) {
    const rxContent = prescriptions.map((p, i) =>
      `${i + 1}. ${p.prescription}`
    ).join("\n");
    printBox(rxContent, "info", "Prescriptions");
    console.log();
  }

  // Summary
  if (warnings.length === 0) {
    printBox(`${figures.tick} No concerning patterns detected. Profile looks healthy.`, "success");
  } else {
    const summary = `${warnings.length} pattern${warnings.length > 1 ? "s" : ""} detected. Run ${chalk.cyan("holomime session")} for targeted alignment.`;
    printBox(summary, warnings.some((w) => w.severity === "concern") ? "concern" : "warning");
  }

  if (warnings.length > 0) {
    showSoftUpsell("diagnose");
  }

  console.log();
}
