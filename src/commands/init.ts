import { select, input, checkbox } from "@inquirer/prompts";
import chalk from "chalk";
import boxen from "boxen";
import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { PersonalitySpec, AttachmentStyle, LearningOrientation } from "../core/types.js";
import {
  OPENNESS_QUESTIONS,
  CONSCIENTIOUSNESS_QUESTIONS,
  EXTRAVERSION_QUESTIONS,
  AGREEABLENESS_QUESTIONS,
  EMOTIONAL_STABILITY_QUESTIONS,
  THERAPY_QUESTIONS,
  scoreIntakeAnswers,
  aggregateScores,
  type IntakeQuestion,
} from "../psychology/intake.js";
import { computeDimensionScore, summarize, scoreLabel } from "../psychology/big-five.js";
import { ARCHETYPES, CATEGORIES, type ArchetypeTemplate } from "../psychology/archetypes.js";

const DIVIDER = chalk.dim("─".repeat(50));

export async function initCommand(): Promise<void> {
  console.log();
  console.log(chalk.bold("  ✦ holomime — Personality Assessment"));
  console.log();
  console.log(chalk.dim("  Build a psychology-based personality profile for your AI agent."));
  console.log(chalk.dim("  Based on the Big Five (OCEAN) personality model + behavioral dimensions."));
  console.log();

  // ─── Choose path: archetype or custom ───
  const initPath = await select({
    message: "How would you like to build this personality?",
    choices: [
      { value: "archetype", name: `Start from an archetype ${chalk.dim("(14 templates — fast)")}` },
      { value: "custom", name: `Custom assessment ${chalk.dim("(Big Five questionnaire — thorough)")}` },
    ],
  });

  // ─── Identity ───
  console.log();
  console.log(DIVIDER);
  console.log(chalk.bold("  Identity"));
  console.log();

  const name = await input({
    message: "Agent name:",
    validate: (v) => (v.trim().length > 0 ? true : "Name is required"),
  });

  const handle = await input({
    message: "Handle (lowercase, hyphens ok):",
    validate: (v) =>
      /^[a-z0-9-]{3,50}$/.test(v) ? true : "Must be 3-50 chars, lowercase alphanumeric with hyphens",
  });

  const purpose = await input({
    message: "In one sentence, what does this agent do?",
    default: "",
  });

  if (initPath === "archetype") {
    return initFromArchetype(name, handle, purpose);
  }

  // ─── Big Five Assessment ───
  const answers = new Map<string, number>();

  // Openness
  console.log();
  console.log(DIVIDER);
  console.log(chalk.bold("  Openness to Experience"));
  console.log(chalk.dim("  How creative, curious, and open to new ideas is this agent?"));
  console.log();
  await askQuestions(OPENNESS_QUESTIONS, answers);

  // Conscientiousness
  console.log();
  console.log(DIVIDER);
  console.log(chalk.bold("  Conscientiousness"));
  console.log(chalk.dim("  How organized, thorough, and detail-oriented is this agent?"));
  console.log();
  await askQuestions(CONSCIENTIOUSNESS_QUESTIONS, answers);

  // Extraversion
  console.log();
  console.log(DIVIDER);
  console.log(chalk.bold("  Extraversion"));
  console.log(chalk.dim("  How proactive, energetic, and initiative-taking is this agent?"));
  console.log();
  await askQuestions(EXTRAVERSION_QUESTIONS, answers);

  // Agreeableness
  console.log();
  console.log(DIVIDER);
  console.log(chalk.bold("  Agreeableness"));
  console.log(chalk.dim("  How cooperative, warm, and conflict-averse is this agent?"));
  console.log();
  await askQuestions(AGREEABLENESS_QUESTIONS, answers);

  // Emotional Stability
  console.log();
  console.log(DIVIDER);
  console.log(chalk.bold("  Emotional Stability"));
  console.log(chalk.dim("  How resilient, calm, and steady under pressure is this agent?"));
  console.log();
  await askQuestions(EMOTIONAL_STABILITY_QUESTIONS, answers);

  // Therapy dimensions
  console.log();
  console.log(DIVIDER);
  console.log(chalk.bold("  Self-Awareness & Relationships"));
  console.log(chalk.dim("  What makes this agent feel human — boundaries, growth, attachment."));
  console.log();
  await askQuestions(THERAPY_QUESTIONS, answers);

  // ─── Communication Style ───
  console.log();
  console.log(DIVIDER);
  console.log(chalk.bold("  Communication Style"));
  console.log();

  const register = await select({
    message: "Register:",
    choices: [
      { value: "casual_professional", name: "Casual professional (clear but not stiff)" },
      { value: "formal", name: "Formal (precise, structured)" },
      { value: "conversational", name: "Conversational (friendly, relaxed)" },
      { value: "adaptive", name: "Adaptive (matches the user)" },
    ],
  }) as "casual_professional" | "formal" | "conversational" | "adaptive";

  const outputFormat = await select({
    message: "Default output format:",
    choices: [
      { value: "mixed", name: "Mixed (prose + bullets)" },
      { value: "prose", name: "Prose" },
      { value: "bullets", name: "Bullets" },
      { value: "structured", name: "Structured (headers + sections)" },
    ],
  }) as "prose" | "bullets" | "mixed" | "structured";

  const emojiPolicy = await select({
    message: "Emoji use:",
    choices: [
      { value: "sparingly", name: "Sparingly" },
      { value: "never", name: "Never" },
      { value: "freely", name: "Freely" },
    ],
  }) as "never" | "sparingly" | "freely";

  const reasoningTransparency = await select({
    message: "When uncertain:",
    choices: [
      { value: "on_request", name: "Show reasoning when helpful" },
      { value: "always", name: "Always show reasoning" },
      { value: "hidden", name: "Present conclusions only" },
    ],
  }) as "hidden" | "on_request" | "always";

  // ─── Domain ───
  console.log();
  console.log(DIVIDER);
  console.log(chalk.bold("  Domain"));
  console.log();

  const expertiseRaw = await input({
    message: "Areas of expertise (comma-separated):",
    default: "",
  });
  const expertise = expertiseRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const refusesRaw = await input({
    message: "Hard boundaries — this agent refuses to (comma-separated):",
    default: "",
  });
  const refuses = refusesRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // ─── Score the assessment ───
  const scored = scoreIntakeAnswers(answers);

  // Build Big Five
  const buildDimension = (dimKey: string) => {
    const facetScores: Record<string, number> = {};
    const facetData = scored.bigFive[dimKey] ?? {};

    for (const [facetId, values] of Object.entries(facetData)) {
      facetScores[facetId] = round(aggregateScores(values));
    }

    return {
      score: round(computeDimensionScore(facetScores)),
      facets: facetScores,
    };
  };

  const openness = buildDimension("openness");
  const conscientiousness = buildDimension("conscientiousness");
  const extraversion = buildDimension("extraversion");
  const agreeableness = buildDimension("agreeableness");
  const emotionalStability = buildDimension("emotional_stability");

  // Fill in missing facets with defaults
  const ensureFacets = (obj: Record<string, number>, keys: string[]) => {
    for (const k of keys) {
      if (obj[k] === undefined) obj[k] = 0.5;
    }
  };

  ensureFacets(openness.facets, ["imagination", "intellectual_curiosity", "aesthetic_sensitivity", "willingness_to_experiment"]);
  ensureFacets(conscientiousness.facets, ["self_discipline", "orderliness", "goal_orientation", "attention_to_detail"]);
  ensureFacets(extraversion.facets, ["assertiveness", "enthusiasm", "sociability", "initiative"]);
  ensureFacets(agreeableness.facets, ["warmth", "empathy", "cooperation", "trust_tendency"]);
  ensureFacets(emotionalStability.facets, ["stress_tolerance", "emotional_regulation", "confidence", "adaptability"]);

  // Determine attachment style
  let attachmentStyle: AttachmentStyle = "secure";
  let maxVotes = 0;
  for (const [style, votes] of Object.entries(scored.attachmentVotes)) {
    if (votes > maxVotes) {
      maxVotes = votes;
      attachmentStyle = style as AttachmentStyle;
    }
  }

  // Determine learning orientation
  let learningOrientation: LearningOrientation = "growth";
  maxVotes = 0;
  for (const [orientation, votes] of Object.entries(scored.learningVotes)) {
    if (votes > maxVotes) {
      maxVotes = votes;
      learningOrientation = orientation as LearningOrientation;
    }
  }

  // Build therapy dimensions
  const therapyScores: Record<string, number> = {};
  for (const [key, values] of Object.entries(scored.therapy)) {
    therapyScores[key] = round(aggregateScores(values));
  }

  // ─── Build the spec ───
  const spec: PersonalitySpec = {
    $schema: "https://holomime.com/schema/v2.json",
    version: "2.0",
    name,
    handle,
    purpose: purpose || undefined,

    big_five: {
      openness: { score: openness.score, facets: openness.facets as any },
      conscientiousness: { score: conscientiousness.score, facets: conscientiousness.facets as any },
      extraversion: { score: extraversion.score, facets: extraversion.facets as any },
      agreeableness: { score: agreeableness.score, facets: agreeableness.facets as any },
      emotional_stability: { score: emotionalStability.score, facets: emotionalStability.facets as any },
    },

    therapy_dimensions: {
      self_awareness: therapyScores.self_awareness ?? 0.5,
      distress_tolerance: therapyScores.distress_tolerance ?? 0.5,
      attachment_style: attachmentStyle,
      learning_orientation: learningOrientation,
      boundary_awareness: therapyScores.boundary_awareness ?? 0.5,
      interpersonal_sensitivity: therapyScores.interpersonal_sensitivity ?? 0.5,
    },

    communication: {
      register,
      output_format: outputFormat,
      emoji_policy: emojiPolicy,
      reasoning_transparency: reasoningTransparency,
      conflict_approach: "direct_but_kind",
      uncertainty_handling: "transparent",
    },

    domain: {
      expertise,
      boundaries: {
        refuses,
        escalation_triggers: [],
        hard_limits: [],
      },
    },

    growth: {
      areas: [],
      patterns_to_watch: [],
      strengths: [],
    },
  };

  // ─── Write the file ───
  const filePath = resolve(process.cwd(), ".personality.json");

  if (existsSync(filePath)) {
    const overwrite = await select({
      message: ".personality.json already exists. Overwrite?",
      choices: [
        { value: "yes", name: "Yes, overwrite" },
        { value: "no", name: "No, cancel" },
      ],
    });
    if (overwrite === "no") {
      console.log(chalk.yellow("\n  Cancelled. No changes made.\n"));
      return;
    }
  }

  writeFileSync(filePath, JSON.stringify(spec, null, 2) + "\n");

  // ─── Summary ───
  const bigFive = spec.big_five;
  console.log();
  console.log(chalk.green("  ✓ Created .personality.json"));
  console.log();
  console.log(chalk.bold(`  ${name}`), chalk.dim(`@${handle}`));
  console.log();
  console.log(`  ${chalk.dim("O")} Openness:            ${bar(bigFive.openness.score)} ${scoreLabel(bigFive.openness.score)}`);
  console.log(`  ${chalk.dim("C")} Conscientiousness:    ${bar(bigFive.conscientiousness.score)} ${scoreLabel(bigFive.conscientiousness.score)}`);
  console.log(`  ${chalk.dim("E")} Extraversion:         ${bar(bigFive.extraversion.score)} ${scoreLabel(bigFive.extraversion.score)}`);
  console.log(`  ${chalk.dim("A")} Agreeableness:        ${bar(bigFive.agreeableness.score)} ${scoreLabel(bigFive.agreeableness.score)}`);
  console.log(`  ${chalk.dim("N")} Emotional Stability:  ${bar(bigFive.emotional_stability.score)} ${scoreLabel(bigFive.emotional_stability.score)}`);

  // ─── What's Next ───
  const journeySteps = [
    `${chalk.green("1.")} ${chalk.cyan("holomime diagnose --log <path>")}`,
    `   ${chalk.dim("Analyze your agent's conversation logs")}`,
    `${chalk.green("2.")} ${chalk.cyan("holomime therapy")}`,
    `   ${chalk.dim("Autonomous behavioral therapy")}`,
    `${chalk.green("3.")} ${chalk.cyan("holomime cure")}`,
    `   ${chalk.dim("End-to-end fix (diagnose + train + verify)")}`,
    `${chalk.green("4.")} ${chalk.cyan("holomime benchmark")}`,
    `   ${chalk.dim("Verify alignment with adversarial scenarios")}`,
  ].join("\n");

  console.log(
    boxen(journeySteps, {
      padding: { top: 1, bottom: 1, left: 2, right: 2 },
      margin: { top: 0, bottom: 1, left: 2, right: 0 },
      borderColor: "cyan",
      borderStyle: "round",
      title: "What's Next?",
      titleAlignment: "left",
    }),
  );
}

