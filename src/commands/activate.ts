import chalk from "chalk";
import figures from "figures";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { trackEvent } from "../telemetry/client.js";
import { validateLicense } from "../ui/tier.js";

export async function activateCommand(key: string): Promise<void> {
  printHeader("Activate License");

  if (!key || key.trim().length === 0) {
    console.error(chalk.red("  Please provide a license key."));
    console.log(chalk.dim(`  Usage: ${chalk.cyan("holomime activate <license-key>")}`));
    console.log();
    process.exit(1);
    return;
  }

  const trimmedKey = key.trim();

  // Save the key to disk first
  const holomimeDir = join(homedir(), ".holomime");
  const licensePath = join(holomimeDir, "license");

  if (!existsSync(holomimeDir)) {
    mkdirSync(holomimeDir, { recursive: true });
  }

  writeFileSync(licensePath, trimmedKey);

  // Validate against the server
  console.log(chalk.dim("  Validating license..."));
  const result = await validateLicense(trimmedKey);

  if (result.valid) {
    const tierLabel = result.tier === "enterprise" ? "Enterprise" : "Pro";
    console.log();
    printBox(
      [
        `${figures.tick} ${tierLabel} license activated!`,
        "",
        "Unlocked features:",
        `  ${chalk.cyan(figures.pointer)} Live alignment sessions (holomime align)`,
        `  ${chalk.cyan(figures.pointer)} Recursive alignment (holomime evolve)`,
        `  ${chalk.cyan(figures.pointer)} Behavioral benchmarking (holomime benchmark)`,
        `  ${chalk.cyan(figures.pointer)} Drift detection (holomime watch)`,
        `  ${chalk.cyan(figures.pointer)} Training data export (holomime export)`,
        `  ${chalk.cyan(figures.pointer)} Growth tracking (holomime growth)`,
      ].join("\n"),
      "success",
      `License Activated — ${tierLabel}`,
    );
  } else {
    console.log();
    printBox(
      [
        `${chalk.yellow(figures.warning)} License saved but could not be verified.`,
        "",
        chalk.dim("This may happen if the server is unreachable."),
        chalk.dim("The key has been saved and will be re-validated on next use."),
      ].join("\n"),
      "warning",
      "License Pending Verification",
    );
  }

  console.log();
  console.log(chalk.dim(`  License saved to: ${licensePath}`));
  console.log();

  trackEvent("activate", { key_length: trimmedKey.length, verified: result.valid, tier: result.tier });
}
