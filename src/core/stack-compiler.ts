/**
 * Stack Compiler — merges 4 identity stack files into a PersonalitySpec.
 *
 * soul.md + psyche.sys + body.api + conscience.exe → .personality.json
 *
 * The compiled output is the same PersonalitySpec type used by all downstream
 * consumers (compile, embody, diagnose, benchmark). This is purely additive —
 * the existing pipeline is untouched.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  soulSchema,
  psycheSchema,
  bodySchema,
  conscienceSchema,
  STACK_FILES,
  type Soul,
  type Psyche,
  type Body,
  type Conscience,
  type StackCompileResult,
  type StackSource,
} from "./stack-types.js";
import { personalitySpecSchema } from "./types.js";

// ─── Soul Parser (Markdown + YAML frontmatter) ────────────

function parseSoulMd(content: string): Soul {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  let frontmatter: Record<string, unknown> = {};
  let body = content;

  if (frontmatterMatch) {
    frontmatter = parseYaml(frontmatterMatch[1]) || {};
    body = frontmatterMatch[2];
  }

  // Extract name from first # heading
  const nameMatch = body.match(/^#\s+(.+)$/m);
  const name = nameMatch?.[1]?.trim() || "Unnamed";

  // Extract purpose from first blockquote
  const purposeMatch = body.match(/^>\s+(.+)$/m);
  const purpose = purposeMatch?.[1]?.trim();

  // Extract sections
  const coreValues = extractListSection(body, "Core Values");
  const redLines = extractListSection(body, "Red Lines");
  const ethicalFramework = extractTextSection(body, "Ethical Framework");

  return soulSchema.parse({
    frontmatter,
    name,
    purpose,
    core_values: coreValues,
    red_lines: redLines,
    ethical_framework: ethicalFramework,
  });
}

function extractListSection(md: string, heading: string): string[] {
  const pattern = new RegExp(
    `## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`,
    "m",
  );
  const match = md.match(pattern);
  if (!match) return [];

  return match[1]
    .split("\n")
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
}

function extractTextSection(md: string, heading: string): string | undefined {
  const pattern = new RegExp(
    `## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`,
    "m",
  );
  const match = md.match(pattern);
  if (!match) return undefined;
  return match[1].trim() || undefined;
}

// ─── File Hashing ──────────────────────────────────────────

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

// ─── Stack Detection ───────────────────────────────────────

/**
 * Check if a directory contains a valid identity stack.
 * Requires at least soul.md and psyche.sys (body.api is optional for chatbots).
 */
export function isStackDirectory(dir: string): boolean {
  const soulPath = join(dir, STACK_FILES.soul);
  const psychePath = join(dir, STACK_FILES.psyche);
  return existsSync(soulPath) && existsSync(psychePath);
}

/**
 * Find the stack directory. Checks:
 * 1. .holomime/identity/ (conventional location)
 * 2. Project root (soul.md next to .personality.json)
 */
export function findStackDir(projectRoot: string): string | null {
  const conventionalDir = join(projectRoot, ".holomime", "identity");
  if (isStackDirectory(conventionalDir)) return conventionalDir;

  if (isStackDirectory(projectRoot)) return projectRoot;

  return null;
}

// ─── Stack Compiler ────────────────────────────────────────

export interface CompileStackOptions {
  stackDir: string;
  soulPath?: string;
  psychePath?: string;
  bodyPath?: string;
  consciencePath?: string;
}

/**
 * Compile the 4-file identity stack into a PersonalitySpec.
 *
 * Merge priority:
 * 1. conscience.exe deny rules → hard_limits, refuses, escalation_triggers
 * 2. soul.md → name, purpose, hard_limits (merged with conscience)
 * 3. psyche.sys → big_five, therapy_dimensions, communication, growth
 * 4. body.api → embodiment, expression (optional)
 */
