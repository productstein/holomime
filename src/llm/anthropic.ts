/**
 * Anthropic Messages API client for holomime therapy sessions.
 * Uses native fetch — no SDK dependency.
 */

import type { LLMProvider, LLMMessage } from "./provider.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

export class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  modelName: string;
  private apiKey: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.modelName = model ?? DEFAULT_MODEL;
  }

  async chat(messages: LLMMessage[]): Promise<string> {
    // Anthropic requires system message as a separate top-level field
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMsgs = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model: this.modelName,
      max_tokens: 4096,
      messages: chatMsgs,
    };
    if (systemMsg) {
      body.system = systemMsg.content;
    }

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${err}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };

    return data.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");
  }

  async *chatStream(messages: LLMMessage[]): AsyncGenerator<string> {
    const systemMsg = messages.find((m) => m.role === "system");
    const chatMsgs = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model: this.modelName,
      max_tokens: 4096,
      stream: true,
      messages: chatMsgs,
    };
    if (systemMsg) {
      body.system = systemMsg.content;
    }

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${err}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield "I need a moment to think about that.";
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") return;

          try {
            const event = JSON.parse(jsonStr) as {
              type: string;
              delta?: { type: string; text: string };
            };

            if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
              yield event.delta.text;
            }
          } catch {
            // skip malformed SSE data
          }
        }
      }
    }
  }
}
