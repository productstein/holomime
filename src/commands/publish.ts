import chalk from "chalk";
import figures from "figures";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { personalitySpecSchema } from "../core/types.js";
import { createGist } from "../marketplace/registry.js";
import { printHeader } from "../ui/branding.js";
import { withSpinner } from "../ui/spinner.js";
import { printBox } from "../ui/boxes.js";

interface PublishOptions {
  personality?: string;
}

export async function publishCommand(options: PublishOptions): Promise<void> {
  const specPath = resolve(process.cwd(), options.personality ?? ".personality.json");

  printHeader("Publish Personality");

  let raw: string;
  try {
    raw = readFileSync(specPath, "utf-8");
  } catch {
    console.error(chalk.red(`  Could not read: ${specPath}`));
    console.log(chalk.dim(`  Run ${chalk.cyan("holomime init")} to create a personality first.`));
    console.log();
    process.exit(1);
    return;
  }

  let spec: unknown;
  try {
    spec = JSON.parse(raw);
  } catch {
    console.error(chalk.red("  .personality.json is not valid JSON."));
    process.exit(1);
    return;
  }

  const result = personalitySpecSchema.safeParse(spec);
  if (!result.success) {
    console.error(chalk.red("  Invalid personality spec:"));
    for (const err of result.error.errors) {
      console.error(`    ${chalk.red(figures.cross)} ${err.path.join(".")}: ${err.message}`);
    }
    console.log();
    process.exit(1);
    return;
  }

  const personality = result.data;
  console.log();
  console.log(`  Publishing: ${chalk.bold(personality.name)} ${chalk.dim(`@${personality.handle}`)}`);
  console.log();

  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    // No token — show manual instructions
    console.log(chalk.yellow("  GITHUB_TOKEN not set. Showing manual publish instructions."));
    console.log();
    console.log(chalk.bold("  To publish automatically:"));
    console.log(chalk.dim("  1. Create a GitHub token with 'gist' scope"));
    console.log(chalk.dim("  2. export GITHUB_TOKEN=ghp_..."));
    console.log(chalk.dim("  3. Run holomime publish again"));
    console.log();
    console.log(chalk.bold("  To publish manually:"));
    console.log(chalk.dim("  1. Create a public GitHub Gist with your .personality.json"));
    console.log(chalk.dim("  2. Submit a PR to https://github.com/holomime/registry"));
    console.log(chalk.dim("     adding your entry to index.json"));
    console.log();
    return;
  }

  const gist = await withSpinner("Creating GitHub Gist...", async () => {
    return createGist(personality, personality.handle, token);
  });

  console.log();
  printBox(
    [
      `${figures.tick} Published ${personality.name} (@${personality.handle})`,
      "",
      `Gist: ${gist.url}`,
      `Raw: ${gist.rawUrl}`,
    ].join("\n"),
    "success",
    "Published",
  );
  console.log();

  console.log(chalk.bold("  Next steps:"));
  console.log(chalk.dim("  Submit a PR to https://github.com/holomime/registry"));
  console.log(chalk.dim("  to add your personality to the public index."));
  console.log();
}
