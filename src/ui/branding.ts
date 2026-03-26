import chalk from "chalk";
import gradientString from "gradient-string";

const VERSION = "3.3.9";

const LOGO = `  _           _             _
 | |__   ___ | | ___  _ __ (_)_ __ ___   ___
 | '_ \\ / _ \\| |/ _ \\| '_ \\| | '_ \` _ \\ / _ \\
 | | | | (_) | | (_) | | | | | | | | | |  __/
 |_| |_|\\___/|_|\\___/|_| |_|_|_| |_| |_|\\___|`;

const holomimeGradient = gradientString("#00d4ff", "#b347d9");

export function printBanner(): void {
  console.log();
  console.log(holomimeGradient(LOGO));
  console.log();
  console.log(`  ${chalk.dim("Behavioral intelligence for AI agents and humanoid robots")}  ${chalk.bgCyan.black(` v${VERSION} `)}`);
  console.log();
}

export function printHeader(title: string): void {
  const line = "\u2550".repeat(title.length + 4);
  console.log();
  console.log(holomimeGradient(`  ${line}`));
  console.log(holomimeGradient(`  \u2551 ${title} \u2551`));
  console.log(holomimeGradient(`  ${line}`));
  console.log();
}

export function printDivider(): void {
  console.log(chalk.dim("  " + "\u2500".repeat(50)));
}

export { VERSION };
