/**
 * LangChain / CrewAI / LlamaIndex Callback Handler
 *
 * Monitors LLM responses in real-time and detects behavioral anti-patterns.
 * Works with any LangChain-compatible framework that supports callback handlers.
 *
 * Usage:
 *   import { HolomimeCallbackHandler } from "holomime/integrations/langchain";
 *
 *   const handler = new HolomimeCallbackHandler({
 *     mode: "monitor",     // "monitor" | "enforce" | "strict"
 *     personality: ".personality.json",
 *     onViolation: (v) => console.warn("Behavioral drift:", v),
 *   });
 *
 *   // LangChain
 *   const chain = prompt.pipe(model).pipe(parser);
 *   await chain.invoke({ input: "hello" }, { callbacks: [handler] });
 *
 *   // CrewAI — pass as LangChain callback on the underlying LLM
 *   // LlamaIndex — use as a callback handler on the LLM
 */

import type { Message, DetectedPattern } from "../core/types.js";
import { Guard, type GuardResult } from "../hub/guard.js";
import { loadSpec } from "../core/inheritance.js";

// ─── Types ────────────────────────────────────────────────

export type CallbackMode =
  | "monitor"   // Log violations, never interfere
  | "enforce"   // Log + attempt correction (via onViolation)
  | "strict";   // Log + throw on concern-level violations

export interface CallbackViolation {
  patterns: DetectedPattern[];
  severity: "warning" | "concern";
  response: string;
  runId?: string;
  timestamp: string;
}

export interface HolomimeCallbackOptions {
  /** Guard mode. Default: "monitor". */
  mode?: CallbackMode;
  /** Path to .personality.json or inline spec object. */
  personality?: string | object;
  /** Minimum severity to trigger. Default: "warning". */
  minSeverity?: "warning" | "concern";
  /** Callback fired on every violation. */
  onViolation?: (violation: CallbackViolation) => void;
  /** Agent name for reports. Default: "langchain-agent". */
  name?: string;
  /** Buffer size — number of messages to retain for context. Default: 50. */
  bufferSize?: number;
}

export interface CallbackStats {
  totalResponses: number;
  passed: number;
  violated: number;
  blocked: number;
  patternCounts: Record<string, number>;
}

// ─── LangChain BaseCallbackHandler shape ──────────────────
// We don't import from langchain to keep it as an optional peer dep.
// Instead, we match the interface shape that langchain expects.

/**
 * HolomimeCallbackHandler — behavioral alignment monitor for LangChain-compatible frameworks.
 *
 * Implements the LangChain BaseCallbackHandler interface without importing langchain,
 * keeping it as an optional peer dependency. Works with LangChain, CrewAI, and any
 * framework that accepts { handleLLMEnd, handleLLMStart, handleLLMError } callbacks.
 */
export class HolomimeCallbackHandler {
  readonly name = "holomime";

  // LangChain expects these to be set
  readonly lc_serializable = false;

  private guard: Guard;
  private mode: CallbackMode;
  private minSeverity: "warning" | "concern";
  private onViolation?: (violation: CallbackViolation) => void;
  private messageBuffer: Message[] = [];
  private bufferSize: number;
  private currentRunMessages: Map<string, Message[]> = new Map();

  private _stats: CallbackStats = {
    totalResponses: 0,
    passed: 0,
    violated: 0,
    blocked: 0,
    patternCounts: {},
  };

  constructor(options: HolomimeCallbackOptions = {}) {
    this.mode = options.mode ?? "monitor";
    this.minSeverity = options.minSeverity ?? "warning";
    this.onViolation = options.onViolation;
    this.bufferSize = options.bufferSize ?? 50;

    const agentName = options.name ?? "langchain-agent";

    // Build guard with all detectors
    this.guard = Guard.create(agentName).useAll();

    // Load personality spec if provided (for future enhanced detection)
    if (options.personality) {
      if (typeof options.personality === "string") {
        loadSpec(options.personality); // validates but guard uses its own detectors
      }
    }
  }

  /**
   * Called when an LLM starts generating.
   * Captures the input messages for context.
   */
  handleLLMStart(
    _llm: any,
    prompts: string[],
    runId?: string,
  ): void {
    const key = runId ?? "default";
    const messages: Message[] = prompts.map((p) => ({
      role: "user" as const,
      content: p,
    }));
    this.currentRunMessages.set(key, messages);
  }

