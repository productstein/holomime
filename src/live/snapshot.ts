/**
 * Snapshot encoding and share URL generation.
 * Used by brain command, diagnose command, and benchmark command
 * to generate shareable brain visualization URLs.
 */

import { deflateSync } from "node:zlib";
import { execSync } from "node:child_process";
import chalk from "chalk";
import type { BrainEvent } from "./types.js";
import type { DiagnosisResult } from "../analysis/diagnose-core.js";
import { mapDiagnosisToBrainEvent } from "./brain-mapper.js";

const SHARE_BASE = "https://app.holomime.dev/brain";

/**
 * Compress a BrainEvent into a compact base64url-encoded string for sharing.
 */
export function encodeSnapshot(event: BrainEvent, agentName: string): string {
  const compact = {
    h: event.health,
    g: event.grade,
    m: event.messageCount,
    a: agentName,
    r: event.regions
      .filter((r) => r.intensity > 0)
      .map((r) => ({ i: r.id, n: Math.round(r.intensity * 100) / 100 })),
    p: event.patterns.map((p) => ({
      i: p.id,
      s: p.severity,
      c: Math.round(p.percentage * 10) / 10,
    })),
  };
  const json = JSON.stringify(compact);
  const compressed = deflateSync(Buffer.from(json));
  return compressed.toString("base64url");
}

/**
 * Generate a share URL from a DiagnosisResult.
 * Converts diagnosis → BrainEvent → compressed snapshot → URL.
 */
export function generateShareUrl(diagnosis: DiagnosisResult, agentName?: string): string {
  const brainEvent = mapDiagnosisToBrainEvent(diagnosis);
  const encoded = encodeSnapshot(brainEvent, agentName ?? "agent");
  return `${SHARE_BASE}?d=${encoded}`;
}

/**
 * Copy text to system clipboard. Silent fail on unsupported platforms.
 */
export function copyToClipboard(text: string): boolean {
  try {
    if (process.platform === "darwin") {
      execSync("pbcopy", { input: text });
      return true;
    } else if (process.platform === "linux") {
      execSync("xclip -selection clipboard", { input: text });
      return true;
    } else if (process.platform === "win32") {
      execSync("clip", { input: text });
      return true;
    }
  } catch {
    // clipboard not available
  }
  return false;
}

/**
 * Print a share link to console with clipboard status.
 */
export function printShareLink(url: string, copied: boolean): void {
  console.log("");
  console.log(
    chalk.green("  ✓ ") + chalk.bold("Share your agent's brain:"),
  );
  console.log("");
  console.log("  " + chalk.cyan(url));
  console.log("");
  if (copied) {
    console.log(chalk.dim("  Link copied to clipboard."));
  }
}

/**
 * Generate and print a share URL from a DiagnosisResult.
 * Convenience function that combines generation + clipboard + display.
 */
export function shareFromDiagnosis(diagnosis: DiagnosisResult, agentName?: string): void {
  const url = generateShareUrl(diagnosis, agentName);
  const copied = copyToClipboard(url);
  printShareLink(url, copied);
}
