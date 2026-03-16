import chalk from "chalk";
import { generateBehavioralPolicy, formatPolicyYaml, listPresets } from "../analysis/nl-to-policy.js";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";

interface PolicyOptions {
  preset?: string;
  name?: string;
  listPresets?: boolean;
}

export async function policyCommand(requirements: string, options: PolicyOptions): Promise<void> {
  printHeader("NL-to-Policy — Behavioral Rule Generator");

  // List presets mode
  if (options.listPresets) {
    const presets = listPresets();
    console.log(chalk.bold("  Available Presets:"));
    console.log();
    for (const preset of presets) {
      console.log(`  ${chalk.cyan(preset.key)}`);
      console.log(`  ${chalk.dim(preset.description)}`);
      console.log(`  ${chalk.dim(`${preset.rules.length} rules`)}`);
      console.log();
    }
    printBox(
      `Use a preset: ${chalk.cyan('holomime policy "enterprise_cs"')}`,
      "info",
    );
    console.log();
    return;
  }

  if (!requirements) {
    console.log(chalk.yellow("  No requirements provided."));
    console.log(chalk.dim('  Usage: holomime policy "Never be sycophantic with enterprise customers"'));
    console.log();
    return;
  }

  console.log(chalk.dim(`  Input: "${requirements}"`));
  console.log();

  // Generate policy
  const policy = generateBehavioralPolicy(requirements, options.name);

  // Confidence indicator
  const confColor = policy.confidence >= 0.7 ? chalk.green
    : policy.confidence >= 0.4 ? chalk.yellow
    : chalk.red;
  const confLabel = policy.confidence >= 0.7 ? "HIGH"
    : policy.confidence >= 0.4 ? "MEDIUM"
    : "LOW";

  console.log(`  Confidence: ${confColor(`${confLabel} (${(policy.confidence * 100).toFixed(0)}%)`)}`);
  if (policy.preset) {
    console.log(`  Preset: ${chalk.cyan(policy.preset)}`);
  }
  console.log(`  Rules generated: ${chalk.bold(String(policy.rules.length))}`);
  console.log();

  // Display rules
  console.log(chalk.bold("  Generated Policy:"));
  console.log();

  const yaml = formatPolicyYaml(policy);
  for (const line of yaml.split("\n")) {
    console.log(`  ${chalk.dim("│")} ${line}`);
  }
  console.log();

  // Rule summary
  for (const rule of policy.rules) {
    const effectColor = rule.effect === "deny" ? chalk.red
      : rule.effect === "enforce" ? chalk.cyan
      : chalk.yellow;
    const effectIcon = rule.effect === "deny" ? "✕"
      : rule.effect === "enforce" ? "▸"
      : "◉";

    console.log(`  ${effectColor(effectIcon)} ${effectColor(rule.effect)} ${chalk.bold(rule.pattern)} ${chalk.dim(`(${rule.threshold}, risk ${rule.riskScore})`)}`);
    console.log(`    ${chalk.dim(rule.description)}`);
  }
  console.log();

  if (policy.confidence < 0.4) {
    printBox(
      `Low confidence parse. Try using more specific keywords like "sycophantic", "boundary", "concise", "formal", etc.`,
      "warning" as any,
    );
    console.log();
  }

  printBox(
    `Apply to your agent: add these rules to your .personality.json guard config.`,
    "info",
  );
  console.log();
}
