/**
 * Stack Compiler — merges 5 identity stack files into a PersonalitySpec.
 *
 * soul.md + mind.sys + purpose.cfg + body.api + conscience.exe → .personality.json
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
  mindSchema,
  purposeSchema,
  shadowSchema,
  memorySchema,
  bodySchema,
  conscienceSchema,
  egoSchema,
  STACK_FILES,
  type Soul,
  type Mind,
  type Purpose,
  type Shadow,
  type Memory,
  type Body,
  type Conscience,
  type Ego,
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
 * Requires at least soul.md and mind.sys (body.api and purpose.cfg are optional).
 */
export function isStackDirectory(dir: string): boolean {
  const soulPath = join(dir, STACK_FILES.soul);
  const mindPath = join(dir, STACK_FILES.mind);
  return existsSync(soulPath) && existsSync(mindPath);
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
  mindPath?: string;
  purposePath?: string;
  shadowPath?: string;
  memoryPath?: string;
  bodyPath?: string;
  consciencePath?: string;
  egoPath?: string;
}

/**
 * Compile the 5-file identity stack into a PersonalitySpec.
 *
 * Merge priority:
 * 1. conscience.exe deny rules → hard_limits, refuses, escalation_triggers
 * 2. soul.md → name, purpose (fallback), hard_limits (merged with conscience)
 * 3. mind.sys → big_five, therapy_dimensions, communication, growth
 * 4. purpose.cfg → purpose (overrides soul), domain.expertise (optional)
 * 5. body.api → embodiment, expression (optional)
 */
