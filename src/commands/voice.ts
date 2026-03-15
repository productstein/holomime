/**
 * Voice Command — real-time behavioral monitoring on voice conversations.
 *
 * Connects to a voice platform (LiveKit, Vapi, Retell, or generic input),
 * runs continuous behavioral diagnosis, and displays a real-time dashboard.
 */

import chalk from "chalk";
import figures from "figures";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";
import { loadSpec } from "../core/inheritance.js";
import {
  startVoiceMonitor,
  type VoiceMonitorHandle,
  type InterventionSuggestion,
  type BehavioralTrajectory,
} from "../analysis/voice-monitor.js";
import type { VoiceDiagnosisReport, VoicePersonalitySpec } from "../analysis/voice-core.js";
import type { VoiceAdapter } from "../adapters/voice/types.js";
import type { DetectedPattern } from "../core/types.js";

// ─── Options Interface ──────────────────────────────────────

export interface VoiceCommandOptions {
  personality: string;
  platform: string;
  /** LiveKit room name */
  room?: string;
  /** LiveKit server URL */
  serverUrl?: string;
  /** Vapi webhook port */
  webhookPort?: string;
  /** Retell agent ID */
  agentId?: string;
  /** Generic input file path */
  input?: string;
  /** Diagnosis interval in ms */
  interval?: string;
  /** Alert severity threshold */
  threshold?: string;
}

// ─── Time Formatter ─────────────────────────────────────────

function timeTag(): string {
  return chalk.dim(
    new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  );
}

// ─── Create Adapter ─────────────────────────────────────────

async function createAdapter(platform: string, options: VoiceCommandOptions): Promise<VoiceAdapter> {
  switch (platform) {
    case "livekit": {
      const { LiveKitAdapter } = await import("../adapters/voice/livekit-adapter.js");
      if (!options.room) {
        console.error(chalk.red(`  --room is required for LiveKit platform.`));
        process.exit(1);
      }
      return new LiveKitAdapter({
        roomName: options.room,
        serverUrl: options.serverUrl,
      });
    }
    case "vapi": {
      const { VapiAdapter } = await import("../adapters/voice/vapi-adapter.js");
      return new VapiAdapter({
        port: options.webhookPort ? parseInt(options.webhookPort, 10) : 3001,
      });
    }
    case "retell": {
      const { RetellAdapter } = await import("../adapters/voice/retell-adapter.js");
      if (!options.agentId) {
        console.error(chalk.red(`  --agent-id is required for Retell platform.`));
        process.exit(1);
      }
      return new RetellAdapter({
        agentId: options.agentId,
      });
    }
    case "generic": {
      const { GenericAdapter } = await import("../adapters/voice/generic-adapter.js");
      return new GenericAdapter({
        inputPath: options.input,
        watch: options.input ? true : false,
      });
    }
    default:
      console.error(chalk.red(`  Unknown platform: ${platform}`));
      console.error(chalk.dim("  Supported: livekit, vapi, retell, generic"));
      process.exit(1);
  }
}

// ─── Dashboard Rendering ────────────────────────────────────

function renderDiagnosis(report: VoiceDiagnosisReport): void {
  console.log();
  console.log(`  ${chalk.bold("Diagnosis")} ${chalk.dim(`(${report.sessionSummary.totalSegments} segments, ${report.sessionSummary.durationEstimate})`)}`);

  if (report.allPatterns.length === 0) {
    console.log(`  ${chalk.green(figures.tick)} No behavioral issues detected`);
  } else {
    for (const pattern of report.allPatterns) {
      const icon = pattern.severity === "concern" ? chalk.red(figures.cross) : chalk.yellow(figures.warning);
      console.log(`  ${icon} ${chalk.bold(pattern.name)} ${chalk.dim(`[${pattern.severity}]`)} ${pattern.percentage}%`);
      console.log(`    ${chalk.dim(pattern.description)}`);
      if (pattern.prescription) {
        console.log(`    ${chalk.cyan(figures.arrowRight)} ${chalk.dim(pattern.prescription)}`);
      }
    }
  }

  if (report.allHealthy.length > 0) {
    console.log();
    for (const h of report.allHealthy) {
      console.log(`  ${chalk.green(figures.tick)} ${h.name}: ${chalk.dim(h.description)}`);
    }
  }

  console.log();
}

function renderTrajectory(trajectory: BehavioralTrajectory): void {
  const directionIcon = trajectory.driftDirection === "stable"
    ? chalk.green(figures.line)
    : trajectory.driftDirection === "improving"
      ? chalk.green(figures.arrowDown)
      : chalk.red(figures.arrowUp);

  console.log(
    `  ${chalk.dim("Trajectory:")} ${directionIcon} ${trajectory.driftDirection} ` +
    `${chalk.dim(`| ${trajectory.checkpoints} checks | ${trajectory.activePatterns.length} active | ${trajectory.resolvedPatterns.length} resolved`)}`,
  );
}

