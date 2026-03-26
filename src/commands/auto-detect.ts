/**
 * Auto-detect — finds personality file, API key, and model
 * so users can run bare commands with zero flags.
 *
 * Priority for API key detection:
 * 1. Environment variables (ANTHROPIC_API_KEY, OPENAI_API_KEY)
 * 2. ~/.holomime/config.json (set via `holomime config`)
 * 3. Fallback to ollama (local, no key needed)
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface AutoDetectResult {
  personalityPath: string | null;
  provider: string | null;
  model: string | null;
}

/**
 * Auto-detect personality file in current directory.
 */
export function detectPersonality(cwd?: string): string | null {
  const dir = cwd ?? process.cwd();
  const candidates = [
    join(dir, ".personality.json"),
    join(dir, "personality.json"),
  ];

  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * Auto-detect LLM provider.
 * Priority: env vars > ~/.holomime/config.json > ollama
 */
export function detectProvider(): { provider: string; model: string; apiKey?: string } {
  // 1. Check environment variables
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: "anthropic", model: "claude-haiku-4-5-20251001", apiKey: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: "openai", model: "gpt-4o-mini", apiKey: process.env.OPENAI_API_KEY };
  }

  // 2. Check ~/.holomime/config.json
  try {
    const configPath = join(homedir(), ".holomime", "config.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      if (config.provider && config.apiKey) {
        // Set the env var so downstream code can use it
        if (config.provider === "anthropic") {
          process.env.ANTHROPIC_API_KEY = config.apiKey;
        } else if (config.provider === "openai") {
          process.env.OPENAI_API_KEY = config.apiKey;
        }

        const defaultModel = config.provider === "anthropic"
          ? "claude-haiku-4-5-20251001"
          : "gpt-4o-mini";

        return {
          provider: config.provider,
          model: config.model ?? defaultModel,
          apiKey: config.apiKey,
        };
      }
    }
  } catch {
    // Config file not readable — continue
  }

  // 3. Fallback to ollama (local, no key)
  return { provider: "ollama", model: "llama3" };
}

/**
 * Check if an API key is available (env var or config file).
 */
export function hasApiKey(): boolean {
  const detected = detectProvider();
  return detected.provider !== "ollama";
}

/**
 * Auto-detect everything. Returns resolved values with fallbacks.
 */
export function autoDetect(options: {
  personality?: string;
  provider?: string;
  model?: string;
  requirePersonality?: boolean;
}): {
  personalityPath: string;
  provider: string;
  model: string;
} {
  // Personality
  const personalityPath = options.personality ?? detectPersonality();
  if (!personalityPath && options.requirePersonality !== false) {
    throw new Error(
      "No .personality.json found in current directory.\n" +
      "Run `holomime personality` to create one, or use --personality <path>.",
    );
  }

  // Provider + model
  const detected = detectProvider();
  const provider = options.provider ?? detected.provider;
  const model = options.model ?? detected.model;

  return {
    personalityPath: personalityPath ?? ".personality.json",
    provider,
    model,
  };
}
