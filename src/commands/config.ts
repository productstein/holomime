/**
 * holomime config — one-time API key setup.
 *
 * Saves provider + API key to ~/.holomime/config.json so every
 * command just works without flags or env vars.
 *
 * Usage:
 *   holomime config                    → interactive setup
 *   holomime config --provider anthropic --key sk-ant-...  → non-interactive
 *   holomime config --show             → show current config
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import chalk from "chalk";
import { printHeader } from "../ui/branding.js";

// ─── Types ──────────────────────────────────────────────────

export interface HolomimeConfig {
  provider: string;
  apiKey: string;
  model?: string;
}

// ─── Config Path ────────────────────────────────────────────

export function getConfigPath(): string {
  return join(homedir(), ".holomime", "config.json");
}

export function getConfigDir(): string {
  return join(homedir(), ".holomime");
}

// ─── Load / Save ────────────────────────────────────────────

export function loadConfig(): HolomimeConfig | null {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return null;

  try {
    const data = JSON.parse(readFileSync(configPath, "utf-8"));
    if (data.provider && data.apiKey) return data as HolomimeConfig;
    return null;
  } catch {
    return null;
  }
}

export function saveConfig(config: HolomimeConfig): void {
  const configDir = getConfigDir();
  mkdirSync(configDir, { recursive: true });
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
}

// ─── Command ────────────────────────────────────────────────

interface ConfigOptions {
  provider?: string;
  key?: string;
  show?: boolean;
}

export async function configCommand(options: ConfigOptions): Promise<void> {
  printHeader("Config");

  // Show current config
  if (options.show) {
    const config = loadConfig();
    if (config) {
      console.log(chalk.dim("  Provider:  ") + chalk.cyan(config.provider));
      console.log(chalk.dim("  API Key:   ") + chalk.cyan(config.apiKey.slice(0, 12) + "..." + config.apiKey.slice(-4)));
      if (config.model) {
        console.log(chalk.dim("  Model:     ") + chalk.cyan(config.model));
      }
      console.log(chalk.dim("  Config:    ") + getConfigPath());
    } else {
      console.log(chalk.yellow("  No config found. Run `holomime config` to set up."));
    }
    console.log();
    return;
  }

  // Non-interactive mode
  if (options.provider && options.key) {
    const config: HolomimeConfig = {
      provider: options.provider,
      apiKey: options.key,
    };
    saveConfig(config);
    console.log(chalk.green("  Config saved!"));
    console.log(chalk.dim(`  Provider: ${config.provider}`));
    console.log(chalk.dim(`  Location: ${getConfigPath()}`));
    console.log();
    return;
  }

  // Interactive mode
  console.log(chalk.dim("  Set up your API key so every command just works."));
  console.log(chalk.dim("  This saves to ~/.holomime/config.json (one-time setup)."));
  console.log();

  // Use basic stdin for interactive prompts (no dependency on inquirer)
  const readline = await import("node:readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question: string): Promise<string> =>
    new Promise((resolve) => rl.question(question, resolve));

  try {
    const provider = (await ask("  Provider (anthropic/openai) [anthropic]: ")).trim().toLowerCase() || "anthropic";

    if (provider !== "anthropic" && provider !== "openai") {
      console.log(chalk.red(`  Unsupported provider: ${provider}`));
      rl.close();
      return;
    }

    const keyHint = provider === "anthropic" ? "sk-ant-..." : "sk-...";
    const apiKey = (await ask(`  API Key (${keyHint}): `)).trim();

    if (!apiKey) {
      console.log(chalk.red("  API key is required."));
      rl.close();
      return;
    }

    const config: HolomimeConfig = { provider, apiKey };
    saveConfig(config);

    console.log();
    console.log(chalk.green("  Config saved!"));
    console.log(chalk.dim(`  Location: ${getConfigPath()}`));
    console.log();
    console.log(chalk.dim("  Now every command auto-detects your provider:"));
    console.log(chalk.cyan("    holomime diagnose"));
    console.log(chalk.cyan("    holomime cure"));
    console.log(chalk.cyan("    holomime benchmark"));
    console.log(chalk.cyan("    holomime daemon"));
    console.log();

    rl.close();
  } catch {
    rl.close();
  }
}
