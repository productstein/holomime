/**
 * Stack-Aware Loader — auto-detects identity stack vs legacy personality.json.
 *
 * If a stack directory exists (soul.md + mind.sys + purpose.cfg + shadow.log +
 * memory.store + body.api + conscience.exe + ego.runtime), compiles the 8-file stack.
 * Otherwise, falls back to loading .personality.json directly (legacy mode).
 *
 * This wraps the existing loadSpec() from inheritance.ts, maintaining
 * full backward compatibility.
 */

import { dirname } from "node:path";
import { loadSpec } from "./inheritance.js";
import { findStackDir, compileStack } from "./stack-compiler.js";

/**
 * Load a personality spec, auto-detecting stack vs legacy mode.
 *
 * @param specPath - Path to .personality.json (used for legacy mode and as project root hint)
 * @returns The resolved PersonalitySpec
 */
export function loadSpecWithStack(specPath: string): any {
  const projectRoot = dirname(specPath);

  // Check for identity stack
  const stackDir = findStackDir(projectRoot);

  if (stackDir) {
    const result = compileStack({ stackDir });

    // Print warnings
    for (const w of result.warnings) {
      console.warn(`⚠ ${w}`);
    }

    return result.spec;
  }

  // Legacy mode: load .personality.json directly
  return loadSpec(specPath);
}
