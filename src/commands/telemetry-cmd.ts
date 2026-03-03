import chalk from "chalk";
import figures from "figures";
import { getTelemetryStatus, setTelemetryEnabled } from "../telemetry/config.js";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";

export async function telemetryCommand(action?: string): Promise<void> {
  printHeader("Telemetry");

  if (action === "enable") {
    setTelemetryEnabled(true);
    console.log();
    printBox(`${figures.tick} Telemetry enabled. Anonymous usage data will be collected.`, "success");
    console.log();
    return;
  }

  if (action === "disable") {
    setTelemetryEnabled(false);
    console.log();
    printBox(`${figures.tick} Telemetry disabled. No usage data will be collected.`, "info");
    console.log();
    return;
  }

  // Default: show status
  const status = getTelemetryStatus();

  console.log();
  printBox(
    [
      `Status: ${status.enabled ? chalk.green("Enabled") : chalk.yellow("Disabled")}`,
      `Reason: ${chalk.dim(status.reason)}`,
      "",
      chalk.dim("HoloMime collects anonymous usage data to improve the tool."),
      chalk.dim("No personal information, API keys, or file paths are ever collected."),
      "",
      `Enable:  ${chalk.cyan("holomime telemetry enable")}`,
      `Disable: ${chalk.cyan("holomime telemetry disable")}`,
      `Env:     ${chalk.cyan("HOLOMIME_TELEMETRY=0")} or ${chalk.cyan("DO_NOT_TRACK=1")}`,
    ].join("\n"),
    "info",
    "Telemetry Status",
  );
  console.log();
}
