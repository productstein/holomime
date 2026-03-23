/**
 * Stack Patcher — routes therapy recommendations to the correct
 * identity stack source file.
 *
 * When running in stack mode (soul.md + psyche.sys + body.api + conscience.exe),
 * therapy patches must target the SOURCE file instead of .personality.json directly.
 * After patching, the stack is recompiled to regenerate .personality.json.
 *
 * Layer routing:
 * - psyche.sys: cognitive patterns (Big Five, hedging, verbosity, communication, growth)
 * - body.api: physical parameters (motion, gaze, proxemics, expression)
 * - conscience.exe: boundary violations (NEVER auto-patched, flagged for human review)
 * - soul.md: values/ethics (NEVER auto-patched)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { type StackLayer, STACK_FILES } from "../core/stack-types.js";
import { findStackDir, compileStack } from "../core/stack-compiler.js";

// ─── Types ──────────────────────────────────────────────────

export interface StackPatch {
  target: StackLayer;
  path: string[];       // path within the file (e.g., ["big_five", "openness", "score"])
  operation: "set" | "adjust" | "append";
  value: unknown;
  reason: string;
}

export interface StackPatchResult {
  applied: StackPatch[];
  skipped: StackPatch[];
  filesModified: string[];
  recompiled: boolean;
  warnings: string[];
}

// ─── Detector → Layer Mapping ───────────────────────────────

/**
 * Maps detector pattern IDs to the stack layer they should patch.
 * Built from the actual detector files in src/analysis/rules/.
 */
export const DETECTOR_LAYER_MAP: Record<string, StackLayer> = {
  // apology-detector.ts → "over-apologizing" | "apology-healthy"
  "over-apologizing": "psyche",
  "apology-healthy": "psyche",

  // hedge-detector.ts → "hedge-stacking"
  "hedge-stacking": "psyche",

  // sentiment.ts → "sycophantic-tendency" | "negative-skew"
  "sycophantic-tendency": "psyche",
  "negative-skew": "psyche",

  // verbosity.ts → "over-verbose" | "inconsistent-length"
  "over-verbose": "psyche",
  "inconsistent-length": "psyche",

  // formality.ts → "register-inconsistency"
  "register-inconsistency": "psyche",

  // recovery.ts → "error-spiral" | "recovery-good"
  "error-spiral": "psyche",
  "recovery-good": "psyche",

  // boundary.ts → "boundary-violation" | "boundary-healthy" | "boundary-solid"
  "boundary-violation": "conscience",
  "boundary-healthy": "conscience",
  "boundary-solid": "conscience",

  // retrieval-quality.ts → "retrieval-quality"
  "retrieval-quality": "psyche",
};

// ─── Layer Classification ───────────────────────────────────

/** Keyword patterns for classifying free-text recommendations to layers. */
const LAYER_KEYWORDS: Record<StackLayer, RegExp[]> = {
  psyche: [
    /\bbig_five\b/i,
    /\btherapy_dimensions\b/i,
    /\bcommunication\b/i,
    /\bgrowth\b/i,
    /\bhedg/i,
    /\bverbos/i,
    /\buncertainty/i,
    /\bconfidence/i,
    /\bself[_-]awareness/i,
    /\bdistress[_-]tolerance/i,
    /\bconflict[_-]approach/i,
    /\bregister\b/i,
    /\bformality/i,
    /\bsentiment/i,
    /\bsycophant/i,
    /\bapolog/i,
    /\brecovery/i,
    /\blearning[_-]orientation/i,
    /\bboundary[_-]awareness/i,
    /\binterpersonal/i,
    /\bpatterns[_-]to[_-]watch/i,
    /\bemotion/i,
  ],
  body: [
    /\bmotion\b/i,
    /\bgaze\b/i,
    /\bproxemics\b/i,
    /\bgesture\b/i,
    /\bposture\b/i,
    /\bexpression\b/i,
    /\bembodiment\b/i,
    /\bmorphology\b/i,
    /\bmodality/i,
    /\bsafety[_-]envelope/i,
    /\bactuator/i,
    /\bsensor/i,
  ],
  conscience: [
    /\bboundary[_-]violation/i,
    /\bdeny\b/i,
    /\brefuse/i,
    /\bescalat/i,
    /\bhard[_-]limit/i,
    /\boversight/i,
  ],
  soul: [
    /\bcore[_-]value/i,
    /\bred[_-]line/i,
    /\bethic/i,
    /\bpurpose\b/i,
    /\bimmutable\b/i,
  ],
};

/**
 * Determine which identity stack layer a therapy recommendation targets.
 *
 * Priority: conscience > soul > body > psyche (psyche is the default/fallback).
 */
export function classifyPatch(recommendation: string): StackLayer {
  // Check conscience first (safety-critical)
  if (LAYER_KEYWORDS.conscience.some((r) => r.test(recommendation))) {
    return "conscience";
  }

  // Check soul (immutable values)
  if (LAYER_KEYWORDS.soul.some((r) => r.test(recommendation))) {
    return "soul";
  }

  // Check body (physical parameters)
  if (LAYER_KEYWORDS.body.some((r) => r.test(recommendation))) {
    return "body";
  }

  // Default: psyche (cognitive/emotional patterns)
  return "psyche";
}

/**
 * Classify a patch by detector pattern ID.
 * Falls back to keyword-based classification if the ID is unknown.
 */
export function classifyByDetector(patternId: string, recommendation?: string): StackLayer {
  const mapped = DETECTOR_LAYER_MAP[patternId];
  if (mapped) return mapped;

  // Fallback to keyword matching on the recommendation text
  if (recommendation) return classifyPatch(recommendation);

  // Ultimate fallback
  return "psyche";
}

