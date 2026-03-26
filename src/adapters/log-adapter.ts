/**
 * Unified conversation log adapter.
 * Auto-detects format or uses explicit format parameter.
 * Supports: holomime, ChatGPT, Claude, OpenAI API, Anthropic API,
 *           OpenTelemetry GenAI, and JSONL.
 */

import { conversationLogSchema, type Conversation } from "../core/types.js";
import { parseChatGPTExport, isChatGPTExport } from "./chatgpt.js";
import { parseClaudeExport, isClaudeExport } from "./claude-export.js";
import { parseOpenAIAPILog, isOpenAIAPILog } from "./openai-api.js";
import { parseAnthropicAPILog, isAnthropicAPILog } from "./anthropic-api.js";
import { parseOTelGenAIExport, isOTelGenAIExport } from "./otel-genai.js";
import { parseJSONLLog, isJSONLString } from "./jsonl.js";

export type LogFormat =
  | "holomime"
  | "chatgpt"
  | "claude"
  | "openai-api"
  | "anthropic-api"
  | "otel"
  | "jsonl"
  | "auto";

/**
 * Parse a conversation log from any supported format.
 * Returns normalized Conversation[].
 */
export function parseConversationLog(raw: unknown, format: LogFormat = "auto"): Conversation[] {
  if (format === "holomime") {
    return parseHolomime(raw);
  }

  if (format === "chatgpt") {
    if (!Array.isArray(raw)) throw new Error("ChatGPT format expects an array of conversation objects");
    return parseChatGPTExport(raw);
  }

  if (format === "claude") {
    return parseClaudeExport(raw as any);
  }

  if (format === "openai-api") {
    return parseOpenAIAPILog(raw as any);
  }

  if (format === "anthropic-api") {
    return parseAnthropicAPILog(raw as any);
  }

  if (format === "otel") {
    return parseOTelGenAIExport(raw as any);
  }

  if (format === "jsonl") {
    if (typeof raw !== "string") throw new Error("JSONL format expects a raw string (not parsed JSON)");
    return parseJSONLLog(raw);
  }

  // Auto-detect
  // Try native holomime format first (cheapest check)
  const holomimeResult = conversationLogSchema.safeParse(raw);
  if (holomimeResult.success) {
    const log = holomimeResult.data;
    return Array.isArray(log) ? log : [log];
  }

  // ChatGPT: array with `mapping` property
  if (isChatGPTExport(raw)) {
    return parseChatGPTExport(raw);
  }

  // Claude: object with `conversations` containing `chat_messages`
  if (isClaudeExport(raw)) {
    return parseClaudeExport(raw as any);
  }

  // Anthropic API: { type: "message", content: [...] } — check before OpenAI API
  if (isAnthropicAPILog(raw)) {
    return parseAnthropicAPILog(raw as any);
  }

  // OpenAI API: object/array with `choices`
  if (isOpenAIAPILog(raw)) {
    return parseOpenAIAPILog(raw as any);
  }

  // OTel GenAI: { resourceSpans: [...] } with gen_ai.* attributes
  if (isOTelGenAIExport(raw)) {
    return parseOTelGenAIExport(raw as any);
  }

  throw new Error(
    "Unrecognized log format. Supported: holomime, chatgpt, claude, openai-api, anthropic-api, otel, jsonl. " +
    "Use --format to specify explicitly.",
  );
}

/**
 * Parse a conversation log from a raw file string.
 * Handles JSONL (which isn't valid JSON) before falling back to JSON parsing.
 * This is the recommended entry point for CLI commands reading from files.
 */
export function parseConversationLogFromString(raw: string, format: LogFormat = "auto"): Conversation[] {
  // Explicit JSONL format
  if (format === "jsonl") {
    return parseJSONLLog(raw);
  }

  // Auto-detect: try JSONL first (before JSON.parse which would fail on JSONL)
  if (format === "auto" && isJSONLString(raw)) {
    return parseJSONLLog(raw);
  }

  // Parse as JSON and delegate to standard handler
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "Failed to parse log file. If the file is JSONL (one JSON object per line), use --format jsonl.",
    );
  }

  return parseConversationLog(parsed, format);
}

function parseHolomime(raw: unknown): Conversation[] {
  const result = conversationLogSchema.safeParse(raw);
  if (!result.success) {
    throw new Error("Invalid holomime conversation log format: " + result.error.message);
  }
  const log = result.data;
  return Array.isArray(log) ? log : [log];
}
