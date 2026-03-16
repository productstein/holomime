import chalk from "chalk";
import boxen from "boxen";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type Tier = "free" | "pro" | "enterprise";

const FREE_COMMANDS = ["init", "compile", "validate", "profile", "diagnose", "assess", "browse", "use", "install", "publish", "activate", "telemetry", "embody"];
const PRO_COMMANDS = ["session", "growth", "autopilot", "export", "train", "eval", "evolve", "benchmark", "watch", "certify", "daemon", "fleet", "fleet-therapy", "group-therapy", "network", "share", "prescribe", "voice", "cure", "brain"];

/**
 * Check if a command requires the pro tier.
 */
export function requiresPro(command: string): boolean {
  return PRO_COMMANDS.includes(command);
}

interface LicenseCache {
  valid: boolean;
  tier: string;
  checkedAt: string;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCachePath(): string {
  return join(homedir(), ".holomime", "license-cache.json");
}

function readCache(): LicenseCache | null {
  try {
    const cachePath = getCachePath();
    if (!existsSync(cachePath)) return null;
    const raw = JSON.parse(readFileSync(cachePath, "utf-8"));
    const age = Date.now() - new Date(raw.checkedAt).getTime();
    if (age > CACHE_TTL_MS) return null;
    return raw;
  } catch {
    return null;
  }
}

function writeCache(cache: LicenseCache): void {
  try {
    const dir = join(homedir(), ".holomime");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(getCachePath(), JSON.stringify(cache));
  } catch {
    // Best-effort caching
  }
}

/**
 * Validate a license key against the server.
 * Returns tier info, with offline fallback to cached result.
 */
export async function validateLicense(key: string): Promise<{ valid: boolean; tier: string }> {
  try {
    const res = await fetch("https://holomime.dev/api/license/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });

    if (!res.ok) {
      const cached = readCache();
      if (cached) return cached;
      return { valid: false, tier: "free" };
    }

    const data = (await res.json()) as { valid: boolean; tier?: string };
    const result = { valid: data.valid, tier: data.tier ?? "pro" };
    writeCache({ ...result, checkedAt: new Date().toISOString() });
    return result;
  } catch {
    // Offline fallback: trust cache if available
    const cached = readCache();
    if (cached) return cached;
    // Grace period: if we have a key file but can't reach server, trust locally
    return { valid: true, tier: "pro" };
  }
}

/**
 * Read the stored license key from env or file.
 */
export function readLicenseKey(): string | null {
  if (process.env.HOLOMIME_LICENSE) return process.env.HOLOMIME_LICENSE;
  try {
    const licensePath = join(homedir(), ".holomime", "license");
    if (existsSync(licensePath)) {
      const token = readFileSync(licensePath, "utf-8").trim();
      if (token.length > 0) return token;
    }
  } catch {
    // No license
  }
  return null;
}

/**
 * Check if the user has a pro license.
 * Checks (in order): HOLOMIME_DEV env, HOLOMIME_LICENSE env, ~/.holomime/license file.
 * Uses cached server validation when available.
 */
export function hasProLicense(): boolean {
  // Dev bypass
  if (process.env.HOLOMIME_DEV === "1") return true;

  const key = readLicenseKey();
  if (!key) return false;

  // Check cache for server-validated result
  const cached = readCache();
  if (cached) return cached.valid;

  // No cache — trust the key exists (server validation happens on activate)
  return true;
}

/**
 * Show an upgrade prompt for pro features.
 */
export function showUpgradePrompt(command: string): void {
  const content = [
    `${chalk.bold("This is a HoloMime Pro feature.")}`,
    "",
    `The ${chalk.cyan(command)} command requires a Pro license ($149/mo).`,
    "",
    `${chalk.dim("Pro features include:")}`,
    `  ${chalk.cyan("\u2022")} Live alignment sessions with supervisor mode`,
    `  ${chalk.cyan("\u2022")} Recursive alignment (evolve until converged)`,
    `  ${chalk.cyan("\u2022")} 8-scenario behavioral stress testing`,
    `  ${chalk.cyan("\u2022")} Continuous drift detection & auto-alignment`,
    `  ${chalk.cyan("\u2022")} Training data export (DPO, RLHF, Alpaca)`,
    `  ${chalk.cyan("\u2022")} ML fine-tuning (OpenAI, HuggingFace TRL)`,
    `  ${chalk.cyan("\u2022")} Outcome evaluation (before/after grading)`,
    `  ${chalk.cyan("\u2022")} Growth tracking & session transcripts`,
    "",
    `${chalk.dim("Activate with:")} ${chalk.cyan("holomime activate <key>")}`,
    `${chalk.dim("Get a license:")} ${chalk.cyan("https://holomime.dev/pro")}`,
  ].join("\n");

  console.log(
    boxen(content, {
      padding: { top: 1, bottom: 1, left: 2, right: 2 },
      margin: { top: 1, bottom: 1, left: 2, right: 0 },
      borderColor: "magenta",
      borderStyle: "round",
      title: "HoloMime Pro",
      titleAlignment: "center",
    }),
  );
}

/**
 * Soft upsell after free commands that naturally lead to Pro.
 */
export function showSoftUpsell(context: "diagnose" | "assess"): void {
  console.log(
    chalk.dim(`  Tip: ${chalk.cyan("holomime session")} runs a live alignment session to work on these patterns. ${chalk.dim("[Pro]")}`),
  );
  console.log();
}

/**
 * Check if .personality.json exists in cwd.
 */
export function checkPersonalityExists(): boolean {
  return existsSync(join(process.cwd(), ".personality.json"));
}

/**
 * Friendly welcome screen for first-time users.
 */
export function showWelcome(): void {
  const content = [
    `${chalk.bold("Welcome to HoloMime!")}`,
    "",
    `It looks like you haven't created a personality profile yet.`,
    `Run ${chalk.cyan("holomime init")} to build one through a guided assessment.`,
    "",
    chalk.dim("Takes about 5 minutes. Creates .personality.json in this directory."),
  ].join("\n");

  console.log(
    boxen(content, {
      padding: { top: 1, bottom: 1, left: 2, right: 2 },
      margin: { top: 1, bottom: 1, left: 2, right: 0 },
      borderColor: "cyan",
      borderStyle: "round",
      title: "First Time?",
      titleAlignment: "center",
    }),
  );
}

/**
 * Resolve the current user's tier from license cache.
 */
export function getCurrentTier(): Tier {
  if (process.env.HOLOMIME_DEV === "1") return "enterprise";
  const key = readLicenseKey();
  if (!key) return "free";
  const cached = readCache();
  if (cached?.valid) return (cached.tier as Tier) ?? "pro";
  return "pro"; // has key, no cache — assume pro
}

/**
 * Max agents allowed per fleet-therapy invocation for each tier.
 * Returns null for unlimited.
 */
export function getFleetTherapyLimit(tier: Tier): number | null {
  switch (tier) {
    case "free": return 0;
    case "pro": return 10;
    case "enterprise": return null;
  }
}

export { FREE_COMMANDS, PRO_COMMANDS };
