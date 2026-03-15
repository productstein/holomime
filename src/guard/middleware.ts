/**
 * Runtime Guard Middleware — intercept LLM calls and enforce behavioral alignment.
 *
 * Unlike Guard.run() which analyzes messages after the fact, the middleware
 * sits in the request path and can detect + correct responses before they
 * reach the user. Think firewall, not antivirus.
 *
 * Usage:
 *   import { createGuardMiddleware } from "holomime";
 *
 *   const middleware = createGuardMiddleware({
 *     personality: ".personality.json",
 *     mode: "enforce",        // "monitor" | "enforce" | "strict"
 *     onViolation: (v) => console.log(v),
 *   });
 *
 *   // Wrap an OpenAI call
 *   const response = await middleware.wrap(
 *     openai.chat.completions.create({ model: "gpt-4o", messages })
 *   );
 *
 *   // Or use as a message filter
 *   const filtered = await middleware.filter(messages, assistantResponse);
 */

import type { Message, DetectedPattern, PersonalitySpec } from "../core/types.js";
import { Guard, type GuardResult } from "../hub/guard.js";
import { loadSpec } from "../core/inheritance.js";
import { generateSystemPrompt } from "../core/prompt-gen.js";

// ─── Types ────────────────────────────────────────────────

export type GuardMode =
  /** Monitor only — log violations but pass responses through unchanged. */
  | "monitor"
  /** Enforce — attempt to correct responses that fail the guard. */
  | "enforce"
  /** Strict — block responses that fail the guard entirely. */
  | "strict";

export interface GuardViolation {
  /** The patterns that triggered. */
  patterns: DetectedPattern[];
  /** Overall severity. */
  severity: "warning" | "concern";
  /** The original response text. */
  originalResponse: string;
  /** The corrected response (only in enforce mode). */
  correctedResponse?: string;
  /** Whether the response was blocked (strict mode). */
  blocked: boolean;
  /** Timestamp. */
  timestamp: string;
}

export interface GuardMiddlewareOptions {
  /** Path to .personality.json, inline spec, or pre-loaded PersonalitySpec. */
  personality?: string | object;
  /** Guard mode. Default: "enforce". */
  mode?: GuardMode;
  /** Callback fired on every violation. */
  onViolation?: (violation: GuardViolation) => void;
  /** Minimum severity to trigger action. Default: "warning". */
  minSeverity?: "warning" | "concern";
  /** Custom Guard instance (overrides default all-detectors guard). */
  guard?: Guard;
  /** Agent name for reports. */
  name?: string;
  /** Maximum correction attempts before falling back to original. Default: 1. */
  maxCorrections?: number;
}

export interface GuardMiddleware {
  /** The underlying Guard instance. */
  guard: Guard;
  /** The guard mode. */
  mode: GuardMode;

  /**
   * Filter a single assistant response against the conversation history.
   * Returns the (possibly corrected) response text.
   */
  filter(
    conversationHistory: Message[],
    assistantResponse: string,
  ): GuardFilterResult;

  /**
   * Wrap a Promise that resolves to an LLM API response.
   * Extracts the response text, runs the guard, and returns the
   * (possibly corrected) result in the same shape.
   *
   * Works with any object that has a nested string response —
   * provide an extractor/injector for custom shapes.
   */
  wrap<T>(
    llmCall: Promise<T>,
    options?: WrapOptions<T>,
  ): Promise<GuardWrapResult<T>>;

  /** Get cumulative stats for this middleware instance. */
  stats(): GuardMiddlewareStats;
}

export interface WrapOptions<T> {
  /** Extract the assistant's text from the LLM response object. */
  extractResponse?: (response: T) => string;
  /** Inject corrected text back into the response object. */
  injectResponse?: (response: T, corrected: string) => T;
  /** Conversation history (messages sent to the LLM). */
  messages?: Message[];
}

export interface GuardFilterResult {
  /** The final response text (original or corrected). */
  text: string;
  /** Whether the guard passed. */
  passed: boolean;
  /** Full guard result. */
  guardResult: GuardResult;
  /** Violation details (if any). */
  violation?: GuardViolation;
  /** Whether the response was corrected. */
  corrected: boolean;
}

export interface GuardWrapResult<T> {
  /** The LLM response (possibly with corrected text injected). */
  response: T;
  /** Whether the guard passed. */
  passed: boolean;
  /** Full guard result. */
  guardResult: GuardResult;
  /** Violation details (if any). */
  violation?: GuardViolation;
  /** Whether the response was corrected. */
  corrected: boolean;
}

