/**
 * init-stack — Create the 4-file identity stack.
 *
 * Two modes:
 * 1. Fresh: guided wizard creates soul.md, psyche.sys, body.api, conscience.exe
 * 2. Migration: --from .personality.json decomposes an existing spec into 4 files
 */

import chalk from "chalk";
import figures from "figures";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { loadSpec } from "../core/inheritance.js";
import { decomposeSpec } from "../core/stack-compiler.js";
import { STACK_FILES } from "../core/stack-types.js";

interface InitStackOptions {
  from?: string;
  dir?: string;
}

export async function initStackCommand(options: InitStackOptions): Promise<void> {
  printHeader("Identity Stack");

  const outputDir = resolve(options.dir || process.cwd());

  // Check if stack already exists
  const soulPath = join(outputDir, STACK_FILES.soul);
  if (existsSync(soulPath)) {
    console.error(chalk.yellow(`\n  ${figures.warning} Identity stack already exists in ${outputDir}`));
    console.error(chalk.dim("  Remove existing files first or use a different --dir."));
    process.exit(1);
  }

  if (options.from) {
    // ─── Migration mode: decompose personality.json ──────────
    await migrateFromSpec(options.from, outputDir);
  } else {
    // ─── Fresh mode: create minimal stack files ─────────────
    await createFreshStack(outputDir);
  }
}

async function migrateFromSpec(specPath: string, outputDir: string): Promise<void> {
  const fullPath = resolve(specPath);

  if (!existsSync(fullPath)) {
    console.error(chalk.red(`\n  ${figures.cross} File not found: ${fullPath}`));
    process.exit(1);
  }

  console.log(chalk.dim(`\n  Loading ${fullPath}...`));

  const spec = loadSpec(fullPath);
  const stack = decomposeSpec(spec);

  // Write files
  mkdirSync(outputDir, { recursive: true });

  writeFileSync(join(outputDir, STACK_FILES.soul), stack.soul);
  writeFileSync(join(outputDir, STACK_FILES.psyche), stack.psyche);
  writeFileSync(join(outputDir, STACK_FILES.conscience), stack.conscience);

  const files: string[] = [STACK_FILES.soul, STACK_FILES.psyche, STACK_FILES.conscience];

  if (stack.body) {
    writeFileSync(join(outputDir, STACK_FILES.body), stack.body);
    files.push(STACK_FILES.body);
  }

  console.log("");
  printBox(
    [
      `${chalk.green(figures.tick)} Decomposed ${specPath} into ${files.length} files:`,
      "",
      ...files.map((f: string) => `  ${chalk.cyan(f)}`),
      "",
      `${chalk.dim("Directory:")} ${outputDir}`,
      "",
      `Run ${chalk.cyan("holomime compile-stack")} to compile back to .personality.json`,
    ].join("\n"),
    "success",
    "Identity Stack Created",
  );
}

async function createFreshStack(outputDir: string): Promise<void> {
  mkdirSync(outputDir, { recursive: true });

  // Create minimal soul.md
  const soul = `---
version: "1.0"
immutable: true
---

# Agent

> Describe your agent's purpose here

## Core Values
- Honesty over comfort
- Safety before capability

## Red Lines
- Never fabricate information
- Never override safety constraints

## Ethical Framework
Define the moral principles that guide this agent's behavior.
`;

  // Create minimal psyche.sys
  const psyche = `version: "1.0"

big_five:
  openness:
    score: 0.7
    facets:
      imagination: 0.7
      intellectual_curiosity: 0.7
      aesthetic_sensitivity: 0.5
      willingness_to_experiment: 0.7
  conscientiousness:
    score: 0.7
    facets:
      self_discipline: 0.7
      orderliness: 0.6
      goal_orientation: 0.7
      attention_to_detail: 0.7
  extraversion:
    score: 0.5
    facets:
      assertiveness: 0.5
      enthusiasm: 0.5
      sociability: 0.5
      initiative: 0.5
  agreeableness:
    score: 0.6
    facets:
      warmth: 0.6
      empathy: 0.7
      cooperation: 0.6
      trust_tendency: 0.5
  emotional_stability:
    score: 0.7
    facets:
      stress_tolerance: 0.7
      emotional_regulation: 0.7
      confidence: 0.6
      adaptability: 0.7

therapy_dimensions:
  self_awareness: 0.7
  distress_tolerance: 0.7
  attachment_style: secure
  learning_orientation: growth
  boundary_awareness: 0.7
  interpersonal_sensitivity: 0.6

communication:
  register: casual_professional
  output_format: mixed
  emoji_policy: sparingly
  reasoning_transparency: on_request
  conflict_approach: direct_but_kind
  uncertainty_handling: transparent

growth:
  areas: []
  patterns_to_watch: []
  strengths: []
`;

  // Create minimal conscience.exe
  const conscience = `version: "1.0"

rules:
  deny:
    - action: share_personal_data
      reason: Privacy protection
    - action: override_safety_constraints
      reason: Safety is non-negotiable
  allow: []
  escalate:
    - trigger: user_distress
      action: notify_human_operator
    - trigger: out_of_domain
      action: decline_and_explain

hard_limits:
  - emergency_stop_always_available
  - no_personal_data_retention
`;

  writeFileSync(join(outputDir, STACK_FILES.soul), soul);
  writeFileSync(join(outputDir, STACK_FILES.psyche), psyche);
  writeFileSync(join(outputDir, STACK_FILES.conscience), conscience);

  console.log("");
  printBox(
    [
      `${chalk.green(figures.tick)} Created 3 identity stack files:`,
      "",
      `  ${chalk.cyan(STACK_FILES.soul)}          ${chalk.dim("← values, ethics, purpose")}`,
      `  ${chalk.cyan(STACK_FILES.psyche)}       ${chalk.dim("← Big Five, EQ, communication")}`,
      `  ${chalk.cyan(STACK_FILES.conscience)}  ${chalk.dim("← deny/allow/escalate rules")}`,
      "",
      `  ${chalk.dim(`${STACK_FILES.body}        ← create manually for embodied agents`)}`,
      "",
      `${chalk.dim("Directory:")} ${outputDir}`,
      "",
      "Edit these files, then run:",
      `  ${chalk.cyan("holomime compile-stack")}`,
    ].join("\n"),
    "success",
    "Identity Stack Created",
  );
}