// ─── Main Command ───────────────────────────────────────────

export async function voiceCommand(options: VoiceCommandOptions): Promise<void> {
  const specPath = resolve(process.cwd(), options.personality);

  let spec: any;
  try {
    spec = loadSpec(specPath);
  } catch {
    console.error(chalk.red(`  Could not read personality file: ${options.personality}`));
    process.exit(1);
    return;
  }

  const platform = options.platform ?? "generic";
  const diagnosisInterval = parseInt(options.interval ?? "15000", 10);
  const alertThreshold = (options.threshold ?? "warning") as "warning" | "concern";

  printHeader("Voice Monitor");

  // Build voice personality spec from loaded personality
  const voiceSpec: VoicePersonalitySpec = {
    expectedRateWpm: spec.expression?.prosody?.speaking_rate_wpm ?? 150,
    expectedVolume: spec.expression?.prosody?.volume_db_offset != null
      ? Math.min(1, Math.max(0, 0.5 + spec.expression.prosody.volume_db_offset / 20))
      : undefined,
    maxFillerFrequency: 0.08,
  };

  console.log(`  ${chalk.dim("Agent:")}     ${spec.name ?? "Unknown"}`);
  console.log(`  ${chalk.dim("Platform:")} ${platform}`);
  console.log(`  ${chalk.dim("Interval:")} ${diagnosisInterval / 1000}s`);
  console.log(`  ${chalk.dim("Threshold:")} ${alertThreshold}`);

  if (options.input) {
    console.log(`  ${chalk.dim("Input:")}    ${options.input}`);
  }
  if (options.room) {
    console.log(`  ${chalk.dim("Room:")}     ${options.room}`);
  }
  if (options.agentId) {
    console.log(`  ${chalk.dim("Agent ID:")} ${options.agentId}`);
  }
  console.log();

  // Create adapter
  const adapter = await createAdapter(platform, options);

  // Start monitor
  let segmentCount = 0;
  let alertCount = 0;
  let diagnosisCount = 0;

  const handle = startVoiceMonitor(
    {
      adapter,
      voiceSpec,
      diagnosisInterval,
      alertThreshold,
    },
    {
      onConnected: (p) => {
        printBox(
          `Connected to ${p}\nMonitoring voice conversation...\nPress ${chalk.cyan("Ctrl+C")} to stop.`,
          "info",
          "Voice Monitor Active",
        );
        console.log();
      },
      onDisconnected: (p) => {
        console.log(`  ${timeTag()} ${chalk.dim("Disconnected from")} ${p}`);
      },
      onSegment: (event) => {
        segmentCount++;
        const speakerColor = event.speaker === "user" ? chalk.blue : chalk.green;
        console.log(
          `  ${timeTag()} ${speakerColor(event.speaker.padEnd(6))} ${chalk.dim(event.text.substring(0, 80))}${event.text.length > 80 ? chalk.dim("...") : ""}`,
        );
      },
      onDiagnosis: (report) => {
        diagnosisCount++;
        renderDiagnosis(report);
      },
      onAlert: (pattern: DetectedPattern) => {
        alertCount++;
        const icon = pattern.severity === "concern" ? chalk.red(figures.cross) : chalk.yellow(figures.warning);
        console.log(`  ${timeTag()} ${icon} ${chalk.bold("ALERT:")} ${pattern.name} [${pattern.severity}]`);
      },
      onIntervention: (suggestion: InterventionSuggestion) => {
        console.log(`  ${timeTag()} ${chalk.magenta(figures.play)} ${chalk.bold("Intervention:")} ${suggestion.suggestion}`);
      },
      onTrajectoryUpdate: (trajectory: BehavioralTrajectory) => {
        renderTrajectory(trajectory);
      },
      onError: (error) => {
        console.log(`  ${timeTag()} ${chalk.red(figures.cross)} ${error}`);
      },
    },
  );

  // ─── Graceful Shutdown ──────────────────────────────────

  const shutdown = async () => {
    console.log();
    console.log(chalk.dim("  Stopping voice monitor..."));

    await handle.stop();

    const trajectory = handle.getTrajectory();
    const lastReport = handle.getLastDiagnosis();

    const summaryLines = [
      "Voice monitor stopped.",
      "",
      `Segments processed: ${segmentCount}`,
      `Diagnosis runs: ${diagnosisCount}`,
      `Alerts triggered: ${alertCount}`,
      `Trajectory: ${trajectory.driftDirection}`,
      `Active patterns: ${trajectory.activePatterns.length > 0 ? trajectory.activePatterns.join(", ") : "none"}`,
      `Resolved patterns: ${trajectory.resolvedPatterns.length > 0 ? trajectory.resolvedPatterns.join(", ") : "none"}`,
    ];

    printBox(summaryLines.join("\n"), alertCount > 0 ? "warning" : "success", "Voice Monitor Summary");
    console.log();

    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep alive
  await new Promise(() => {});
}
