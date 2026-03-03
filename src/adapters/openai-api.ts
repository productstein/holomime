/**
 * OpenAI API log format adapter.
 * Handles ChatCompletion response objects (single or array).
 */

import type { Conversation, Message } from "../core/types.js";

interface OpenAIChoice {
  message: { role: string; content: string | null };
}

interface OpenAIResponse {
  id?: string;
  choices: OpenAIChoice[];
  created?: number;
}

function mapRole(role: string): "user" | "assistant" | "system" {
  if (role === "user") return "user";
  if (role === "system") return "system";
  return "assistant";
}

/**
 * Parse OpenAI API response logs.
 * Can handle a single response or an array of responses.
 * Also handles the common pattern of logging request+response pairs.
 */
export function parseOpenAIAPILog(data: OpenAIResponse | OpenAIResponse[]): Conversation[] {
  const responses = Array.isArray(data) ? data : [data];

  // Group into a single conversation with all messages
  const messages: Message[] = [];

  for (const resp of responses) {
    for (const choice of resp.choices) {
      if (!choice.message?.content) continue;

      const message: Message = {
        role: mapRole(choice.message.role),
        content: choice.message.content,
      };
      if (resp.created) {
        message.timestamp = new Date(resp.created * 1000).toISOString();
      }
      messages.push(message);
    }
  }

  return [{ messages }];
}

/**
 * Detect if raw data looks like an OpenAI API log.
 */
export function isOpenAIAPILog(data: unknown): boolean {
  // Single response
  if (typeof data === "object" && data !== null && "choices" in data) {
    return true;
  }

  // Array of responses
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    return typeof first === "object" && first !== null && "choices" in first;
  }

  return false;
}
