import chalk from "chalk";
import figures from "figures";
import { resolve } from "node:path";
import { personalitySpecSchema } from "../core/types.js";
import { loadSpec } from "../core/inheritance.js";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { withSpinner } from "../ui/spinner.js";

export async function validateCommand(): Promise<void> {
  const specPath = resolve(process.cwd(), ".personality.json");

  let json: unknown;
  try {
    json = loadSpec(specPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT") || msg.includes("no such file")) {
      console.error(chalk.red("  No .personality.json found. Run `holomime init` first."));
    } else {
      console.error(chalk.red(`  Error loading .personality.json: ${msg}`));
    }
    process.exit(1);
    return;
  }

  const result = await withSpinner("Validating personality schema...", async () => {
    return personalitySpecSchema.safeParse(json);
  });

  if (!result.success) {
    printHeader("Validation Failed");

    for (const err of result.error.errors) {
      console.log(`  ${chalk.red(figures.cross)} ${chalk.bold(err.path.join("."))}: ${err.message}`);
    }
    console.log();
    printBox(`${result.error.errors.length} error${result.error.errors.length > 1 ? "s" : ""} found. Fix and re-run ${chalk.cyan("holomime validate")}.`, "concern");
    console.log();
    process.exit(1);
    return;
  }

  const spec = result.data;

  // Psychological coherence checks
  const warnings: string[] = [];

  if (spec.big_five.agreeableness.score >= 0.7 && spec.big_five.agreeableness.facets.cooperation <= 0.3) {
    warnings.push("High agreeableness but low cooperation \u2014 this combination is unusual. Is this intentional?");
  }

  if (spec.big_five.extraversion.score >= 0.7 && spec.big_five.extraversion.facets.initiative <= 0.3) {
    warnings.push("High extraversion but low initiative \u2014 extraverted agents typically take initiative.");
  }

  if (spec.big_five.emotional_stability.score <= 0.3 && spec.big_five.emotional_stability.facets.confidence >= 0.7) {
    warnings.push("Low emotional stability but high confidence \u2014 this combination can feel inconsistent.");
  }

  if (spec.therapy_dimensions.boundary_awareness >= 0.7 && spec.therapy_dimensions.self_awareness <= 0.3) {
    warnings.push("High boundary awareness with low self-awareness \u2014 boundaries require self-knowledge to enforce.");
  }

  if (spec.therapy_dimensions.attachment_style === "anxious" && spec.big_five.emotional_stability.score >= 0.8) {
    warnings.push("Anxious attachment style with very high emotional stability \u2014 these tend to contradict each other.");
  }

  if (spec.therapy_dimensions.attachment_style === "avoidant" && spec.big_five.agreeableness.facets.warmth >= 0.8) {
    warnings.push("Avoidant attachment with very high warmth \u2014 avoidant types typically maintain emotional distance.");
  }

  // Results
  if (warnings.length > 0) {
    console.log();
    console.log(chalk.bold("  Coherence Warnings:"));
    console.log();
    for (const w of warnings) {
      console.log(`  ${chalk.yellow(figures.warning)} ${w}`);
    }
    console.log();
    printBox(`${chalk.green(figures.tick)} Schema valid \u2014 ${warnings.length} coherence warning${warnings.length > 1 ? "s" : ""}`, "warning");
  } else {
    console.log();
    printBox(`${figures.tick} ${spec.name} @${spec.handle} v${spec.version} \u2014 schema valid, personality coherent`, "success");
  }
  console.log();
}