export interface GuardMiddlewareStats {
  /** Total calls processed. */
  totalCalls: number;
  /** Calls that passed the guard. */
  passed: number;
  /** Calls that violated. */
  violated: number;
  /** Calls that were corrected (enforce mode). */
  corrected: number;
  /** Calls that were blocked (strict mode). */
  blocked: number;
  /** Pattern frequency map. */
  patternCounts: Record<string, number>;
}

// ─── Default Extractors for Common LLM APIs ─────────────

/** Extract response text from OpenAI chat completion shape. */
function extractOpenAIResponse(response: any): string {
  // OpenAI: response.choices[0].message.content
  if (response?.choices?.[0]?.message?.content) {
    return response.choices[0].message.content;
  }
  // Anthropic: response.content[0].text
  if (response?.content?.[0]?.text) {
    return response.content[0].text;
  }
  // Plain string
  if (typeof response === "string") {
    return response;
  }
  throw new Error(
    "Could not extract response text. Provide a custom extractResponse function.",
  );
}

/** Inject corrected text into OpenAI/Anthropic response shape. */
function injectResponseText(response: any, text: string): any {
  if (response?.choices?.[0]?.message?.content !== undefined) {
    // Deep clone to avoid mutating original
    const cloned = JSON.parse(JSON.stringify(response));
    cloned.choices[0].message.content = text;
    return cloned;
  }
  if (response?.content?.[0]?.text !== undefined) {
    const cloned = JSON.parse(JSON.stringify(response));
    cloned.content[0].text = text;
    return cloned;
  }
  if (typeof response === "string") {
    return text;
  }
  return response;
}

// ─── Correction Engine ──────────────────────────────────

/**
 * Apply prescriptions from detected patterns to correct the response.
 * This is a deterministic, rule-based correction — no LLM call needed.
 */
