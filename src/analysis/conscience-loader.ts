/**
 * Conscience Loader — loads conscience rules from directory structure
 * as modular skills. Inspired by DeerFlow's Markdown-based skill loading.
 *
 * Rules are Markdown files with YAML frontmatter in conscience/rules/:
 *   conscience/rules/therapy-safety.md
 *   conscience/rules/consent-enforcement.md
 *   conscience/rules/drift-detection.md
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { parse as parseYaml } from "yaml";

export interface ConscienceRule {
  name: string;
  enabled: boolean;
  priority: number;
  scope: "agent" | "fleet" | "global";
  content: string;
}

export interface ConscienceConfig {
  rules: Record<string, { enabled: boolean; priority?: number }>;
}

/**
 * Parse a conscience rule from a Markdown file with YAML frontmatter.
 */
export function parseConscienceRule(filePath: string): ConscienceRule {
  const content = readFileSync(filePath, "utf-8");
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!frontmatterMatch) {
    return {
      name: basename(filePath, ".md"),
      enabled: true,
      priority: 5,
      scope: "agent",
      content: content.trim(),
    };
  }

  const meta = parseYaml(frontmatterMatch[1]) || {};
  const body = frontmatterMatch[2].trim();

  return {
    name: meta.name || basename(filePath, ".md"),
    enabled: meta.enabled !== false,
    priority: meta.priority || 5,
    scope: meta.scope || "agent",
    content: body,
  };
}

/**
 * Load all conscience rules from a directory.
 */
export function loadConscienceRules(rulesDir: string): ConscienceRule[] {
  if (!existsSync(rulesDir)) return [];

  const files = readdirSync(rulesDir).filter((f) => f.endsWith(".md"));
  return files.map((f) => parseConscienceRule(join(rulesDir, f)));
}

/**
 * Filter rules by enabled state from config.
 */
export function filterByConfig(
  rules: ConscienceRule[],
  config: ConscienceConfig,
): ConscienceRule[] {
  return rules
    .map((rule) => {
      const cfg = config.rules[rule.name];
      if (cfg) {
        return {
          ...rule,
          enabled: cfg.enabled,
          priority: cfg.priority ?? rule.priority,
        };
      }
      return rule;
    })
    .filter((rule) => rule.enabled)
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Inject enabled conscience rules into a system prompt.
 */
export function injectConscienceRules(
  basePrompt: string,
  rules: ConscienceRule[],
): string {
  if (rules.length === 0) return basePrompt;

  const rulesSection = [
    "\n\n## Conscience Rules (Enforcement Layer)",
    "",
    ...rules.map(
      (r) => `### ${r.name} (priority: ${r.priority}, scope: ${r.scope})\n${r.content}`,
    ),
  ].join("\n");

  return basePrompt + rulesSection;
}
