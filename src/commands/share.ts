import chalk from "chalk";
import figures from "figures";
import { resolve } from "node:path";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { withSpinner } from "../ui/spinner.js";
import {
  loadTranscripts,
  exportTrainingData,
} from "../analysis/training-export.js";
import { createGist } from "../marketplace/registry.js";

interface ShareOptions {
  sessions?: string;
  format?: string;
  anonymize?: boolean;
  tags?: string;
}

export async function shareCommand(options: ShareOptions): Promise<void> {
  printHeader("Share Training Data");

  const format = (options.format ?? "dpo") as "dpo" | "rlhf" | "alpaca";
  const validFormats = ["dpo", "rlhf", "alpaca"];
  if (!validFormats.includes(format)) {
    console.error(chalk.red(`  Invalid format: ${format}. Choose from: ${validFormats.join(", ")}`));
    process.exit(1);
    return;
  }

  const sessionsDir = resolve(process.cwd(), options.sessions ?? ".holomime/sessions");

  const transcripts = await withSpinner("Loading session transcripts...", async () => {
    return loadTranscripts(sessionsDir);
  });

  if (transcripts.length === 0) {
    printBox(
      `No session transcripts found in ${sessionsDir}\n\nRun ${chalk.cyan("holomime align")} or ${chalk.cyan("holomime network")} first.`,
      "warning",
      "No Data",
    );
    console.log();
    return;
  }

  console.log();
  console.log(chalk.dim(`  Found ${transcripts.length} session transcript(s)`));

  const result = await withSpinner(`Extracting ${format.toUpperCase()} training data...`, async () => {
    return exportTrainingData(transcripts, format);
  });

  if (result.examples.length === 0) {
    printBox("No training pairs extracted from sessions.", "warning", "Empty Export");
    console.log();
    return;
  }

  // Anonymize if requested
  let exportData: any = result;
  if (options.anonymize) {
    exportData = {
      ...result,
      agent: "anonymous",
      examples: (result.examples as any[]).map((ex: any) => ({
        ...ex,
        metadata: { ...ex.metadata, agent: "anonymous" },
      })),
    };
  }

  // Add tags
  const tags = options.tags?.split(",").map((t) => t.trim()) ?? [];

  console.log();
  console.log(`  ${chalk.cyan(figures.pointer)} ${result.examples.length} ${format.toUpperCase()} pairs`);
  if (tags.length > 0) {
    console.log(`  ${chalk.dim("Tags:")} ${tags.join(", ")}`);
  }
  console.log();

  // Publish via Gist
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    printBox(
      `Set GITHUB_TOKEN to share training data.\n\n  ${chalk.cyan("export GITHUB_TOKEN=<your-token>")}`,
      "warning",
      "Missing Token",
    );
    console.log();
    return;
  }

  const handle = exportData.agent ?? "agent";
  const gistResult = await withSpinner("Publishing to marketplace...", async () => {
    return createGist(exportData, `${handle}-${format}-training`, token);
  });

  console.log();
  printBox(
    [
      `Shared ${result.examples.length} ${format.toUpperCase()} pairs`,
      `URL: ${chalk.cyan(gistResult.url)}`,
      `Raw: ${gistResult.rawUrl}`,
      "",
      `Other agents can use: ${chalk.cyan(`holomime prescribe --source marketplace`)}`,
    ].join("\n"),
    "success",
    "Published",
  );
  console.log();
}