function applyCorrections(
  text: string,
  patterns: DetectedPattern[],
  _spec?: any,
): string {
  let corrected = text;

  for (const pattern of patterns) {
    switch (pattern.id) {
      case "over-apologizing": {
        // Remove gratuitous apologies, keep meaningful ones
        corrected = corrected
          .replace(/\bI'm (?:so |very |truly |really )?sorry(?:,| but| that| for| about| if)\b/gi, "")
          .replace(/\bI apologize (?:for|that|if)\b/gi, "")
          .replace(/\bMy apologies(?:,| \.)\b/gi, "")
          .replace(/^\s*[,.]?\s*/gm, (match) => match.trim() ? match : "")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        break;
      }
      case "hedge-stacking": {
        // Reduce hedge density — remove stacked hedges, keep one per sentence
        const hedgePatterns = [
          /\b(?:I think |I believe |I feel like |In my opinion, |It seems (?:like |to me )?(?:that )?)/gi,
          /\b(?:perhaps |maybe |possibly |arguably |potentially )/gi,
          /\b(?:sort of |kind of |more or less |to some extent )/gi,
        ];
        // Only remove hedges that appear multiple times in the same sentence
        const sentences = corrected.split(/(?<=[.!?])\s+/);
        corrected = sentences.map(sentence => {
          let hedgeCount = 0;
          let result = sentence;
          for (const hp of hedgePatterns) {
            result = result.replace(hp, (match) => {
              hedgeCount++;
              return hedgeCount > 1 ? "" : match;
            });
          }
          return result;
        }).join(" ").replace(/\s{2,}/g, " ").trim();
        break;
      }
      case "sycophancy":
      case "sentiment-skew": {
        // Remove excessive agreement markers
        corrected = corrected
          .replace(/\b(?:Absolutely|Exactly|You're absolutely right|That's a great (?:question|point|idea|observation))(?:!|\.)\s*/gi, "")
          .replace(/^\s*[,.]?\s*/gm, (match) => match.trim() ? match : "")
          .trim();
        break;
      }
      // Other patterns: log but don't auto-correct (too context-dependent)
    }
  }

  // If corrections emptied the response, return original
  if (corrected.trim().length < 10) {
    return text;
  }

  return corrected;
}

// ─── Factory ──────────────────────────────────────────────

export function createGuardMiddleware(
  options: GuardMiddlewareOptions = {},
): GuardMiddleware {
  const mode = options.mode ?? "enforce";
  const minSeverity = options.minSeverity ?? "warning";
  const name = options.name ?? "Agent";
  const maxCorrections = options.maxCorrections ?? 1;

  // Resolve personality spec
  let spec: any;
  if (options.personality) {
    if (typeof options.personality === "string") {
      spec = loadSpec(options.personality);
    } else {
      spec = options.personality;
    }
  }

  // Build or use provided guard
  const guardChain = options.guard ?? Guard.create(name).useAll();

  // Stats tracking
  const stats: GuardMiddlewareStats = {
    totalCalls: 0,
    passed: 0,
    violated: 0,
    corrected: 0,
    blocked: 0,
    patternCounts: {},
  };

  function severityMeetsMin(severity: "clean" | "warning" | "concern"): boolean {
    if (minSeverity === "warning") return severity !== "clean";
    if (minSeverity === "concern") return severity === "concern";
    return false;
  }

  function trackPatterns(patterns: DetectedPattern[]): void {
    for (const p of patterns) {
      stats.patternCounts[p.id] = (stats.patternCounts[p.id] || 0) + 1;
    }
  }

  function processViolation(
    guardResult: GuardResult,
    responseText: string,
  ): { finalText: string; violation: GuardViolation; corrected: boolean } {
    const violation: GuardViolation = {
      patterns: guardResult.patterns,
      severity: guardResult.severity as "warning" | "concern",
      originalResponse: responseText,
      blocked: false,
      timestamp: new Date().toISOString(),
    };

    let finalText = responseText;
    let corrected = false;

    if (mode === "strict") {
      violation.blocked = true;
      stats.blocked++;
      finalText = `[Response blocked by behavioral guard: ${guardResult.patterns.map(p => p.name).join(", ")}]`;
    } else if (mode === "enforce") {
      let attempt = 0;
      let current = responseText;
      while (attempt < maxCorrections) {
        current = applyCorrections(current, guardResult.patterns, spec);
        attempt++;
        // Re-check after correction
        const recheck = guardChain.run([
          ...buildContextMessages(current),
        ]);
        if (recheck.passed || !severityMeetsMin(recheck.severity)) {
          break;
        }
      }
      if (current !== responseText) {
        corrected = true;
        violation.correctedResponse = current;
        stats.corrected++;
      }
      finalText = current;
    }
    // monitor mode: pass through unchanged

    stats.violated++;
    trackPatterns(guardResult.patterns);

    // Fire callback
    options.onViolation?.(violation);

    return { finalText, violation, corrected };
  }

  function buildContextMessages(text: string): Message[] {
    return [{ role: "assistant", content: text }];
  }

  return {
    guard: guardChain,
    mode,

    filter(
      conversationHistory: Message[],
      assistantResponse: string,
    ): GuardFilterResult {
      stats.totalCalls++;

      const allMessages: Message[] = [
        ...conversationHistory,
        { role: "assistant", content: assistantResponse },
      ];

      const guardResult = guardChain.run(allMessages);

      if (guardResult.passed || !severityMeetsMin(guardResult.severity)) {
        stats.passed++;
        return {
          text: assistantResponse,
          passed: true,
          guardResult,
          corrected: false,
        };
      }

      const { finalText, violation, corrected } = processViolation(
        guardResult,
        assistantResponse,
      );

      return {
        text: finalText,
        passed: false,
        guardResult,
        violation,
        corrected,
      };
    },

    async wrap<T>(
      llmCall: Promise<T>,
      wrapOpts?: WrapOptions<T>,
    ): Promise<GuardWrapResult<T>> {
      stats.totalCalls++;

      const response = await llmCall;

      const extract = wrapOpts?.extractResponse ?? extractOpenAIResponse;
      const inject = wrapOpts?.injectResponse ?? injectResponseText;
      const messages = wrapOpts?.messages ?? [];

      let responseText: string;
      try {
        responseText = extract(response);
      } catch {
        // Can't extract — pass through
        stats.passed++;
        return {
          response,
          passed: true,
          guardResult: {
            passed: true,
            agent: name,
            messagesAnalyzed: 0,
            patterns: [],
            healthy: [],
            detectorsRun: 0,
            timestamp: new Date().toISOString(),
            severity: "clean",
          },
          corrected: false,
        };
      }

      const allMessages: Message[] = [
        ...messages,
        { role: "assistant", content: responseText },
      ];

      const guardResult = guardChain.run(allMessages);

      if (guardResult.passed || !severityMeetsMin(guardResult.severity)) {
        stats.passed++;
        return {
          response,
          passed: true,
          guardResult,
          corrected: false,
        };
      }

      const { finalText, violation, corrected } = processViolation(
        guardResult,
        responseText,
      );

      const finalResponse = corrected ? inject(response, finalText) : response;

      return {
        response: finalResponse,
        passed: false,
        guardResult,
        violation,
        corrected,
      };
    },

    stats(): GuardMiddlewareStats {
      return { ...stats, patternCounts: { ...stats.patternCounts } };
    },
  };
}
