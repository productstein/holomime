import chalk from "chalk";
import figures from "figures";
import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { select } from "@inquirer/prompts";
import { personalitySpecSchema } from "../core/types.js";
import { fetchRegistry, fetchPersonality } from "../marketplace/registry.js";
import { printHeader } from "../ui/branding.js";
import { withSpinner } from "../ui/spinner.js";
import { printBox } from "../ui/boxes.js";

interface UseOptions {
  output?: string;
}

export async function useCommand(handle: string, options: UseOptions): Promise<void> {
  printHeader("Use Personality");

  const registry = await withSpinner("Fetching registry...", async () => {
    return fetchRegistry();
  });

  const entry = registry.personalities.find(
    (p) => p.handle.toLowerCase() === handle.toLowerCase(),
  );

  if (!entry) {
    console.error(chalk.red(`  Personality "${handle}" not found in registry.`));
    console.log(chalk.dim(`  Run ${chalk.cyan("holomime browse")} to see available personalities.`));
    console.log();
    process.exit(1);
    return;
  }

  console.log();
  console.log(`  Found: ${chalk.bold(entry.name)} ${chalk.dim(`@${entry.handle}`)}`);
  if (entry.purpose) {
    console.log(`  ${chalk.dim(entry.purpose)}`);
  }
  console.log();

  const raw = await withSpinner("Downloading personality...", async () => {
    return fetchPersonality(entry.url);
  });

  // Validate
  const result = personalitySpecSchema.safeParse(raw);
  if (!result.success) {
    console.error(chalk.red("  Downloaded personality is invalid:"));
    for (const err of result.error.errors) {
      console.error(`    ${chalk.red(figures.cross)} ${err.path.join(".")}: ${err.message}`);
    }
    console.log();
    process.exit(1);
    return;
  }

  const outputPath = resolve(process.cwd(), options.output ?? ".personality.json");

  if (existsSync(outputPath)) {
    const overwrite = await select({
      message: `.personality.json already exists. Overwrite?`,
      choices: [
        { value: "yes", name: "Yes, overwrite" },
        { value: "no", name: "No, cancel" },
      ],
    });
    if (overwrite === "no") {
      console.log(chalk.yellow("\n  Cancelled. No changes made.\n"));
      return;
    }
  }

  writeFileSync(outputPath, JSON.stringify(result.data, null, 2) + "\n");

  console.log();
  printBox(`${figures.tick} Using ${entry.name} (@${entry.handle}) → ${outputPath}`, "success");
  console.log();
  console.log(chalk.dim(`  Next: ${chalk.cyan("holomime profile")} to view the personality summary.`));
  console.log();
}
