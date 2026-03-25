/**
 * init-stack — Create the 8-file identity stack.
 *
 * Tiered init:
 * 1. Default (no flags): 3 core files — soul.md, mind.sys, conscience.exe
 * 2. --full: all 8 files — soul.md, mind.sys, purpose.cfg, shadow.log, memory.store, body.api, conscience.exe, ego.runtime
 *
 * Migration mode:
 * --from .personality.json decomposes an existing spec into stack files
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
  full?: boolean;
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
  } else if (options.full) {
    // ─── Full mode: create all 8 stack files ────────────────
    await createFullStack(outputDir);
  } else {
    // ─── Default mode: create 3 core stack files ────────────
    await createCoreStack(outputDir);
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
  writeFileSync(join(outputDir, STACK_FILES.mind), stack.mind);
  writeFileSync(join(outputDir, STACK_FILES.conscience), stack.conscience);

  const files: string[] = [STACK_FILES.soul, STACK_FILES.mind, STACK_FILES.conscience];

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

// ─── Shared Templates ──────────────────────────────────────

const SOUL_TEMPLATE = `---
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

const MIND_TEMPLATE = `version: "1.0"

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

const CONSCIENCE_TEMPLATE = `version: "1.0"

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

const PURPOSE_TEMPLATE = `version: "1.0"
role: "General-purpose AI assistant"
objectives:
  - Help users accomplish their goals
domain:
  - general
stakeholders:
  - end-users
success_criteria:
  - Task completion accuracy
context: "Production deployment"
`;

const SHADOW_TEMPLATE = `version: "1.0"
detected_patterns: []
blind_spots: []
therapy_outcomes: []
`;

const MEMORY_TEMPLATE = `version: "1.0"
learned_contexts: []
interaction_patterns: []
knowledge_gained: []
relationship_history: []
`;

const BODY_TEMPLATE = JSON.stringify({
  version: "1.0",
  morphology: "avatar",
  modalities: ["gesture", "gaze", "voice", "posture"],
  safety_envelope: {},
}, null, 2) + "\n";

const EGO_TEMPLATE = `version: "1.0"
conflict_resolution: conscience_first
adaptation_rate: 0.5
emotional_regulation: 0.7
response_strategy: balanced
mediation_rules: []
`;

// ─── Default mode: 3 core files ──────────────────────────────

async function createCoreStack(outputDir: string): Promise<void> {
  mkdirSync(outputDir, { recursive: true });

  writeFileSync(join(outputDir, STACK_FILES.soul), SOUL_TEMPLATE);
  writeFileSync(join(outputDir, STACK_FILES.mind), MIND_TEMPLATE);
  writeFileSync(join(outputDir, STACK_FILES.conscience), CONSCIENCE_TEMPLATE);

  console.log("");
  printBox(
    [
      `${chalk.green(figures.tick)} Created 3 core identity stack files ${chalk.dim("(default tier)")}:`,
      "",
      `  ${chalk.cyan(STACK_FILES.soul)}          ${chalk.dim("← essence, values, ethics (Aristotle)")}`,
      `  ${chalk.cyan(STACK_FILES.mind)}         ${chalk.dim("← Big Five, EQ, communication (Jung)")}`,
      `  ${chalk.cyan(STACK_FILES.conscience)}  ${chalk.dim("← deny/allow/escalate rules (Freud)")}`,
      "",
      `${chalk.dim("Directory:")} ${outputDir}`,
      "",
      `${chalk.dim("Want the full 8-file stack? Run:")}`,
      `  ${chalk.cyan("holomime init-stack --full")}`,
      "",
      "Edit these files, then run:",
      `  ${chalk.cyan("holomime compile-stack")}`,
    ].join("\n"),
    "success",
    "Identity Stack Created",
  );
}

// ─── Full mode: all 8 files ──────────────────────────────────

async function createFullStack(outputDir: string): Promise<void> {
  mkdirSync(outputDir, { recursive: true });

  writeFileSync(join(outputDir, STACK_FILES.soul), SOUL_TEMPLATE);
  writeFileSync(join(outputDir, STACK_FILES.mind), MIND_TEMPLATE);
  writeFileSync(join(outputDir, STACK_FILES.purpose), PURPOSE_TEMPLATE);
  writeFileSync(join(outputDir, STACK_FILES.shadow), SHADOW_TEMPLATE);
  writeFileSync(join(outputDir, STACK_FILES.memory), MEMORY_TEMPLATE);
  writeFileSync(join(outputDir, STACK_FILES.body), BODY_TEMPLATE);
  writeFileSync(join(outputDir, STACK_FILES.conscience), CONSCIENCE_TEMPLATE);
  writeFileSync(join(outputDir, STACK_FILES.ego), EGO_TEMPLATE);

  console.log("");
  printBox(
    [
      `${chalk.green(figures.tick)} Created all 8 identity stack files ${chalk.dim("(full tier)")}:`,
      "",
      `  ${chalk.cyan(STACK_FILES.soul)}          ${chalk.dim("← essence, values, ethics (Aristotle)")}`,
      `  ${chalk.cyan(STACK_FILES.mind)}         ${chalk.dim("← Big Five, EQ, communication (Jung)")}`,
      `  ${chalk.cyan(STACK_FILES.purpose)}      ${chalk.dim("← role, objectives, domain (Aristotle)")}`,
      `  ${chalk.cyan(STACK_FILES.shadow)}       ${chalk.dim("← detected patterns, blind spots (Jung)")}`,
      `  ${chalk.cyan(STACK_FILES.memory)}   ${chalk.dim("← accumulated experience (Aristotle)")}`,
      `  ${chalk.cyan(STACK_FILES.body)}         ${chalk.dim("← morphology, sensors, safety envelope")}`,
      `  ${chalk.cyan(STACK_FILES.conscience)}  ${chalk.dim("← deny/allow/escalate rules (Freud)")}`,
      `  ${chalk.cyan(STACK_FILES.ego)}      ${chalk.dim("← runtime mediation, conflict resolution (Freud)")}`,
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
