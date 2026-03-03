import boxen from "boxen";
import chalk from "chalk";

type BoxStyle = "info" | "warning" | "concern" | "success" | "session";

const BOX_STYLES: Record<BoxStyle, { borderColor: string; title?: string }> = {
  info: { borderColor: "cyan" },
  warning: { borderColor: "yellow" },
  concern: { borderColor: "red" },
  success: { borderColor: "green" },
  session: { borderColor: "magenta" },
};

export function printBox(content: string, style: BoxStyle, title?: string): void {
  const config = BOX_STYLES[style];
  console.log(
    boxen(content, {
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      margin: { top: 0, bottom: 0, left: 2, right: 0 },
      borderColor: config.borderColor as any,
      borderStyle: "round",
      title: title ?? config.title,
      titleAlignment: "left",
    }),
  );
}

export function printSessionHeader(agentName: string, provider: string, severity?: string, focus?: string[]): void {
  const lines = [
    chalk.bold("HoloMime \u2014 Alignment Session"),
    `Patient: ${chalk.cyan(agentName)}  |  Provider: ${chalk.dim(provider)}`,
  ];
  if (severity) {
    const severityColor = severity === "intervention" ? chalk.red : severity === "targeted" ? chalk.yellow : chalk.green;
    lines.push(`Severity: ${severityColor(severity.toUpperCase())}`);
  }
  if (focus && focus.length > 0) {
    lines.push(`Focus: ${chalk.dim(focus.join(", "))}`);
  }
  printBox(lines.join("\n"), "session");
}

export function printMirrorFrame(): void {
  console.log();
  console.log(chalk.dim("  You are observing through the one-way mirror."));
  console.log();
}
