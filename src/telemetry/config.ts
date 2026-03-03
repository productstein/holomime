/**
 * Telemetry configuration — opt-out logic, anonymous ID, first-run banner.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import chalk from "chalk";

const HOLOMIME_DIR = join(homedir(), ".holomime");
const CONFIG_PATH = join(HOLOMIME_DIR, "config.json");
const ANON_ID_PATH = join(HOLOMIME_DIR, "anonymous-id");

interface HolomimeConfig {
  telemetry?: boolean;
  telemetryBannerShown?: boolean;
}

function ensureDir(): void {
  if (!existsSync(HOLOMIME_DIR)) {
    mkdirSync(HOLOMIME_DIR, { recursive: true });
  }
}

export function readConfig(): HolomimeConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch {
    // Corrupted config — treat as empty
  }
  return {};
}

export function writeConfig(config: HolomimeConfig): void {
  ensureDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

/**
 * Check if telemetry should be collected.
 * Respects env vars, CI detection, and user config.
 */
export function shouldTrack(): boolean {
  // Env override — explicit disable
  if (process.env.HOLOMIME_TELEMETRY === "0") return false;
  if (process.env.DO_NOT_TRACK === "1") return false;

  // CI detection — never track in CI
  if (process.env.CI) return false;
  if (process.env.CONTINUOUS_INTEGRATION) return false;

  // User config
  const config = readConfig();
  if (config.telemetry === false) return false;

  return true;
}

/**
 * Get or create an anonymous UUID for this machine.
 * Stored in ~/.holomime/anonymous-id.
 */
export function getAnonymousId(): string {
  try {
    if (existsSync(ANON_ID_PATH)) {
      const id = readFileSync(ANON_ID_PATH, "utf-8").trim();
      if (id.length > 0) return id;
    }
  } catch {
    // Fall through to create
  }

  const id = randomUUID();
  ensureDir();
  writeFileSync(ANON_ID_PATH, id);
  return id;
}

/**
 * Show telemetry banner on first run (once per machine).
 */
export function showTelemetryBannerIfNeeded(): void {
  const config = readConfig();
  if (config.telemetryBannerShown) return;

  if (shouldTrack()) {
    console.log(
      chalk.dim(
        `  HoloMime collects anonymous usage data to improve the tool. Disable: ${chalk.cyan("holomime telemetry disable")}`,
      ),
    );
    console.log();
  }

  writeConfig({ ...config, telemetryBannerShown: true });
}

/**
 * Enable or disable telemetry.
 */
export function setTelemetryEnabled(enabled: boolean): void {
  const config = readConfig();
  writeConfig({ ...config, telemetry: enabled });
}

/**
 * Get current telemetry status.
 */
export function getTelemetryStatus(): { enabled: boolean; reason: string } {
  if (process.env.HOLOMIME_TELEMETRY === "0") {
    return { enabled: false, reason: "HOLOMIME_TELEMETRY=0 env var" };
  }
  if (process.env.DO_NOT_TRACK === "1") {
    return { enabled: false, reason: "DO_NOT_TRACK=1 env var" };
  }
  if (process.env.CI || process.env.CONTINUOUS_INTEGRATION) {
    return { enabled: false, reason: "CI environment detected" };
  }

  const config = readConfig();
  if (config.telemetry === false) {
    return { enabled: false, reason: "Disabled via holomime telemetry disable" };
  }

  return { enabled: true, reason: "Default (opt-out available)" };
}
