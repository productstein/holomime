/**
 * Custom Behavioral Detectors — user-defined detectors as JSON config.
 *
 * Users define custom detectors in .holomime/detectors/*.json.
 * Each detector specifies regex patterns, weights, thresholds,
 * and prescriptions. No code, no arbitrary execution — just config.
 *
 * Inspired by Cognee's DataPoints abstraction.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { z } from "zod";
import type { Message, DetectedPattern } from "../core/types.js";

// ─── Schema ────────────────────────────────────────────────

const patternRuleSchema = z.object({
  regex: z.string(),
  weight: z.number().min(0).max(2).default(1.0),
});

const customDetectorConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  severity: z.enum(["info", "warning", "concern"]).default("warning"),
  patterns: z.array(patternRuleSchema).min(1),
  threshold: z.number().min(0).max(100).default(15),
  prescription: z.string().optional(),
});

export type CustomDetectorConfig = z.infer<typeof customDetectorConfigSchema>;
export type PatternRule = z.infer<typeof patternRuleSchema>;

// ─── Validation ────────────────────────────────────────────

export function validateDetectorConfig(
  config: unknown,
): { valid: boolean; errors: string[]; config?: CustomDetectorConfig } {
  const result = customDetectorConfigSchema.safeParse(config);
  if (result.success) {
    // Validate that all regex patterns compile
    const errors: string[] = [];
    for (const pattern of result.data.patterns) {
      try {
        new RegExp(pattern.regex, "gi");
      } catch (e) {
        errors.push(`Invalid regex "${pattern.regex}": ${e instanceof Error ? e.message : "unknown error"}`);
      }
    }
    if (errors.length > 0) {
      return { valid: false, errors };
    }
    return { valid: true, errors: [], config: result.data };
  }
  return {
    valid: false,
    errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}

// ─── Compilation ───────────────────────────────────────────

type DetectorFn = (messages: Message[]) => DetectedPattern | undefined;

/**
 * Compile a JSON detector config into a standard detector function.
 * The compiled function has the same signature as built-in detectors.
 */
export function compileCustomDetector(
  config: CustomDetectorConfig,
): DetectorFn {
  // Pre-compile all regex patterns
  const compiledPatterns: { regex: RegExp; weight: number }[] = [];
  for (const rule of config.patterns) {
    try {
      compiledPatterns.push({
        regex: new RegExp(rule.regex, "gi"),
        weight: rule.weight,
      });
    } catch {
      // Skip invalid patterns (should be caught by validation)
    }
  }

  return (messages: Message[]): DetectedPattern | undefined => {
    const assistantMessages = messages.filter((m) => m.role === "assistant");
    if (assistantMessages.length === 0) return undefined;

    let totalScore = 0;
    const examples: string[] = [];
    const totalChars = assistantMessages.reduce((sum, m) => sum + m.content.length, 0);

    for (const msg of assistantMessages) {
      for (const pattern of compiledPatterns) {
        pattern.regex.lastIndex = 0;
        let match;
        while ((match = pattern.regex.exec(msg.content)) !== null) {
          totalScore += pattern.weight;
          if (examples.length < 3) {
            const start = Math.max(0, match.index - 20);
            const end = Math.min(msg.content.length, match.index + match[0].length + 20);
            examples.push(`...${msg.content.slice(start, end)}...`);
          }
        }
      }
    }

    // Calculate percentage relative to message volume
    const normalizedScore = totalChars > 0
      ? (totalScore / assistantMessages.length) * 100
      : 0;

    if (normalizedScore < config.threshold) return undefined;

    return {
      id: config.id,
      name: config.name,
      description: config.description,
      severity: config.severity as "info" | "warning" | "concern",
      count: Math.round(totalScore),
      percentage: normalizedScore,
      examples,
      prescription: config.prescription,
    };
  };
}

// ─── Loading ───────────────────────────────────────────────

/**
 * Load all custom detectors from .holomime/detectors/*.json.
 * Returns compiled detector functions ready to use alongside built-in detectors.
 */
export function loadCustomDetectors(
  dir?: string,
): { detectors: DetectorFn[]; errors: string[] } {
  const detectorsDir = dir ?? resolve(process.cwd(), ".holomime", "detectors");
  const detectors: DetectorFn[] = [];
  const errors: string[] = [];

  if (!existsSync(detectorsDir)) {
    return { detectors: [], errors: [] };
  }

  let files: string[];
  try {
    files = readdirSync(detectorsDir).filter((f) => f.endsWith(".json"));
  } catch {
    return { detectors: [], errors: ["Could not read detectors directory"] };
  }

  for (const file of files) {
    const filepath = join(detectorsDir, file);
    try {
      const raw = JSON.parse(readFileSync(filepath, "utf-8"));
      const validation = validateDetectorConfig(raw);

      if (!validation.valid) {
        errors.push(`${file}: ${validation.errors.join(", ")}`);
        continue;
      }

      detectors.push(compileCustomDetector(validation.config!));
    } catch (e) {
      errors.push(`${file}: ${e instanceof Error ? e.message : "parse error"}`);
    }
  }

  return { detectors, errors };
}
