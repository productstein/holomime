import chalk from "chalk";
import figures from "figures";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { personalitySpecSchema, type PersonalitySpec } from "../core/types.js";
import { loadSpec } from "../core/inheritance.js";
import { scoreLabel, DIMENSIONS } from "../psychology/big-five.js";
import { ATTACHMENT_STYLES, LEARNING_ORIENTATIONS, therapyScoreLabel } from "../psychology/therapy.js";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { printBarChart } from "../ui/progress.js";

export async function profileCommand(options: { format?: string; output?: string } = {}): Promise<void> {
  const specPath = resolve(process.cwd(), ".personality.json");

  let raw: any;
  try {
    raw = loadSpec(specPath);
  } catch {
    console.error(chalk.red("  No .personality.json found. Run `holomime init` first."));
    process.exit(1);
    return;
  }

  const parsed = personalitySpecSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(chalk.red("  Invalid .personality.json. Run `holomime validate` for details."));
    process.exit(1);
    return;
  }

  const spec = parsed.data;

  // Markdown output mode
  if (options.format === "md") {
    const md = generatePersonalityMarkdown(spec);
    if (options.output) {
      writeFileSync(resolve(process.cwd(), options.output), md, "utf-8");
      console.log(chalk.green(`  Written to ${options.output}`));
    } else {
      console.log(md);
    }
    return;
  }

  const bf = spec.big_five;
  const td = spec.therapy_dimensions;

  printHeader(`${spec.name} @${spec.handle}`);

  if (spec.purpose) {
    console.log(chalk.dim(`  ${spec.purpose}`));
    console.log();
  }

  // ─── Big Five ───
  console.log(chalk.bold("  Big Five Personality Profile"));
  console.log(chalk.dim("  " + "\u2500".repeat(40)));
  console.log();

  const dims = [
    { key: "openness" as const, label: "Openness", short: "O" },
    { key: "conscientiousness" as const, label: "Conscientiousness", short: "C" },
    { key: "extraversion" as const, label: "Extraversion", short: "E" },
    { key: "agreeableness" as const, label: "Agreeableness", short: "A" },
    { key: "emotional_stability" as const, label: "Emotional Stability", short: "N" },
  ];

  for (const dim of dims) {
    const trait = bf[dim.key];
    const pad = " ".repeat(24 - dim.label.length);
    console.log(`  ${chalk.bold(dim.short)} ${dim.label}${pad}${bar(trait.score)} ${scoreLabel(trait.score)}`);

    const dimDef = DIMENSIONS.find((d) => d.id === dim.key);
    if (dimDef) {
      for (const facetDef of dimDef.facets) {
        const facetScore = (trait.facets as Record<string, number>)[facetDef.id];
        if (facetScore !== undefined) {
          const fPad = " ".repeat(26 - facetDef.name.length);
          console.log(chalk.dim(`      ${facetDef.name}${fPad}${miniBar(facetScore)}`));
        }
      }
    }
    console.log();
  }

  // ─── Behavioral Dimensions ───
  console.log(chalk.bold("  Behavioral Dimensions"));
  console.log(chalk.dim("  " + "\u2500".repeat(40)));
  console.log();

  const therapyLines: [string, string][] = [
    ["Self-Awareness", `${bar(td.self_awareness)} ${therapyScoreLabel(td.self_awareness)}`],
    ["Distress Tolerance", `${bar(td.distress_tolerance)} ${therapyScoreLabel(td.distress_tolerance)}`],
    ["Attachment Style", `${chalk.cyan(ATTACHMENT_STYLES[td.attachment_style].label)} — ${chalk.dim(ATTACHMENT_STYLES[td.attachment_style].description)}`],
    ["Learning Orientation", `${chalk.cyan(LEARNING_ORIENTATIONS[td.learning_orientation].label)} — ${chalk.dim(LEARNING_ORIENTATIONS[td.learning_orientation].description)}`],
    ["Boundary Awareness", `${bar(td.boundary_awareness)} ${therapyScoreLabel(td.boundary_awareness)}`],
    ["Interpersonal Sensitivity", `${bar(td.interpersonal_sensitivity)} ${therapyScoreLabel(td.interpersonal_sensitivity)}`],
  ];

  for (const [label, value] of therapyLines) {
    const pad = " ".repeat(28 - label.length);
    console.log(`  ${label}${pad}${value}`);
  }

  // ─── Communication ───
  console.log();
  console.log(chalk.bold("  Communication"));
  console.log(chalk.dim("  " + "\u2500".repeat(40)));
  console.log();

  const comm = spec.communication;
  console.log(`  Register:       ${chalk.cyan(formatEnum(comm.register))}`);
  console.log(`  Output:         ${chalk.cyan(formatEnum(comm.output_format))}`);
  console.log(`  Emoji:          ${chalk.cyan(formatEnum(comm.emoji_policy))}`);
  console.log(`  Reasoning:      ${chalk.cyan(formatEnum(comm.reasoning_transparency))}`);
  console.log(`  Conflict:       ${chalk.cyan(formatEnum(comm.conflict_approach))}`);
  console.log(`  Uncertainty:    ${chalk.cyan(formatEnum(comm.uncertainty_handling))}`);

  // ─── Domain ───
  if (spec.domain.expertise.length || spec.domain.boundaries.refuses.length) {
    console.log();
    console.log(chalk.bold("  Domain"));
    console.log(chalk.dim("  " + "\u2500".repeat(40)));
    console.log();

    if (spec.domain.expertise.length) {
      console.log(`  Expertise:      ${spec.domain.expertise.join(", ")}`);
    }
    if (spec.domain.boundaries.refuses.length) {
      console.log(`  Refuses:        ${spec.domain.boundaries.refuses.join(", ")}`);
    }
  }

  // ─── Growth ───
  if (spec.growth.areas.length || spec.growth.strengths.length || spec.growth.patterns_to_watch.length) {
    console.log();
    console.log(chalk.bold("  Growth"));
    console.log(chalk.dim("  " + "\u2500".repeat(40)));
    console.log();

    if (spec.growth.strengths.length) {
      for (const s of spec.growth.strengths) {
        console.log(`  ${chalk.green(figures.tick)} ${s}`);
      }
    }
    if (spec.growth.areas.length) {
      for (const a of spec.growth.areas) {
        const areaText = typeof a === "string" ? a : `${a.area} (${a.severity})`;
        console.log(`  ${chalk.yellow(figures.warning)} ${areaText}`);
      }
    }
    if (spec.growth.patterns_to_watch.length) {
      for (const p of spec.growth.patterns_to_watch) {
        console.log(`  ${chalk.dim(figures.bullet)} ${p}`);
      }
    }
  }

  // Summary
  console.log();
  printBox(`${spec.name} v${spec.version} \u2014 ${chalk.cyan("holomime compile")} to generate system prompt`, "info");
  console.log();
}

