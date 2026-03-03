import chalk from "chalk";
import figures from "figures";

/**
 * Visual progress indicators — bar charts, health meters, sparklines.
 */

export function printBarChart(label: string, value: number, maxWidth: number = 15): void {
  const filled = Math.round(value * maxWidth);
  const empty = maxWidth - filled;
  const pct = (value * 100).toFixed(0);
  const pad = " ".repeat(Math.max(0, 24 - label.length));
  const bar = chalk.cyan("\u2588".repeat(filled)) + chalk.dim("\u2591".repeat(empty));
  console.log(`  ${label}${pad}${bar} ${pct}%`);
}

export function printAlignmentBar(label: string, spec: number, actual: number, maxWidth: number = 15): void {
  const pad = " ".repeat(Math.max(0, 22 - label.length));
  const specPct = (spec * 100).toFixed(0).padStart(3);
  const actualPct = (actual * 100).toFixed(0).padStart(3);

  const delta = actual - spec;
  let status: string;
  if (Math.abs(delta) <= 0.1) status = chalk.green(`${figures.tick} aligned`);
  else if (delta > 0) status = chalk.yellow(`${figures.warning} elevated`);
  else status = chalk.yellow(`${figures.warning} suppressed`);

  console.log(`  ${label}${pad}Spec: ${specPct}%  Actual: ${actualPct}%  ${status}`);
}

export function printHealthMeter(health: number): void {
  const color = health >= 70 ? chalk.green : health >= 50 ? chalk.yellow : chalk.red;
  const filled = Math.round((health / 100) * 20);
  const empty = 20 - filled;
  const bar = color("\u2588".repeat(filled)) + chalk.dim("\u2591".repeat(empty));
  console.log(`  Overall Health: ${bar} ${color(health + "%")}`);
}

export function printSparkline(values: number[]): string {
  const chars = ["\u2581", "\u2582", "\u2583", "\u2584", "\u2585", "\u2586", "\u2587", "\u2588"];
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((v) => {
    const idx = Math.round(((v - min) / range) * (chars.length - 1));
    return chalk.cyan(chars[idx]);
  }).join("");
}

export function printPatternIndicator(name: string, severity: string, description: string, index: number): void {
  const icon = severity === "concern" ? chalk.red(figures.bullet) : chalk.yellow(figures.warning);
  console.log(`  ${index}. ${icon} ${chalk.bold(name)}`);
  console.log(`     ${chalk.dim(description)}`);
}

export function printHealthyIndicator(name: string, description: string): void {
  console.log(`  ${chalk.green(figures.tick)} ${name}: ${chalk.dim(description)}`);
}
