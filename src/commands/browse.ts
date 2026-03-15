import chalk from "chalk";
import figures from "figures";
import { fetchRegistry } from "../marketplace/registry.js";
import { printHeader } from "../ui/branding.js";
import { withSpinner } from "../ui/spinner.js";
import { printBox } from "../ui/boxes.js";

interface BrowseOptions {
  tag?: string;
}

export async function browseCommand(options: BrowseOptions): Promise<void> {
  printHeader("Personality Marketplace");

  const registry = await withSpinner("Fetching registry...", async () => {
    return fetchRegistry();
  });

  let personalities = registry.personalities;

  if (options.tag) {
    personalities = personalities.filter((p) =>
      p.tags.some((t) => t.toLowerCase() === options.tag!.toLowerCase()),
    );
  }

  if (personalities.length === 0) {
    printBox(
      options.tag
        ? `No personalities found with tag "${options.tag}".`
        : "The registry is empty. Be the first to publish!",
      "info",
    );
    console.log();
    console.log(chalk.dim(`  Run ${chalk.cyan("holomime publish")} to share your personality profile.`));
    console.log();
    return;
  }

  console.log();
  console.log(chalk.dim(`  ${personalities.length} personalit${personalities.length === 1 ? "y" : "ies"} available`));
  console.log();

  for (const p of personalities) {
    const tags = p.tags.map((t) => chalk.dim(`#${t}`)).join(" ");
    console.log(`  ${chalk.bold(p.name)} ${chalk.dim(`@${p.handle}`)}  ${tags}`);
    if (p.purpose) {
      console.log(`  ${chalk.dim(p.purpose)}`);
    }
    console.log(`  ${chalk.dim(`by ${p.author}`)}  ${chalk.dim(`\u2193 ${p.downloads}`)}`);
    console.log();
  }

  console.log(chalk.dim(`  Use a personality: ${chalk.cyan("holomime use <handle>")}`));
  console.log();
}