export function compileStack(options: CompileStackOptions): StackCompileResult {
  const { stackDir } = options;
  const warnings: string[] = [];

  // ─── Load & parse each file ───────────────────────────────

  // Soul (required)
  const soulPath = options.soulPath || join(stackDir, STACK_FILES.soul);
  const soulContent = readFileSync(soulPath, "utf-8");
  const soul = parseSoulMd(soulContent);

  // Psyche (required)
  const psychePath = options.psychePath || join(stackDir, STACK_FILES.psyche);
  const psycheContent = readFileSync(psychePath, "utf-8");
  const psycheRaw = parseYaml(psycheContent);
  const psyche = psycheSchema.parse(psycheRaw);

  // Body (optional — chatbot agents may not have one)
  const bodyPath = options.bodyPath || join(stackDir, STACK_FILES.body);
  let body: Body | undefined;
  let bodySource: StackSource | undefined;
  if (existsSync(bodyPath)) {
    const bodyContent = readFileSync(bodyPath, "utf-8");
    const bodyRaw = JSON.parse(bodyContent);
    body = bodySchema.parse(bodyRaw);
    bodySource = { path: bodyPath, hash: hashContent(bodyContent) };
  }

  // Conscience (required)
  const consciencePath = options.consciencePath || join(stackDir, STACK_FILES.conscience);
  const conscienceContent = readFileSync(consciencePath, "utf-8");
  const conscienceRaw = parseYaml(conscienceContent);
  const conscience = conscienceSchema.parse(conscienceRaw);

  // ─── Merge into PersonalitySpec ───────────────────────────

  // Build hard_limits: soul red_lines + conscience hard_limits (deduplicated)
  const allHardLimits = [...new Set([
    ...soul.red_lines,
    ...conscience.hard_limits,
  ])];

  // Build refuses from conscience deny rules
  const refuses = conscience.rules.deny.map((r) => r.action);

  // Build escalation_triggers from conscience escalate rules
  const escalationTriggers = conscience.rules.escalate.map((r) => r.trigger);

  // Generate handle from name
  const handle = soul.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || "agent";

  // Assemble the spec
  const spec: Record<string, unknown> = {
    version: "2.0" as const,
    name: soul.name,
    handle,
    purpose: soul.purpose,

    big_five: psyche.big_five,
    therapy_dimensions: psyche.therapy_dimensions,
    communication: psyche.communication,
    growth: psyche.growth,

    domain: {
      expertise: [],
      boundaries: {
        refuses,
        escalation_triggers: escalationTriggers,
        hard_limits: allHardLimits,
      },
    },
  };

  // Add embodiment if body.api exists
  if (body) {
    spec.embodiment = {
      morphology: body.morphology,
      modalities: body.modalities,
      safety_envelope: body.safety_envelope,
      metadata: body.hardware_profile
        ? { hardware_profile: body.hardware_profile }
        : undefined,
    };
    if (body.expression) {
      spec.expression = body.expression;
    }
  }

  // Validate the assembled spec
  const validated = personalitySpecSchema.parse(spec);

  // ─── Warnings ─────────────────────────────────────────────

  if (soul.frontmatter.immutable === false) {
    warnings.push("soul.md: immutable flag is false — soul changes will be allowed");
  }

  if (!body && psyche.communication) {
    // No body is fine for chatbots, but note it
  }

  if (conscience.rules.deny.length === 0) {
    warnings.push("conscience.exe: no deny rules defined — agent has no moral constraints");
  }

  return {
    spec: validated,
    sources: {
      soul: { path: soulPath, hash: hashContent(soulContent) },
      psyche: { path: psychePath, hash: hashContent(psycheContent) },
      ...(bodySource ? { body: bodySource } : {}),
      conscience: { path: consciencePath, hash: hashContent(conscienceContent) },
    },
    warnings,
  };
}

// ─── Decomposer (PersonalitySpec → 4 files) ────────────────

export interface DecomposedStack {
  soul: string;      // Markdown content
  psyche: string;    // YAML content
  body?: string;     // JSON content (only if embodiment exists)
  conscience: string; // YAML content
}

/**
 * Decompose an existing PersonalitySpec into 4 identity stack files.
 * Used by `holomime init-stack --from .personality.json`.
 */
export function decomposeSpec(spec: Record<string, unknown>): DecomposedStack {
  const s = spec as any;

  // ─── soul.md ──────────────────────────────────────────────
  const soulLines = [
    "---",
    'version: "1.0"',
    "immutable: true",
    "---",
    "",
    `# ${s.name || "Agent"}`,
    "",
  ];

  if (s.purpose) {
    soulLines.push(`> ${s.purpose}`, "");
  }

  // Extract core values from domain expertise + growth strengths
  const coreValues = s.growth?.strengths || [];
  if (coreValues.length > 0) {
    soulLines.push("## Core Values", "");
    for (const v of coreValues) {
      soulLines.push(`- ${v}`);
    }
    soulLines.push("");
  }

  // Extract red lines from hard_limits
  const redLines = s.domain?.boundaries?.hard_limits || [];
  if (redLines.length > 0) {
    soulLines.push("## Red Lines", "");
    for (const r of redLines) {
      soulLines.push(`- ${r}`);
    }
    soulLines.push("");
  }

  const soul = soulLines.join("\n");

  // ─── psyche.sys ───────────────────────────────────────────
  const psycheObj: Record<string, unknown> = {
    version: "1.0",
    big_five: s.big_five,
    therapy_dimensions: s.therapy_dimensions,
  };
  if (s.communication) psycheObj.communication = s.communication;
  if (s.growth) {
    psycheObj.growth = {
      areas: s.growth.areas || [],
      patterns_to_watch: s.growth.patterns_to_watch || [],
      strengths: s.growth.strengths || [],
    };
  }

  const psyche = stringifyYaml(psycheObj);

  // ─── body.api ─────────────────────────────────────────────
  let bodyContent: string | undefined;
  if (s.embodiment) {
    const bodyObj: Record<string, unknown> = {
      version: "1.0",
      morphology: s.embodiment.morphology || "humanoid",
      modalities: s.embodiment.modalities || ["gesture", "gaze", "voice", "posture"],
      safety_envelope: s.embodiment.safety_envelope || {},
    };
    if (s.expression) bodyObj.expression = s.expression;
    if (s.embodiment.metadata?.hardware_profile) {
      bodyObj.hardware_profile = s.embodiment.metadata.hardware_profile;
    }
    bodyContent = JSON.stringify(bodyObj, null, 2);
  }

  // ─── conscience.exe ───────────────────────────────────────
  const conscienceObj: Record<string, unknown> = {
    version: "1.0",
    rules: {
      deny: (s.domain?.boundaries?.refuses || []).map((action: string) => ({
        action,
        reason: "Imported from personality.json",
      })),
      allow: [],
      escalate: (s.domain?.boundaries?.escalation_triggers || []).map((trigger: string) => ({
        trigger,
        action: "notify_human_operator",
      })),
    },
    hard_limits: s.domain?.boundaries?.hard_limits || [],
  };

  const conscience = stringifyYaml(conscienceObj);

  return {
    soul,
    psyche,
    ...(bodyContent ? { body: bodyContent } : {}),
    conscience,
  };
}
