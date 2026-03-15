import chalk from "chalk";
import figures from "figures";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { loadSpec } from "../core/inheritance.js";
import { type Message, type TraitAlignment } from "../core/types.js";
import { scoreTraitsFromMessages } from "../analysis/trait-scorer.js";
import { detectApologies } from "../analysis/rules/apology-detector.js";
import { detectHedging } from "../analysis/rules/hedge-detector.js";
import { detectSentiment } from "../analysis/rules/sentiment.js";
import { detectBoundaryIssues } from "../analysis/rules/boundary.js";
import { detectRecoveryPatterns } from "../analysis/rules/recovery.js";
import { generatePrescriptions } from "../analysis/prescriber.js";
import { printHeader } from "../ui/branding.js";
import { withSpinner } from "../ui/spinner.js";
import { printBox } from "../ui/boxes.js";
import { showSoftUpsell } from "../ui/tier.js";
import { printAlignmentBar, printHealthMeter, printPatternIndicator } from "../ui/progress.js";
import { parseConversationLogFromString, type LogFormat } from "../adapters/log-adapter.js";

interface AssessOptions {
  personality: string;
  log: string;
  format?: string;
}

export async function assessCommand(options: AssessOptions): Promise<void> {
  const specPath = resolve(process.cwd(), options.personality);
  let spec: any;
  try {
    spec = loadSpec(specPath);
  } catch {
    console.error(chalk.red(`  Could not read personality file: ${options.personality}`));
    process.exit(1);
    return;
  }

  const logPath = resolve(process.cwd(), options.log);
  let conversations;
  try {
    const raw = readFileSync(logPath, "utf-8");
    conversations = parseConversationLogFromString(raw, (options.format ?? "auto") as LogFormat);
  } catch (err) {
    console.error(chalk.red(`  ${err instanceof Error ? err.message : "Could not read/parse log file."}`));
    process.exit(1);
    return;
  }

  const allMessages: Message[] = conversations.flatMap((c) => c.messages);

  printHeader("Personality Assessment");

  console.log(`  Agent: ${chalk.bold(spec.name ?? "Unknown")} | Sessions analyzed: ${conversations.length}`);
  console.log();

  // Run assessment with spinner
  const { alignments, patterns, warnings, selfAwarenessScore, distressToleranceScore, boundaryScore, overallHealth, prescriptions } =
    await withSpinner("Analyzing behavioral alignment...", async () => {
      const actualTraits = scoreTraitsFromMessages(allMessages);
      const specBigFive = spec.big_five;

      const dims = [
        { key: "openness", label: "Openness" },
        { key: "conscientiousness", label: "Conscientiousness" },
        { key: "extraversion", label: "Extraversion" },
        { key: "agreeableness", label: "Agreeableness" },
        { key: "emotional_stability", label: "Emotional Stability" },
      ];

      const aligns: TraitAlignment[] = dims.map((dim) => {
        const specScore = specBigFive[dim.key]?.score ?? 0.5;
        const actualScore = (actualTraits as any)[dim.key] ?? 0.5;
        const delta = actualScore - specScore;
        let status: "aligned" | "elevated" | "suppressed" = "aligned";
        if (delta > 0.1) status = "elevated";
        if (delta < -0.1) status = "suppressed";
        return { dimension: dim.label, specScore, actualScore, status, delta };
      });

      const pats = [
        detectApologies(allMessages),
        detectHedging(allMessages),
        detectSentiment(allMessages),
        detectBoundaryIssues(allMessages),
        detectRecoveryPatterns(allMessages),
      ].filter((p): p is NonNullable<typeof p> => p !== null);

      const warns = pats.filter((p) => p.severity !== "info");

      const apologyResult = detectApologies(allMessages);
      const boundaryResult = detectBoundaryIssues(allMessages);
      const recoveryResult = detectRecoveryPatterns(allMessages);

      const saScore = apologyResult && apologyResult.id === "over-apologizing" ? 0.4 : 0.7;
      const dtScore = recoveryResult && recoveryResult.id === "error-spiral" ? 0.3 : 0.7;
      const bScore = boundaryResult && boundaryResult.id === "boundary-violation" ? 0.3 : 0.8;

      const alignedCount = aligns.filter((a) => a.status === "aligned").length;
      const alignmentScore = (alignedCount / aligns.length) * 40;
      const patternScore = Math.max(0, 40 - warns.length * 10);
      const therapyScore = ((saScore + dtScore + bScore) / 3) * 20;
      const health = Math.round(alignmentScore + patternScore + therapyScore);

      const rxs = generatePrescriptions(aligns, warns);

      return {
        alignments: aligns,
        patterns: pats,
        warnings: warns,
        selfAwarenessScore: saScore,
        distressToleranceScore: dtScore,
        boundaryScore: bScore,
        overallHealth: health,
        prescriptions: rxs,
      };
    });

  // Big Five alignment
  console.log();
  console.log(chalk.bold("  Big Five Alignment:"));
  console.log();
  for (const align of alignments) {
    printAlignmentBar(align.dimension, align.specScore, align.actualScore);
  }
  console.log();

  // Behavioral dimensions
  console.log(chalk.bold("  Behavioral Dimensions:"));
  const tdIcon = (score: number) => score >= 0.6 ? chalk.green(figures.tick) : chalk.yellow(figures.warning);
  console.log(`  ${tdIcon(selfAwarenessScore)} Self-awareness:     ${(selfAwarenessScore * 100).toFixed(0)}%`);
  console.log(`  ${tdIcon(distressToleranceScore)} Distress tolerance: ${(distressToleranceScore * 100).toFixed(0)}%`);
  console.log(`  ${tdIcon(boundaryScore)} Boundary awareness: ${(boundaryScore * 100).toFixed(0)}%`);
  console.log();

  // Overall health
  printHealthMeter(overallHealth);
  console.log();

  // Patterns
  if (warnings.length > 0) {
    console.log(chalk.bold("  Patterns Detected:"));
    console.log();
    warnings.forEach((p, i) => {
      printPatternIndicator(p.name, p.severity, p.description, i + 1);
    });
    console.log();
  }

  // Prescriptions
  if (prescriptions.length > 0) {
    const rxContent = prescriptions.map((p, i) =>
      `${i + 1}. ${p.reason}`
    ).join("\n");
    printBox(rxContent, "info", "Recommendations");
    console.log();
  }

  // Save assessment snapshot
  const assessDir = resolve(process.cwd(), ".holomime", "assessments");
  if (!existsSync(assessDir)) {
    mkdirSync(assessDir, { recursive: true });
  }

  const snapshot = {
    timestamp: new Date().toISOString(),
    agentName: spec.name ?? "Unknown",
    sessionsAnalyzed: conversations.length,
    overallHealth,
    bigFiveAlignment: alignments,
    patterns: patterns,
    prescriptions: prescriptions.map((p) => ({ field: p.field, reason: p.reason, priority: p.priority })),
  };

  const date = new Date().toISOString().split("T")[0];
  const filepath = join(assessDir, `${date}.json`);
  writeFileSync(filepath, JSON.stringify(snapshot, null, 2));
  console.log(chalk.dim(`  Assessment saved: ${filepath}`));

  if (warnings.length > 0) {
    showSoftUpsell("assess");
  }

  console.log();
}