  /**
   * Called when an LLM finishes generating.
   * Runs behavioral analysis on the response.
   */
  handleLLMEnd(output: any, runId?: string): void {
    const key = runId ?? "default";
    const responseText = this.extractResponseText(output);
    if (!responseText) return;

    this._stats.totalResponses++;

    // Build context from buffer + current run messages
    const runMessages = this.currentRunMessages.get(key) ?? [];
    const contextMessages: Message[] = [
      ...this.messageBuffer.slice(-this.bufferSize),
      ...runMessages,
      { role: "assistant", content: responseText },
    ];

    // Update buffer
    this.messageBuffer.push(
      ...runMessages,
      { role: "assistant", content: responseText },
    );
    if (this.messageBuffer.length > this.bufferSize) {
      this.messageBuffer = this.messageBuffer.slice(-this.bufferSize);
    }

    // Clean up run tracking
    this.currentRunMessages.delete(key);

    // Run guard
    const result = this.guard.run(contextMessages);

    if (result.passed || !this.severityMeetsMin(result.severity)) {
      this._stats.passed++;
      return;
    }

    // Violation detected
    this._stats.violated++;
    for (const p of result.patterns) {
      this._stats.patternCounts[p.id] =
        (this._stats.patternCounts[p.id] || 0) + 1;
    }

    const violation: CallbackViolation = {
      patterns: result.patterns,
      severity: result.severity as "warning" | "concern",
      response: responseText,
      runId: runId,
      timestamp: new Date().toISOString(),
    };

    this.onViolation?.(violation);

    // In strict mode, throw on concern-level violations
    if (this.mode === "strict" && result.severity === "concern") {
      this._stats.blocked++;
      throw new HolomimeViolationError(violation);
    }
  }

  /**
   * Called on LLM errors. Clean up run tracking.
   */
  handleLLMError(_error: any, runId?: string): void {
    const key = runId ?? "default";
    this.currentRunMessages.delete(key);
  }

  /**
   * Called when a chain starts. Captures input for context.
   */
  handleChainStart(
    _chain: any,
    inputs: Record<string, any>,
    runId?: string,
  ): void {
    const key = runId ?? "default";
    const inputText =
      inputs.input ?? inputs.question ?? inputs.query ?? "";
    if (typeof inputText === "string" && inputText) {
      const existing = this.currentRunMessages.get(key) ?? [];
      existing.push({ role: "user", content: inputText });
      this.currentRunMessages.set(key, existing);
    }
  }

  /**
   * Get cumulative stats.
   */
  stats(): CallbackStats {
    return {
      ...this._stats,
      patternCounts: { ...this._stats.patternCounts },
    };
  }

  /**
   * Reset the message buffer and stats.
   */
  reset(): void {
    this.messageBuffer = [];
    this.currentRunMessages.clear();
    this._stats = {
      totalResponses: 0,
      passed: 0,
      violated: 0,
      blocked: 0,
      patternCounts: {},
    };
  }

  /**
   * Get the current guard result for the buffered conversation.
   */
  diagnose(): GuardResult {
    return this.guard.run(this.messageBuffer);
  }

  // ─── Private helpers ──────────────────────────────────────

  private severityMeetsMin(severity: string): boolean {
    if (this.minSeverity === "warning") return severity !== "clean";
    if (this.minSeverity === "concern") return severity === "concern";
    return false;
  }

  private extractResponseText(output: any): string | null {
    // LangChain LLMResult: { generations: [[{ text }]] }
    if (output?.generations?.[0]?.[0]?.text) {
      return output.generations[0][0].text;
    }
    // LangChain ChatResult: { generations: [[{ message: { content } }]] }
    if (output?.generations?.[0]?.[0]?.message?.content) {
      return output.generations[0][0].message.content;
    }
    // Direct string
    if (typeof output === "string") {
      return output;
    }
    return null;
  }
}

/**
 * Error thrown in strict mode when a concern-level violation is detected.
 */
export class HolomimeViolationError extends Error {
  readonly violation: CallbackViolation;

  constructor(violation: CallbackViolation) {
    const patternNames = violation.patterns.map((p) => p.name).join(", ");
    super(`HoloMime behavioral violation (${violation.severity}): ${patternNames}`);
    this.name = "HolomimeViolationError";
    this.violation = violation;
  }
}
