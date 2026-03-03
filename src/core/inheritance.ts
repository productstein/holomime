/**
 * Personality Inheritance — shared base personality with per-agent overrides.
 *
 * Specs can reference a base personality via the `extends` field:
 *   { "extends": "./base.personality.json", "name": "Agent-A", ... }
 *
 * Resolution: load base, recurse if it also extends, then deep-merge overrides.
 * Arrays replace (not concat). Objects recurse. Scalars override.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

// ─── Deep Merge ──────────────────────────────────────────────

/**
 * Deep merge two specs. Override values take precedence.
 * - Objects: recurse
 * - Arrays: override replaces base entirely
 * - Scalars: override replaces base
 */
export function deepMergeSpec(base: any, override: any): any {
  if (override === undefined || override === null) return base;
  if (base === undefined || base === null) return override;

  if (Array.isArray(override)) return override;
  if (Array.isArray(base)) return override;

  if (typeof base === "object" && typeof override === "object") {
    const result: any = { ...base };
    for (const key of Object.keys(override)) {
      result[key] = deepMergeSpec(base[key], override[key]);
    }
    return result;
  }

  return override;
}

// ─── Inheritance Resolution ──────────────────────────────────

/**
 * Resolve inheritance chain. If spec has `extends`, load the base,
 * recurse, and deep-merge the override on top.
 *
 * @param spec - The parsed JSON spec (may contain `extends`)
 * @param specDir - Directory of the spec file (for resolving relative paths)
 * @param options.maxDepth - Maximum inheritance depth (default: 10)
 * @throws If circular reference detected or maxDepth exceeded
 */
export function resolveInheritance(
  spec: any,
  specDir: string,
  options?: { maxDepth?: number },
  _seen?: Set<string>,
): any {
  const maxDepth = options?.maxDepth ?? 10;
  const seen = _seen ?? new Set<string>();

  if (!spec.extends) {
    return spec;
  }

  const basePath = resolve(specDir, spec.extends);

  // Circular reference detection
  if (seen.has(basePath)) {
    throw new Error(`Circular inheritance detected: ${basePath} already in chain`);
  }
  if (seen.size >= maxDepth) {
    throw new Error(`Inheritance depth exceeded maximum of ${maxDepth}`);
  }

  seen.add(basePath);

  // Load and recurse into the base
  const baseRaw = JSON.parse(readFileSync(basePath, "utf-8"));
  const baseDir = dirname(basePath);
  const resolvedBase = resolveInheritance(baseRaw, baseDir, options, seen);

  // Strip `extends` from the override before merging
  const { extends: _, ...overrideWithoutExtends } = spec;

  return deepMergeSpec(resolvedBase, overrideWithoutExtends);
}

// ─── Inheritance Chain ───────────────────────────────────────

/**
 * Get the list of spec file paths in the inheritance chain,
 * from root base to the current spec.
 */
export function getInheritanceChain(
  spec: any,
  specDir: string,
  _chain?: string[],
): string[] {
  const chain = _chain ?? [];

  if (!spec.extends) {
    return chain;
  }

  const basePath = resolve(specDir, spec.extends);
  const baseRaw = JSON.parse(readFileSync(basePath, "utf-8"));
  const baseDir = dirname(basePath);

  // Recurse into base first (so chain is root-first)
  getInheritanceChain(baseRaw, baseDir, chain);
  chain.push(basePath);

  return chain;
}

// ─── Standard Spec Loader ────────────────────────────────────

/**
 * Load a personality spec from disk, resolving inheritance.
 * This is the standard way to load a spec — replaces
 * `JSON.parse(readFileSync(path))` across the codebase.
 */
export function loadSpec(specPath: string): any {
  const raw = JSON.parse(readFileSync(specPath, "utf-8"));
  const specDir = dirname(resolve(specPath));
  return resolveInheritance(raw, specDir);
}