export function compileStack(options: CompileStackOptions): StackCompileResult {
  const { stackDir } = options;
  const warnings: string[] = [];

  // ─── Load & parse each file ───────────────────────────────

  // Soul (required)
  const soulPath = options.soulPath || join(stackDir, STACK_FILES.soul);
  const soulContent = readFileSync(soulPath, "utf-8");
  const soul = parseSoulMd(soulContent);

  // Mind (required)
  const mindPath = options.mindPath || join(stackDir, STACK_FILES.mind);
  const mindContent = readFileSync(mindPath, "utf-8");
  const mindRaw = parseYaml(mindContent);
  const mind = mindSchema.parse(mindRaw);

  // Purpose (optional — defaults to general-purpose)
  const purposePath = options.purposePath || join(stackDir, STACK_FILES.purpose);
  let purpose: Purpose | undefined;
  let purposeSource: StackSource | undefined;
  if (existsSync(purposePath)) {
    const purposeContent = readFileSync(purposePath, "utf-8");
    const purposeRaw = parseYaml(purposeContent);
    purpose = purposeSchema.parse(purposeRaw);
    purposeSource = { path: purposePath, hash: hashContent(purposeContent) };
  }

  // Shadow (optional — auto-generated by diagnosis, read-only input)
  const shadowPath = options.shadowPath || join(stackDir, STACK_FILES.shadow);
  let shadow: Shadow | undefined;
  let shadowSource: StackSource | undefined;
  if (existsSync(shadowPath)) {
    const shadowContent = readFileSync(shadowPath, "utf-8");
    const shadowRaw = parseYaml(shadowContent);
    shadow = shadowSchema.parse(shadowRaw);
    shadowSource = { path: shadowPath, hash: hashContent(shadowContent) };
  }

  // Memory (optional — accumulated experience)
  const memoryPath = options.memoryPath || join(stackDir, STACK_FILES.memory);
  let memory: Memory | undefined;
  let memorySource: StackSource | undefined;
  if (existsSync(memoryPath)) {
    const memoryContent = readFileSync(memoryPath, "utf-8");
    const memoryRaw = parseYaml(memoryContent);
    memory = memorySchema.parse(memoryRaw);
    memorySource = { path: memoryPath, hash: hashContent(memoryContent) };
  }

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

  // Ego (optional — runtime mediation config)
  const egoPath = options.egoPath || join(stackDir, STACK_FILES.ego);
  let ego: Ego | undefined;
  let egoSource: StackSource | undefined;
  if (existsSync(egoPath)) {
    const egoContent = readFileSync(egoPath, "utf-8");
    const egoRaw = parseYaml(egoContent);
    ego = egoSchema.parse(egoRaw);
    egoSource = { path: egoPath, hash: hashContent(egoContent) };
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

  // Purpose: prefer purpose.cfg role, fallback to soul.md purpose
  const agentPurpose = purpose?.role || soul.purpose;

  // Domain expertise: purpose.cfg domain + memory.store knowledge (deduplicated)
  const expertise = [...new Set([
    ...(purpose?.domain || []),
    ...(memory?.knowledge_gained || []),
  ])];

  // Assemble the spec
  const spec: Record<string, unknown> = {
    version: "2.0" as const,
    name: soul.name,
    handle,
    purpose: agentPurpose,

    big_five: mind.big_five,
    therapy_dimensions: mind.therapy_dimensions,
    communication: mind.communication,
    growth: mind.growth,

    domain: {
      expertise,
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

  if (!purpose) {
    warnings.push("purpose.cfg: not found — using defaults (general-purpose agent)");
  }

  if (shadow && shadow.detected_patterns.length > 0) {
    const critical = shadow.detected_patterns.filter((p) => p.severity === "critical");
    if (critical.length > 0) {
      warnings.push(`shadow.log: ${critical.length} critical pattern(s) detected — therapy recommended`);
    }
  }

  if (!ego) {
    warnings.push("ego.runtime: not found — using defaults (conscience-first mediation)");
  }

  if (conscience.rules.deny.length === 0) {
    warnings.push("conscience.exe: no deny rules defined — agent has no moral constraints");
  }

  return {
    spec: validated,
    sources: {
      soul: { path: soulPath, hash: hashContent(soulContent) },
      mind: { path: mindPath, hash: hashContent(mindContent) },
      ...(purposeSource ? { purpose: purposeSource } : {}),
      ...(shadowSource ? { shadow: shadowSource } : {}),
      ...(memorySource ? { memory: memorySource } : {}),
      ...(bodySource ? { body: bodySource } : {}),
      conscience: { path: consciencePath, hash: hashContent(conscienceContent) },
      ...(egoSource ? { ego: egoSource } : {}),
    },
    warnings,
  };
}

// ─── Decomposer (PersonalitySpec → 7 files) ────────────────

export interface DecomposedStack {
  soul: string;       // Markdown content
  mind: string;       // YAML content
  purpose: string;    // YAML content
  shadow: string;     // YAML content (empty log)
  memory: string;     // YAML content (empty store)
  body?: string;      // JSON content (only if embodiment exists)
  conscience: string; // YAML content
  ego: string;        // YAML content
}

/**
 * Decompose an existing PersonalitySpec into 5 identity stack files.
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

  // ─── mind.sys ──────────────────────────────────────────────
  const mindObj: Record<string, unknown> = {
    version: "1.0",
    big_five: s.big_five,
    therapy_dimensions: s.therapy_dimensions,
  };
  if (s.communication) mindObj.communication = s.communication;
  if (s.growth) {
    mindObj.growth = {
      areas: s.growth.areas || [],
      patterns_to_watch: s.growth.patterns_to_watch || [],
      strengths: s.growth.strengths || [],
    };
  }

  const mind = stringifyYaml(mindObj);

  // ─── purpose.cfg ───────────────────────────────────────────
  const purposeObj: Record<string, unknown> = {
    version: "1.0",
    role: s.purpose || "General-purpose AI assistant",
    objectives: ["Help users accomplish their goals"],
    domain: s.domain?.expertise || ["general"],
    stakeholders: ["end-users"],
    success_criteria: ["Task completion accuracy"],
    context: "Production deployment",
  };

  const purposeContent = stringifyYaml(purposeObj);

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

  // ─── shadow.log ────────────────────────────────────────────
  const shadowObj = {
    version: "1.0",
    detected_patterns: [],
    blind_spots: [],
    therapy_outcomes: [],
  };
  const shadowContent = stringifyYaml(shadowObj);

  // ─── memory.store ──────────────────────────────────────────
  const memoryObj = {
    version: "1.0",
    learned_contexts: [],
    interaction_patterns: [],
    knowledge_gained: [],
    relationship_history: [],
  };
  const memoryContent = stringifyYaml(memoryObj);

  // ─── ego.runtime ──────────────────────────────────────────
  const egoObj = {
    version: "1.0",
    conflict_resolution: "conscience_first",
    adaptation_rate: 0.5,
    emotional_regulation: 0.7,
    response_strategy: "balanced",
    mediation_rules: [],
  };
  const egoContent = stringifyYaml(egoObj);

  return {
    soul,
    mind,
    purpose: purposeContent,
    shadow: shadowContent,
    memory: memoryContent,
    ...(bodyContent ? { body: bodyContent } : {}),
    conscience,
    ego: egoContent,
  };
}