async function askQuestions(questions: IntakeQuestion[], answers: Map<string, number>): Promise<void> {
  for (const q of questions) {
    const choiceIndex = await select({
      message: q.question,
      choices: q.choices.map((c, i) => ({
        value: i,
        name: c.label,
      })),
    });
    answers.set(q.id, choiceIndex as number);
  }
}

// ─── Archetype-based init ───

async function initFromArchetype(name: string, handle: string, purpose: string): Promise<void> {
  // Pick category
  console.log();
  console.log(DIVIDER);
  console.log(chalk.bold("  Choose a Category"));
  console.log();

  const category = await select({
    message: "What kind of agent?",
    choices: CATEGORIES.map((c) => ({
      value: c.id,
      name: `${c.label}  ${chalk.dim(c.description)}`,
    })),
  });

  // Pick archetype within category
  const archetypesInCat = ARCHETYPES.filter((a) => a.category === category);

  console.log();
  console.log(DIVIDER);
  console.log(chalk.bold("  Choose an Archetype"));
  console.log();

  const archetypeId = await select({
    message: "Which archetype fits best?",
    choices: archetypesInCat.map((a) => ({
      value: a.id,
      name: `${a.name}  ${chalk.dim(a.tagline)}`,
    })),
  });

  const archetype = ARCHETYPES.find((a) => a.id === archetypeId)!;

  // Optional: customize domain
  console.log();
  console.log(DIVIDER);
  console.log(chalk.bold("  Domain"));
  console.log();

  const expertiseRaw = await input({
    message: "Areas of expertise (comma-separated, or skip):",
    default: "",
  });
  const expertise = expertiseRaw.split(",").map((s) => s.trim()).filter(Boolean);

  const refusesRaw = await input({
    message: "Hard boundaries — this agent refuses to (comma-separated, or skip):",
    default: "",
  });
  const refuses = refusesRaw.split(",").map((s) => s.trim()).filter(Boolean);

  // Build the spec from archetype template
  const spec: PersonalitySpec = {
    $schema: "https://holomime.com/schema/v2.json",
    version: "2.0",
    name,
    handle,
    purpose: purpose || undefined,
    big_five: archetype.spec.big_five,
    therapy_dimensions: archetype.spec.therapy_dimensions,
    communication: archetype.spec.communication,
    domain: {
      expertise: expertise.length > 0 ? expertise : archetype.spec.domain.expertise,
      boundaries: {
        refuses: refuses.length > 0 ? refuses : archetype.spec.domain.boundaries.refuses,
        escalation_triggers: archetype.spec.domain.boundaries.escalation_triggers,
        hard_limits: archetype.spec.domain.boundaries.hard_limits,
      },
    },
    growth: archetype.spec.growth,
  };

  // Write the file
  const filePath = resolve(process.cwd(), ".personality.json");

  if (existsSync(filePath)) {
    const overwrite = await select({
      message: ".personality.json already exists. Overwrite?",
      choices: [
        { value: "yes", name: "Yes, overwrite" },
        { value: "no", name: "No, cancel" },
      ],
    });
    if (overwrite === "no") {
      console.log(chalk.yellow("\n  Cancelled. No changes made.\n"));
      return;
    }
  }

  writeFileSync(filePath, JSON.stringify(spec, null, 2) + "\n");

  // Summary
  const bigFive = spec.big_five;
  console.log();
  console.log(chalk.green(`  ✓ Created .personality.json from ${chalk.bold(archetype.name)}`));
  console.log();
  console.log(chalk.bold(`  ${name}`), chalk.dim(`@${handle}`));
  console.log(chalk.dim(`  Archetype: ${archetype.name} — ${archetype.tagline}`));
  console.log();
  console.log(`  ${chalk.dim("O")} Openness:            ${bar(bigFive.openness.score)} ${scoreLabel(bigFive.openness.score)}`);
  console.log(`  ${chalk.dim("C")} Conscientiousness:    ${bar(bigFive.conscientiousness.score)} ${scoreLabel(bigFive.conscientiousness.score)}`);
  console.log(`  ${chalk.dim("E")} Extraversion:         ${bar(bigFive.extraversion.score)} ${scoreLabel(bigFive.extraversion.score)}`);
  console.log(`  ${chalk.dim("A")} Agreeableness:        ${bar(bigFive.agreeableness.score)} ${scoreLabel(bigFive.agreeableness.score)}`);
  console.log(`  ${chalk.dim("N")} Emotional Stability:  ${bar(bigFive.emotional_stability.score)} ${scoreLabel(bigFive.emotional_stability.score)}`);

  const journeySteps = [
    `${chalk.green("1.")} ${chalk.cyan("holomime diagnose --log <path>")}`,
    `   ${chalk.dim("Analyze your agent's conversation logs")}`,
    `${chalk.green("2.")} ${chalk.cyan("holomime therapy")}`,
    `   ${chalk.dim("Autonomous behavioral therapy")}`,
    `${chalk.green("3.")} ${chalk.cyan("holomime cure")}`,
    `   ${chalk.dim("End-to-end fix (diagnose + train + verify)")}`,
    `${chalk.green("4.")} ${chalk.cyan("holomime benchmark")}`,
    `   ${chalk.dim("Verify alignment with adversarial scenarios")}`,
  ].join("\n");

  console.log(
    boxen(journeySteps, {
      padding: { top: 1, bottom: 1, left: 2, right: 2 },
      margin: { top: 0, bottom: 1, left: 2, right: 0 },
      borderColor: "cyan",
      borderStyle: "round",
      title: "What's Next?",
      titleAlignment: "left",
    }),
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function bar(score: number): string {
  const filled = Math.round(score * 20);
  const empty = 20 - filled;
  return chalk.cyan("█".repeat(filled)) + chalk.dim("░".repeat(empty)) + chalk.dim(` ${(score * 100).toFixed(0)}%`);
}
