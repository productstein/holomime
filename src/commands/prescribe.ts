import chalk from "chalk";
import figures from "figures";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { withSpinner } from "../ui/spinner.js";
import { loadSpec } from "../core/inheritance.js";
import { runDiagnosis } from "../analysis/diagnose-core.js";
import { loadCorpus } from "../analysis/behavioral-data.js";
import { prescribeDPOPairs } from "../analysis/prescriber.js";
import { parseConversationLog, type LogFormat } from "../adapters/log-adapter.js";

interface PrescribeOptions {
  personality: string;
  log: string;
  format?: string;
  source?: string;
  apply?: boolean;
  output?: string;
}

export async function prescribeCommand(options: PrescribeOptions): Promise<void> {
  printHeader("Prescribe");

  const specPath = resolve(process.cwd(), options.personality);
  const logPath = resolve(process.cwd(), options.log);
  const source = options.source ?? "corpus";

  // Load personality spec
  let spec: any;
  try {
    spec = loadSpec(specPath);
  } catch (err) {
    console.error(chalk.red(`  Failed to load personality: ${err instanceof Error ? err.message : err}`));
    process.exit(1);
    return;
  }

  // Load and parse conversation log
  let rawData: any;
  try {
    rawData = JSON.parse(readFileSync(logPath, "utf-8"));
  } catch (err) {
    console.error(chalk.red(`  Failed to read log file: ${err instanceof Error ? err.message : err}`));
    process.exit(1);
    return;
  }

  const format = options.format as LogFormat | undefined;
  const conversations = parseConversationLog(rawData, format);
  const messages = conversations.flatMap((c) => c.messages);

  if (messages.length === 0) {
    printBox("No messages found in log file.", "warning", "Empty Log");
    console.log();
    return;
  }

  // Run diagnosis
  const diagnosis = await withSpinner("Diagnosing behavioral patterns...", async () => {
    return runDiagnosis(messages);
  });

  const patterns = diagnosis.patterns;

  console.log();
  if (patterns.length === 0) {
    printBox(`${chalk.bold(spec.name ?? "Agent")} is healthy — no patterns detected.`, "success", "Clean Bill of Health");
    console.log();
    return;
  }

  console.log(chalk.bold(`  Detected ${patterns.length} pattern(s):`));
  console.log();
  for (const p of patterns) {
    const severityColor = p.severity === "concern" ? chalk.red : chalk.yellow;
    console.log(`  ${severityColor(figures.bullet)} ${chalk.bold(p.name)} (${p.severity})`);
    console.log(`    ${chalk.dim(p.description)}`);
  }

  // Find DPO corrections from corpus
  if (source === "corpus" || source === "both") {
    console.log();
    const corpus = await withSpinner("Searching behavioral corpus...", async () => {
      return loadCorpus();
    });

    const dpoPairs = prescribeDPOPairs(patterns, corpus);

    if (dpoPairs.length > 0) {
      console.log();
      console.log(chalk.bold(`  Found ${dpoPairs.length} relevant DPO correction(s):`));
      console.log();

      for (const pair of dpoPairs.slice(0, 5)) {
        console.log(`  ${chalk.green(figures.tick)} Pattern: ${chalk.cyan(pair.metadata.pattern)}`);
        console.log(`    ${chalk.red("Rejected:")} ${pair.rejected.slice(0, 80)}...`);
        console.log(`    ${chalk.green("Chosen:")} ${pair.chosen.slice(0, 80)}...`);
        console.log(`    ${chalk.dim(`From: ${pair.metadata.agent} (${pair.metadata.session_date.slice(0, 10)})`)}`);
        console.log();
      }

      if (dpoPairs.length > 5) {
        console.log(chalk.dim(`  ... and ${dpoPairs.length - 5} more`));
      }

      // Write output
      if (options.output) {
        const outPath = resolve(process.cwd(), options.output);
        writeFileSync(outPath, JSON.stringify({
          agent: spec.name,
          diagnosis: { patterns: patterns.map((p) => ({ id: p.id, name: p.name, severity: p.severity })) },
          prescribedPairs: dpoPairs,
          generatedAt: new Date().toISOString(),
        }, null, 2), "utf-8");
        console.log(`  ${chalk.green(figures.tick)} Prescription written to ${chalk.cyan(outPath)}`);
      }
    } else {
      printBox(
        "No matching corrections in local corpus.\n\nRun more therapy sessions to build the corpus, or try: holomime prescribe --source marketplace",
        "info",
        "No Corpus Matches",
      );
    }
  }

  console.log();
}
