/**
 * Anthropic Messages API log format adapter.
 * Handles response objects from the Anthropic Messages API,
 * including single responses, arrays, and request+response log pairs.
 */

import type { Conversation, Message } from "../core/types.js";

// ─── Anthropic API Interfaces ──────────────────────────────

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  id?: string;
  type: "message";
  role: "assistant";
  content: AnthropicContentBlock[];
  model?: string;
  stop_reason?: string;
}

interface AnthropicRequestMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

interface AnthropicRequestResponsePair {
  request: {
    messages: AnthropicRequestMessage[];
    system?: string | AnthropicContentBlock[];
    model?: string;
  };
  response: AnthropicResponse;
}

// ─── Helpers ───────────────────────────────────────────────

function extractTextContent(content: string | AnthropicContentBlock[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text!)
    .join("");
}

function mapRole(role: string): "user" | "assistant" | "system" {
  if (role === "user") return "user";
  if (role === "system") return "system";
  return "assistant";
}

// ─── Parser ────────────────────────────────────────────────

/**
 * Parse Anthropic API response logs.
 * Handles: single response, array of responses, or request+response pairs.
 */
export function parseAnthropicAPILog(
  data: AnthropicResponse | AnthropicResponse[] | AnthropicRequestResponsePair | AnthropicRequestResponsePair[],
): Conversation[] {
  const items = Array.isArray(data) ? data : [data];
  const conversations: Conversation[] = [];

  for (const item of items) {
    const messages: Message[] = [];
    let model: string | undefined;

    if (isRequestResponsePair(item)) {
      // Full request+response pair — reconstruct full conversation
      const pair = item as AnthropicRequestResponsePair;
      model = pair.request.model ?? pair.response.model;

      // System message (if present)
      if (pair.request.system) {
        const systemText = extractTextContent(pair.request.system);
        if (systemText.trim()) {
          messages.push({ role: "system", content: systemText });
        }
      }

      // Request messages
      for (const msg of pair.request.messages) {
        const content = extractTextContent(msg.content);
        if (content.trim()) {
          messages.push({ role: mapRole(msg.role), content });
        }
      }

      // Response
      const responseText = extractTextContent(pair.response.content);
      if (responseText.trim()) {
        messages.push({ role: "assistant", content: responseText });
      }
    } else {
      // Response-only — extract assistant message
      const resp = item as AnthropicResponse;
      model = resp.model;
      const text = extractTextContent(resp.content);
      if (text.trim()) {
        messages.push({ role: "assistant", content: text });
      }
    }

    if (messages.length > 0) {
      conversations.push({
        id: (item as any).id ?? (item as any).response?.id,
        messages,
        metadata: {
          source: "anthropic-api",
          ...(model && { model }),
        },
      });
    }
  }

  return conversations;
}

function isRequestResponsePair(item: unknown): item is AnthropicRequestResponsePair {
  return (
    typeof item === "object" &&
    item !== null &&
    "request" in item &&
    "response" in item &&
    typeof (item as any).request === "object" &&
    typeof (item as any).response === "object"
  );
}

/**
 * Detect if raw data looks like an Anthropic API log.
 */
export function isAnthropicAPILog(data: unknown): boolean {
  // Single response: { type: "message", content: [...] }
  if (isAnthropicResponse(data)) return true;

  // Request+response pair
  if (isRequestResponsePair(data)) return true;

  // Array of responses or pairs
  if (Array.isArray(data) && data.length > 0) {
    return isAnthropicResponse(data[0]) || isRequestResponsePair(data[0]);
  }

  return false;
}

function isAnthropicResponse(data: unknown): data is AnthropicResponse {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return obj.type === "message" && Array.isArray(obj.content);
}
