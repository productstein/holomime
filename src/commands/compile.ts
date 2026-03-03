import chalk from "chalk";
import figures from "figures";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { personalitySpecSchema, type Provider, type Surface } from "../core/types.js";
import { loadSpec } from "../core/inheritance.js";
import { compile } from "../core/compiler.js";
import { compileForOpenClaw } from "../adapters/openclaw.js";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { withSpinner } from "../ui/spinner.js";

interface CompileOptions {
  provider?: string;
  surface?: string;
  for?: string;
  output?: string;
}

function loadAndValidateSpec() {
  const specPath = resolve(process.cwd(), ".personality.json");
  const raw = loadSpec(specPath);
  const parsed = personalitySpecSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("\n"));
  }
  return parsed.data;
}

export async function compileCommand(options: CompileOptions): Promise<void> {
  let spec;
  try {
    spec = loadAndValidateSpec();
  } catch (err) {
    console.error(chalk.red(`  Error loading .personality.json: ${err instanceof Error ? err.message : err}`));
    console.error(chalk.dim("  Run `holomime init` to create one."));
    process.exit(1);
  }

  // OpenClaw adapter
  if (options.for === "openclaw") {
    const { soul, identity } = await withSpinner(`Compiling ${spec.name} for OpenClaw...`, async () => {
      return compileForOpenClaw(spec);
    });

    if (options.output) {
      const dir = resolve(process.cwd(), options.output);
      writeFileSync(resolve(dir, "SOUL.md"), soul);
      writeFileSync(resolve(dir, "IDENTITY.md"), identity);
      printBox(`${figures.tick} Wrote SOUL.md and IDENTITY.md to ${options.output}/`, "success");
    } else {
      printHeader("SOUL.md");
      console.log(soul);
      printHeader("IDENTITY.md");
      console.log(identity);
    }
    console.log();
    return;
  }

  // Standard compilation
  const provider = (options.provider ?? "anthropic") as Provider;
  const surface = (options.surface ?? "chat") as Surface;

  const config = await withSpinner(`Compiling ${spec.name} \u2192 ${provider}/${surface}...`, async () => {
    return compile({ spec, provider, surface });
  });

  if (options.output) {
    const outPath = resolve(process.cwd(), options.output);
    writeFileSync(outPath, JSON.stringify(config, null, 2) + "\n");
    console.log();
    printBox(`${figures.tick} Compiled config written to ${options.output}`, "success");
  } else {
    printHeader(`${spec.name} \u2192 ${provider}/${surface}`);

    console.log(chalk.bold("  Model Parameters"));
    console.log(chalk.dim("  " + "\u2500".repeat(40)));
    console.log();
    console.log(`    temperature: ${chalk.cyan(config.temperature.toFixed(3))}`);
    console.log(`    top_p:       ${chalk.cyan(config.top_p.toFixed(3))}`);
    console.log(`    max_tokens:  ${chalk.cyan(config.max_tokens.toString())}`);
    console.log();

    console.log(chalk.bold("  System Prompt"));
    console.log(chalk.dim("  " + "\u2500".repeat(40)));
    console.log();

    const lines = config.system_prompt.split("\n");
    for (const line of lines) {
      if (line.startsWith("## ")) {
        console.log(chalk.bold(`    ${line}`));
      } else {
        console.log(`    ${line}`);
      }
    }

    console.log();
    printBox(`${config.system_prompt.length} chars \u2014 copy to your ${provider} config or use ${chalk.cyan("--output")} to save`, "info");
  }
  console.log();
}