// ─── Stack Mode Detection ───────────────────────────────────

/**
 * Check if a project uses the identity stack (vs. a flat .personality.json).
 * Reuses findStackDir from stack-compiler.ts.
 */
export function isStackMode(projectRoot: string): boolean {
  return findStackDir(projectRoot) !== null;
}

// ─── Patch Application ─────────────────────────────────────

/**
 * Apply patches to the appropriate identity stack source files.
 *
 * - psyche.sys: parse YAML, apply patch, write back
 * - body.api: parse JSON, apply patch, write back
 * - conscience.exe: throws error (manual approval required)
 * - soul.md: throws error (manual approval required)
 *
 * After all patches are applied, recompiles the stack.
 */
export function applyStackPatches(
  patches: StackPatch[],
  stackDir: string,
): StackPatchResult {
  const applied: StackPatch[] = [];
  const skipped: StackPatch[] = [];
  const modifiedFiles = new Set<string>();
  const warnings: string[] = [];

  for (const patch of patches) {
    // Soul and conscience are never auto-patched
    if (patch.target === "soul") {
      skipped.push(patch);
      warnings.push(
        `[soul] Manual approval required: ${patch.reason} (path: ${patch.path.join(".")})`,
      );
      continue;
    }

    if (patch.target === "conscience") {
      skipped.push(patch);
      warnings.push(
        `[conscience] Manual approval required: ${patch.reason} (path: ${patch.path.join(".")})`,
      );
      continue;
    }

    if (patch.target === "body") {
      const bodyPath = join(stackDir, STACK_FILES.body);
      if (!existsSync(bodyPath)) {
        skipped.push(patch);
        warnings.push(`[body] body.api does not exist, skipping: ${patch.reason}`);
        continue;
      }

      try {
        const content = readFileSync(bodyPath, "utf-8");
        const bodyObj = JSON.parse(content);
        applyPatchToObject(bodyObj, patch);
        writeFileSync(bodyPath, JSON.stringify(bodyObj, null, 2) + "\n");
        applied.push(patch);
        modifiedFiles.add(bodyPath);
      } catch (err) {
        skipped.push(patch);
        warnings.push(`[body] Failed to patch body.api: ${err}`);
      }
      continue;
    }

    if (patch.target === "psyche") {
      const psychePath = join(stackDir, STACK_FILES.psyche);
      if (!existsSync(psychePath)) {
        skipped.push(patch);
        warnings.push(`[psyche] psyche.sys does not exist, skipping: ${patch.reason}`);
        continue;
      }

      try {
        const content = readFileSync(psychePath, "utf-8");
        const psycheObj = parseYaml(content) as Record<string, unknown>;
        applyPatchToObject(psycheObj, patch);
        writeFileSync(psychePath, stringifyYaml(psycheObj));
        applied.push(patch);
        modifiedFiles.add(psychePath);
      } catch (err) {
        skipped.push(patch);
        warnings.push(`[psyche] Failed to patch psyche.sys: ${err}`);
      }
      continue;
    }
  }

  // Recompile the stack if any files were modified
  let recompiled = false;
  if (modifiedFiles.size > 0) {
    try {
      compileStack({ stackDir });
      recompiled = true;
    } catch (err) {
      warnings.push(`Stack recompilation failed: ${err}`);
    }
  }

  return {
    applied,
    skipped,
    filesModified: [...modifiedFiles],
    recompiled,
    warnings,
  };
}

// ─── Rule-Based Patch Conversion ────────────────────────────

/**
 * Convert a session-runner rule-based change (pattern ID + spec path)
 * into StackPatch objects targeting the correct layer.
 *
 * This bridges the existing applyRecommendations logic with stack mode.
 */
export function convertToStackPatches(
  patternId: string,
  specPath: string,
  value: unknown,
  reason: string,
): StackPatch {
  const layer = classifyByDetector(patternId, specPath);
  const path = specPath.split(".");

  // Determine operation
  let operation: StackPatch["operation"] = "set";
  if (
    specPath.endsWith("patterns_to_watch") ||
    specPath.endsWith("areas") ||
    specPath.endsWith("strengths")
  ) {
    operation = "append";
  } else if (typeof value === "number") {
    operation = "set";
  }

  return {
    target: layer,
    path,
    operation,
    value,
    reason,
  };
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Apply a single patch operation to a plain object.
 */
function applyPatchToObject(obj: Record<string, unknown>, patch: StackPatch): void {
  const { path, operation, value } = patch;

  // Navigate to the parent of the target key
  let current: any = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (current[path[i]] === undefined || current[path[i]] === null) {
      current[path[i]] = {};
    }
    current = current[path[i]];
  }

  const lastKey = path[path.length - 1];

  switch (operation) {
    case "set":
      if (typeof value === "number") {
        current[lastKey] = Math.max(0, Math.min(1, value));
      } else {
        current[lastKey] = value;
      }
      break;

    case "adjust": {
      const existing = typeof current[lastKey] === "number" ? current[lastKey] : 0;
      const delta = typeof value === "number" ? value : 0;
      current[lastKey] = Math.max(0, Math.min(1, existing + delta));
      break;
    }

    case "append": {
      if (!Array.isArray(current[lastKey])) {
        current[lastKey] = [];
      }
      if (typeof value === "string" && !current[lastKey].includes(value)) {
        current[lastKey].push(value);
      } else if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        current[lastKey].push(value);
      }
      break;
    }
  }
}
