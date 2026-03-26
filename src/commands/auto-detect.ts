/**
 * Auto-detect — finds personality file, API key, and model
 * so users can run bare commands with zero flags.
 *
 * `holomime cure` just works. No --personality, no --provider, no --model.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

export interface AutoDetectResult {
  personalityPath: string | null;
  provider: string | null;
  model: string | null;
}

/**
 * Auto-detect personality file in current directory.
 * Checks: .personality.json, personality.json, .holomime/identity/
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
 * Auto-detect LLM provider from environment variables.
 * Priority: ANTHROPIC_API_KEY > OPENAI_API_KEY > ollama (local)
 */
export function detectProvider(): { provider: string; model: string } {
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: "anthropic", model: "claude-haiku-4-5-20251001" };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: "openai", model: "gpt-4o-mini" };
  }
  return { provider: "ollama", model: "llama3" };
}

/**
 * Auto-detect everything. Returns resolved values with fallbacks.
 * Throws if personality file is required but not found.
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
