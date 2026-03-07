/**
 * SDK wrapper — wrap any agent in behavioral monitoring + correction in 5 lines.
 *
 * Usage:
 *   import { wrapAgent } from "holomime";
 *
 *   const agent = wrapAgent({ name: "support-bot", provider: "anthropic" });
 *   const { guard, correction } = await agent.guardAndCorrect(messages);
 */

import type { Message } from "./core/types.js";
import type { LLMProvider } from "./llm/provider.js";
import { Guard, type GuardResult } from "./hub/guard.js";
import { runAutopilot, type AutopilotResult, type AutopilotThreshold } from "./analysis/autopilot-core.js";
import { loadSpec } from "./core/inheritance.js";
import { createProvider } from "./llm/provider.js";

// ─── Types ────────────────────────────────────────────────

export interface WrapAgentOptions {
  /** Agent name (used in reports and transcripts). */
  name: string;
  /** Path to .personality.json or inline spec object. */
  personality?: string | object;
  /** LLM provider: "anthropic" | "openai" | "ollama", or a pre-built LLMProvider. */
  provider?: string | LLMProvider;
  /** Minimum severity to trigger correction. Default: "targeted". */
  threshold?: AutopilotThreshold;
}

export interface WrappedAgent {
  /** Agent name. */
  name: string;
  /** Run all behavioral detectors against messages. No LLM needed. */
  guard(messages: Message[]): GuardResult;
  /** Run full correction pipeline (diagnose → session → apply). Requires an LLM provider. */
  correct(messages: Message[]): Promise<AutopilotResult>;
  /** Guard first, then correct if guard fails. */
  guardAndCorrect(messages: Message[]): Promise<{ guard: GuardResult; correction?: AutopilotResult }>;
}

// ─── Factory ──────────────────────────────────────────────

export function wrapAgent(options: WrapAgentOptions): WrappedAgent {
  const { name } = options;

  // Resolve personality spec
  const spec = resolveSpec(options.personality, name);

  // Build guard chain with all built-in detectors
  const guardChain = Guard.create(name).useAll();

  // Resolve LLM provider (lazily — only needed for correct/guardAndCorrect)
  let cachedProvider: LLMProvider | undefined;
  function getProvider(): LLMProvider {
    if (cachedProvider) return cachedProvider;
    if (!options.provider) {
      throw new Error("wrapAgent: provider is required for correction. Pass provider option or use guard() for detection-only.");
    }
    if (typeof options.provider === "string") {
      const providerName = options.provider as "anthropic" | "openai" | "ollama";
      const keyMap: Record<string, string> = {
        anthropic: "ANTHROPIC_API_KEY",
        openai: "OPENAI_API_KEY",
      };
      const envKey = keyMap[providerName];
      const apiKey = envKey ? process.env[envKey] : undefined;
      cachedProvider = createProvider({ provider: providerName, apiKey });
    } else {
      cachedProvider = options.provider;
    }
    return cachedProvider;
  }

  const threshold = options.threshold ?? "targeted";

  return {
    name,

    guard(messages: Message[]): GuardResult {
      return guardChain.run(messages);
    },

    async correct(messages: Message[]): Promise<AutopilotResult> {
      return runAutopilot(spec, messages, getProvider(), { threshold });
    },

    async guardAndCorrect(messages: Message[]): Promise<{ guard: GuardResult; correction?: AutopilotResult }> {
      const guardResult = guardChain.run(messages);
      if (guardResult.passed) {
        return { guard: guardResult };
      }
      const correction = await runAutopilot(spec, messages, getProvider(), { threshold });
      return { guard: guardResult, correction };
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────

function resolveSpec(personality: string | object | undefined, name: string): any {
  if (!personality) {
    return { name, big_five: {}, therapy_dimensions: {} };
  }
  if (typeof personality === "string") {
    return loadSpec(personality);
  }
  return personality;
}
