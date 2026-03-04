import chalk from "chalk";
import figures from "figures";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { loadSpec } from "../core/inheritance.js";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { printBarChart, printHealthMeter, printSparkline } from "../ui/progress.js";
import { loadEvolution, getEvolutionSummary } from "../analysis/evolution-history.js";

interface GrowthOptions {
  personality: string;
  history?: string;
}

export async function growthCommand(options: GrowthOptions): Promise<void> {
  const specPath = resolve(process.cwd(), options.personality);

  let spec: any;
  try {
    spec = loadSpec(specPath);
  } catch {
    console.error(chalk.red(`  Could not read personality file: ${options.personality}`));
    process.exit(1);
    return;
  }

  const historyDir = resolve(process.cwd(), options.history ?? ".holomime/assessments");

  printHeader(`Growth Report \u2014 ${spec.name ?? "Unknown"}`);

  if (!existsSync(historyDir)) {
    console.log(chalk.dim("  No assessment history found."));
    console.log(chalk.dim(`  Run assessments first: holomime assess --personality ${options.personality} --log <conversation.json>`));
    console.log();

    // Show current profile
    console.log(chalk.bold("  Current Profile:"));
    console.log();
    printProfileQuick(spec);
    console.log();

    printBox("Growth tracking begins after your first assessment.\nEach assessment is saved to .holomime/assessments/ for longitudinal tracking.", "info");
    console.log();
    return;
  }

  // Read assessment history
  const files = readdirSync(historyDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    console.log(chalk.dim("  No assessments found in history directory."));
    console.log();
    return;
  }

  const snapshots: any[] = [];
  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(historyDir, file), "utf-8"));
      snapshots.push(data);
    } catch {
      // skip invalid files
    }
  }

  if (snapshots.length === 0) {
    console.log(chalk.dim("  Could not parse any assessment files."));
    console.log();
    return;
  }

  // Health sparkline
  const healthValues = snapshots.map((s) => s.overallHealth ?? 50);
  const sparkline = printSparkline(healthValues);

  console.log(chalk.bold("  Assessment History:"));
  console.log(`  ${sparkline}  ${chalk.dim(`(${snapshots.length} assessments)`)}`);
  console.log();

  // Table of assessments
  for (const snap of snapshots) {
    const date = snap.timestamp ? new Date(snap.timestamp).toLocaleDateString() : "Unknown";
    const health = snap.overallHealth ?? "?";
    const patternCount = snap.patterns?.filter((p: any) => p.severity !== "info").length ?? 0;

    const healthColor = health >= 70 ? chalk.green : health >= 50 ? chalk.yellow : chalk.red;
    const icon = health >= 70 ? chalk.green(figures.tick) : health >= 50 ? chalk.yellow(figures.warning) : chalk.red(figures.cross);
    console.log(`  ${icon} ${date}  Health: ${healthColor(health + "%")}  Patterns: ${patternCount} ${chalk.yellow(figures.warning)}`);
  }
  console.log();

  // Trend analysis
  if (snapshots.length >= 2) {
    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];

    const healthDelta = (last.overallHealth ?? 50) - (first.overallHealth ?? 50);
    const patternDelta = (first.patterns?.filter((p: any) => p.severity !== "info").length ?? 0)
      - (last.patterns?.filter((p: any) => p.severity !== "info").length ?? 0);

    const trends: string[] = [];
    if (healthDelta > 0) {
      trends.push(chalk.green(`${figures.arrowUp} Health improved by ${healthDelta}% over ${snapshots.length} assessments`));
    } else if (healthDelta < 0) {
      trends.push(chalk.red(`${figures.arrowDown} Health declined by ${Math.abs(healthDelta)}% over ${snapshots.length} assessments`));
    } else {
      trends.push(chalk.dim(`${figures.line} Health stable across ${snapshots.length} assessments`));
    }

    if (patternDelta > 0) {
      trends.push(chalk.green(`${figures.tick} ${patternDelta} pattern${patternDelta > 1 ? "s" : ""} resolved`));
    }

    printBox(trends.join("\n"), healthDelta >= 0 ? "success" : "warning", "Trends");
    console.log();
  }

  // Current growth areas from spec
  if (spec.growth) {
    if (spec.growth.strengths?.length) {
      console.log(chalk.bold("  Strengths:"));
      for (const s of spec.growth.strengths) {
        console.log(`  ${chalk.green(figures.tick)} ${s}`);
      }
      console.log();
    }

    if (spec.growth.areas?.length) {
      console.log(chalk.bold("  Active Growth Areas:"));
      for (const a of spec.growth.areas) {
        const areaText = typeof a === "string" ? a : `${a.area} (${a.severity})`;
        console.log(`  ${chalk.yellow(figures.warning)} ${areaText}`);
      }
      console.log();
    }

    if (spec.growth.patterns_to_watch?.length) {
      console.log(chalk.bold("  Patterns to Watch:"));
      for (const p of spec.growth.patterns_to_watch) {
        console.log(`  ${chalk.dim(figures.bullet)} ${p}`);
      }
      console.log();
    }
  }

  // Evolution history
  const evolution = loadEvolution(spec.name);
  if (evolution && evolution.entries.length > 0) {
    const summary = getEvolutionSummary(evolution);
    const evoSparkline = printSparkline(summary.healthTrend);

    console.log(chalk.bold("  Evolution History:"));
    console.log(`  ${evoSparkline}  ${chalk.dim(`(${summary.totalEntries} iterations across ${evolution.entries.filter(e => e.iteration === 1).length || 1} runs)`)}`);
    console.log();

    const evoStats = [
      `Latest Grade: ${summary.latestGrade}`,
      `Average Health: ${summary.averageHealth}%`,
      `Total DPO Pairs: ${summary.totalDPOPairs}`,
      `Patterns Resolved: ${summary.totalPatternsResolved}`,
    ];

    if (summary.uniquePatternsResolved.length > 0) {
      evoStats.push(`Resolved: ${summary.uniquePatternsResolved.join(", ")}`);
    }

    printBox(evoStats.join("\n"), "success", "Evolve Progress");
    console.log();
  }

  // Next steps
  printBox(`Next: Run ${chalk.cyan("holomime evolve")} for recursive alignment, or ${chalk.cyan("holomime benchmark")} to stress test.`, "info");
  console.log();
}

function printProfileQuick(spec: any): void {
  const bf = spec.big_five;
  if (!bf) return;

  const dims = [
    { key: "openness", label: "Openness" },
    { key: "conscientiousness", label: "Conscientiousness" },
    { key: "extraversion", label: "Extraversion" },
    { key: "agreeableness", label: "Agreeableness" },
    { key: "emotional_stability", label: "Emotional Stability" },
  ];

  for (const dim of dims) {
    const score = bf[dim.key]?.score ?? 0.5;
    printBarChart(dim.label, score);
  }
}
