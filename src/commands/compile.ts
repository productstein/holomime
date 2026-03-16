import chalk from "chalk";
import figures from "figures";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { personalitySpecSchema, type Provider, type Surface } from "../core/types.js";
import { loadSpec } from "../core/inheritance.js";
import { compile, compileEmbodied } from "../core/compiler.js";
import { compileForOpenClaw } from "../adapters/openclaw.js";
import { compileTiered, type PersonalityTier } from "../core/tiered-loader.js";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { withSpinner } from "../ui/spinner.js";

interface CompileOptions {
  provider?: string;
  surface?: string;
  for?: string;
  tier?: string;
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

  // Tiered loading (L0/L1/L2)
  const tier = (options.tier ?? "L2").toUpperCase() as PersonalityTier;
  if (tier === "L0" || tier === "L1") {
    const result = await withSpinner(`Compiling ${spec.name} → ${tier} tier...`, async () => {
      return compileTiered(spec, tier);
    });

    if (options.output) {
      const outPath = resolve(process.cwd(), options.output);
      writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");
      console.log();
      printBox(`${figures.tick} ${tier} config written to ${options.output}`, "success");
    } else {
      printHeader(`${spec.name} → ${tier} Tier`);
      console.log(chalk.bold("  Token Budget"));
      console.log(chalk.dim("  " + "─".repeat(40)));
      console.log();
      console.log(`    estimated: ~${chalk.cyan(result.estimatedTokens.toString())} tokens`);
      console.log();

      console.log(chalk.bold("  System Prompt"));
      console.log(chalk.dim("  " + "─".repeat(40)));
      console.log();
      for (const line of result.prompt.split("\n")) {
        console.log(`    ${line}`);
      }
      console.log();
      printBox(`${result.prompt.length} chars — ${tier} tier for high-throughput use`, "info");
    }
    console.log();
    return;
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

  // Embodied compilation (extended output with motion parameters)
  if (surface === "embodied") {
    const embodiedConfig = await withSpinner(`Compiling ${spec.name} \u2192 ${provider}/embodied...`, async () => {
      return compileEmbodied(spec, provider);
    });

    if (options.output) {
      const outPath = resolve(process.cwd(), options.output);
      writeFileSync(outPath, JSON.stringify(embodiedConfig, null, 2) + "\n");
      console.log();
      printBox(`${figures.tick} Embodied config written to ${options.output}`, "success");
    } else {
      printHeader(`${spec.name} \u2192 ${provider}/embodied`);

      console.log(chalk.bold("  Model Parameters"));
      console.log(chalk.dim("  " + "\u2500".repeat(40)));
      console.log();
      console.log(`    temperature: ${chalk.cyan(embodiedConfig.temperature.toFixed(3))}`);
      console.log(`    top_p:       ${chalk.cyan(embodiedConfig.top_p.toFixed(3))}`);
      console.log(`    max_tokens:  ${chalk.cyan(embodiedConfig.max_tokens.toString())}`);
      console.log();

      console.log(chalk.bold("  Motion Parameters"));
      console.log(chalk.dim("  " + "\u2500".repeat(40)));
      console.log();
      const mp = embodiedConfig.motion_parameters;
      const motionEntries = Object.entries(mp) as [string, number][];
      for (const [key, val] of motionEntries) {
        const bar = "\u2588".repeat(Math.round(val * 20)).padEnd(20, "\u2591");
        const label = key.replace(/_/g, " ").padEnd(24);
        console.log(`    ${label} ${chalk.cyan(bar)} ${val.toFixed(2)}`);
      }
      console.log();

      console.log(chalk.bold("  Safety Envelope"));
      console.log(chalk.dim("  " + "\u2500".repeat(40)));
      console.log();
      const se = embodiedConfig.safety_envelope;
      console.log(`    max speed:    ${chalk.yellow(se.max_linear_speed_m_s + " m/s")}`);
      console.log(`    min proximity: ${chalk.yellow(se.min_proximity_m + " m")}`);
      console.log(`    max force:    ${chalk.yellow(se.max_contact_force_n + " N")}`);
      console.log(`    e-stop decel: ${chalk.yellow(se.emergency_stop_decel_m_s2 + " m/s\u00B2")}`);
      console.log();

      console.log(chalk.bold("  Expression"));
      console.log(chalk.dim("  " + "\u2500".repeat(40)));
      console.log();
      console.log(`    modalities:   ${chalk.green(embodiedConfig.active_modalities.join(", "))}`);
      console.log(`    gaze contact: ${chalk.cyan(embodiedConfig.gaze.contact_ratio.toFixed(2))}`);
      console.log(`    proxemics:    ${chalk.cyan(embodiedConfig.proxemics.preferred_zone)}`);
      console.log(`    haptics:      ${chalk.cyan(embodiedConfig.haptics.touch_permitted ? "permitted" : "not permitted")}`);
      console.log(`    speak rate:   ${chalk.cyan(embodiedConfig.prosody.speaking_rate_wpm + " wpm")}`);
      console.log();

      printBox(`Embodied config compiled \u2014 use ${chalk.cyan("--output")} to save JSON`, "info");
    }
    console.log();
    return;
  }

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