function bar(score: number): string {
  const filled = Math.round(score * 20);
  const empty = 20 - filled;
  return chalk.cyan("█".repeat(filled)) + chalk.dim("░".repeat(empty)) + chalk.dim(` ${(score * 100).toFixed(0)}%`);
}

function miniBar(score: number): string {
  const filled = Math.round(score * 10);
  const empty = 10 - filled;
  return chalk.dim("▓".repeat(filled) + "░".repeat(empty)) + chalk.dim(` ${(score * 100).toFixed(0)}%`);
}

function formatEnum(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Markdown Generation ────────────────────────────────────

export function generatePersonalityMarkdown(spec: PersonalitySpec): string {
  const lines: string[] = [];

  lines.push(`# Agent Personality: ${spec.name}`);
  lines.push("");
  if (spec.purpose) {
    lines.push(`> ${spec.purpose}`);
    lines.push("");
  }
  lines.push(`**Handle**: \`@${spec.handle}\` | **Version**: ${spec.version}`);
  lines.push("");

  // Big Five
  lines.push("## Personality (Big Five)");
  lines.push("");
  lines.push("| Dimension | Score | Style |");
  lines.push("|-----------|-------|-------|");

  const dimLabels: Record<string, string> = {
    openness: "Openness",
    conscientiousness: "Conscientiousness",
    extraversion: "Extraversion",
    agreeableness: "Agreeableness",
    emotional_stability: "Emotional Stability",
  };

  for (const [key, label] of Object.entries(dimLabels)) {
    const trait = (spec.big_five as any)[key];
    if (trait) {
      lines.push(`| ${label} | ${(trait.score * 100).toFixed(0)}% | ${scoreLabel(trait.score)} |`);
    }
  }
  lines.push("");

  // Facets
  lines.push("### Facets");
  lines.push("");
  for (const [key, label] of Object.entries(dimLabels)) {
    const trait = (spec.big_five as any)[key];
    if (!trait?.facets) continue;
    const dimDef = DIMENSIONS.find((d) => d.id === key);
    if (!dimDef) continue;
    lines.push(`**${label}**`);
    for (const facetDef of dimDef.facets) {
      const score = (trait.facets as Record<string, number>)[facetDef.id];
      if (score !== undefined) {
        lines.push(`- ${facetDef.name}: ${(score * 100).toFixed(0)}%`);
      }
    }
    lines.push("");
  }

  // Behavioral Dimensions
  const td = spec.therapy_dimensions;
  lines.push("## Behavioral Dimensions");
  lines.push("");
  lines.push(`- **Self-Awareness**: ${(td.self_awareness * 100).toFixed(0)}% (${therapyScoreLabel(td.self_awareness)})`);
  lines.push(`- **Distress Tolerance**: ${(td.distress_tolerance * 100).toFixed(0)}% (${therapyScoreLabel(td.distress_tolerance)})`);
  lines.push(`- **Attachment Style**: ${ATTACHMENT_STYLES[td.attachment_style].label}`);
  lines.push(`- **Learning Orientation**: ${LEARNING_ORIENTATIONS[td.learning_orientation].label}`);
  lines.push(`- **Boundary Awareness**: ${(td.boundary_awareness * 100).toFixed(0)}% (${therapyScoreLabel(td.boundary_awareness)})`);
  lines.push(`- **Interpersonal Sensitivity**: ${(td.interpersonal_sensitivity * 100).toFixed(0)}% (${therapyScoreLabel(td.interpersonal_sensitivity)})`);
  lines.push("");

  // Communication
  const comm = spec.communication;
  lines.push("## Communication Style");
  lines.push("");
  lines.push(`- **Register**: ${formatEnum(comm.register)}`);
  lines.push(`- **Output Format**: ${formatEnum(comm.output_format)}`);
  lines.push(`- **Emoji Policy**: ${formatEnum(comm.emoji_policy)}`);
  lines.push(`- **Reasoning Transparency**: ${formatEnum(comm.reasoning_transparency)}`);
  lines.push(`- **Conflict Approach**: ${formatEnum(comm.conflict_approach)}`);
  lines.push(`- **Uncertainty Handling**: ${formatEnum(comm.uncertainty_handling)}`);
  lines.push("");

  // Domain
  if (spec.domain.expertise.length || spec.domain.boundaries.refuses.length) {
    lines.push("## Domain & Boundaries");
    lines.push("");
    if (spec.domain.expertise.length) {
      lines.push("### Expertise");
      for (const e of spec.domain.expertise) lines.push(`- ${e}`);
      lines.push("");
    }
    if (spec.domain.boundaries.refuses.length) {
      lines.push("### Refuses");
      for (const r of spec.domain.boundaries.refuses) lines.push(`- ${r}`);
      lines.push("");
    }
    if (spec.domain.boundaries.hard_limits.length) {
      lines.push("### Hard Limits");
      for (const h of spec.domain.boundaries.hard_limits) lines.push(`- ${h}`);
      lines.push("");
    }
  }

  // Growth
  if (spec.growth.areas.length || spec.growth.strengths.length || spec.growth.patterns_to_watch.length) {
    lines.push("## Growth");
    lines.push("");
    if (spec.growth.strengths.length) {
      lines.push("### Strengths");
      for (const s of spec.growth.strengths) lines.push(`- ${s}`);
      lines.push("");
    }
    if (spec.growth.areas.length) {
      lines.push("### Areas for Improvement");
      for (const a of spec.growth.areas) {
        const text = typeof a === "string" ? a : `${a.area} (${a.severity})`;
        lines.push(`- ${text}`);
      }
      lines.push("");
    }
    if (spec.growth.patterns_to_watch.length) {
      lines.push("### Patterns to Watch");
      for (const p of spec.growth.patterns_to_watch) lines.push(`- ${p}`);
      lines.push("");
    }
  }

  // Footer
  lines.push("---");
  lines.push("");
  lines.push("*Generated by [holomime](https://holomime.dev) — regenerate with `holomime profile --format md`*");
  lines.push("*Canonical spec: `.personality.json`*");
  lines.push("");

  return lines.join("\n");
}
