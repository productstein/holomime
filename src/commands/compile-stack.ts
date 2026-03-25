/**
 * compile-stack — Compile 8 identity stack files into .personality.json.
 *
 * soul.md + mind.sys + purpose.cfg + shadow.log + memory.store + body.api + conscience.exe + ego.runtime → .personality.json
 */

import chalk from "chalk";
import figures from "figures";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { withSpinner } from "../ui/spinner.js";
import { compileStack, findStackDir } from "../core/stack-compiler.js";

interface CompileStackOptions {
  dir?: string;
  output?: string;
  validateOnly?: boolean;
  diff?: boolean;
}

export async function compileStackCommand(options: CompileStackOptions): Promise<void> {
  printHeader("Identity Stack Compiler");

  // Find stack directory
  const searchRoot = resolve(options.dir || process.cwd());
  const stackDir = findStackDir(searchRoot) || searchRoot;

  console.log(chalk.dim(`\n  Stack directory: ${stackDir}`));

  // Compile
  const result = await withSpinner(
    "Compiling identity stack",
    async () => compileStack({ stackDir }),
  );

  // Print warnings
  if (result.warnings.length > 0) {
    console.log("");
    for (const w of result.warnings) {
      console.log(chalk.yellow(`  ${figures.warning} ${w}`));
    }
  }

  // Print sources
  console.log("");
  const sources = result.sources;
  console.log(chalk.dim("  Sources:"));
  console.log(`    ${chalk.cyan("soul")}       ${sources.soul.path} ${chalk.dim(`(${sources.soul.hash})`)}`);
  console.log(`    ${chalk.cyan("mind")}       ${sources.mind.path} ${chalk.dim(`(${sources.mind.hash})`)}`);
  if (sources.purpose) {
    console.log(`    ${chalk.cyan("purpose")}    ${sources.purpose.path} ${chalk.dim(`(${sources.purpose.hash})`)}`);
  }
  if (sources.shadow) {
    console.log(`    ${chalk.cyan("shadow")}     ${sources.shadow.path} ${chalk.dim(`(${sources.shadow.hash})`)}`);
  }
  if (sources.memory) {
    console.log(`    ${chalk.cyan("memory")}     ${sources.memory.path} ${chalk.dim(`(${sources.memory.hash})`)}`);
  }
  if (sources.body) {
    console.log(`    ${chalk.cyan("body")}       ${sources.body.path} ${chalk.dim(`(${sources.body.hash})`)}`);
  }
  console.log(`    ${chalk.cyan("conscience")} ${sources.conscience.path} ${chalk.dim(`(${sources.conscience.hash})`)}`);
  if (sources.ego) {
    console.log(`    ${chalk.cyan("ego")}        ${sources.ego.path} ${chalk.dim(`(${sources.ego.hash})`)}`);
  };

  if (options.validateOnly) {
    console.log("");
    console.log(chalk.green(`  ${figures.tick} Stack is valid`));
    return;
  }

  // Diff mode
  const outputPath = resolve(options.output || ".personality.json");

  if (options.diff && existsSync(outputPath)) {
    const existing = JSON.parse(readFileSync(outputPath, "utf-8"));
    const compiled = result.spec;

    const changes = diffObjects(existing, compiled);
    if (changes.length === 0) {
      console.log(chalk.green(`\n  ${figures.tick} No changes — compiled output matches existing .personality.json`));
    } else {
      console.log(chalk.yellow(`\n  ${figures.warning} ${changes.length} change(s) detected:\n`));
      for (const c of changes) {
        console.log(`    ${chalk.dim(c.path)}: ${chalk.red(JSON.stringify(c.old))} → ${chalk.green(JSON.stringify(c.new))}`);
      }
    }
    return;
  }

  // Write output
  const json = JSON.stringify(result.spec, null, 2) + "\n";
  writeFileSync(outputPath, json);

  console.log("");
  printBox(
    [
      `${chalk.green(figures.tick)} .personality.json written to ${outputPath}`,
      "",
      `  Name: ${chalk.bold(result.spec.name)}`,
      `  Handle: ${chalk.cyan(result.spec.handle)}`,
      result.spec.purpose ? `  Purpose: ${chalk.dim(result.spec.purpose)}` : "",
      result.spec.embodiment ? `  Body: ${chalk.cyan(result.spec.embodiment.morphology)}` : `  Body: ${chalk.dim("none (chatbot mode)")}`,
      `  Deny rules: ${chalk.yellow(String(result.spec.domain?.boundaries?.refuses?.length || 0))}`,
      `  Hard limits: ${chalk.red(String(result.spec.domain?.boundaries?.hard_limits?.length || 0))}`,
    ].filter(Boolean).join("\n"),
    "success",
    "Compiled Successfully",
  );
}

// Simple object diff for --diff mode
interface DiffEntry {
  path: string;
  old: unknown;
  new: unknown;
}

function diffObjects(a: any, b: any, prefix = ""): DiffEntry[] {
  const changes: DiffEntry[] = [];

  const allKeys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const va = a?.[key];
    const vb = b?.[key];

    if (typeof va === "object" && typeof vb === "object" && va !== null && vb !== null && !Array.isArray(va) && !Array.isArray(vb)) {
      changes.push(...diffObjects(va, vb, path));
    } else if (JSON.stringify(va) !== JSON.stringify(vb)) {
      changes.push({ path, old: va, new: vb });
    }
  }

  return changes;
}
