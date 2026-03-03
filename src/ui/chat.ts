import chalk from "chalk";

/**
 * Chatbot-style alignment UI — renders session messages
 * as a conversation with timestamps and aligned bubbles.
 */

export function printTherapistMessage(content: string): void {
  const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  console.log();
  console.log(`  ${chalk.cyan.bold("AgentMD")}  ${chalk.dim(time)}`);
  printBubble(content, "left");
}

export function printPatientMessage(name: string, content: string): void {
  const time = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  console.log();
  console.log(`  ${" ".repeat(30)}${chalk.magenta.bold(name)}  ${chalk.dim(time)}`);
  printBubble(content, "right");
}

export function printPhaseTransition(phaseName: string): void {
  console.log();
  console.log(chalk.dim(`  ${"─".repeat(4)} ${phaseName} ${"─".repeat(Math.max(0, 40 - phaseName.length))}`));
}

function printBubble(content: string, align: "left" | "right"): void {
  const maxWidth = 52;
  const lines = wrapText(content, maxWidth);
  const indent = align === "left" ? "  " : "  " + " ".repeat(Math.max(0, 20));
  const borderColor = align === "left" ? chalk.cyan : chalk.magenta;

  console.log(`${indent}${borderColor("\u250C" + "\u2500".repeat(maxWidth + 2) + "\u2510")}`);
  for (const line of lines) {
    const padded = line + " ".repeat(Math.max(0, maxWidth - stripAnsi(line).length));
    console.log(`${indent}${borderColor("\u2502")} ${padded} ${borderColor("\u2502")}`);
  }
  console.log(`${indent}${borderColor("\u2514" + "\u2500".repeat(maxWidth + 2) + "\u2518")}`);
}

function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);

  return lines.length > 0 ? lines : [""];
}

function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}
