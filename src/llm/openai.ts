/**
 * OpenAI Chat Completions API client for HoloMime therapy sessions.
 * Uses native fetch — no SDK dependency.
 */

import type { LLMProvider, LLMMessage } from "./provider.js";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o";
const MAX_RETRIES = 5;

function parseRetryAfter(response: Response): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = parseInt(header, 10);
    if (!isNaN(seconds)) return seconds * 1000;
  }
  return 0;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OpenAIProvider implements LLMProvider {
  name = "openai";
  modelName: string;
  private apiKey: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.modelName = model ?? DEFAULT_MODEL;
  }

  private async fetchWithRetry(body: Record<string, unknown>): Promise<Response> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (response.status === 429 && attempt < MAX_RETRIES) {
        const retryMs = parseRetryAfter(response) || (2 ** attempt * 5000);
        await delay(retryMs);
        continue;
      }

      return response;
    }

    throw new Error("OpenAI API: max retries exceeded (429 rate limit)");
  }

  async chat(messages: LLMMessage[]): Promise<string> {
    const response = await this.fetchWithRetry({
      model: this.modelName,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${err}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    return data.choices[0]?.message?.content ?? "";
  }

  async *chatStream(messages: LLMMessage[]): AsyncGenerator<string> {
    const response = await this.fetchWithRetry({
      model: this.modelName,
      stream: true,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${err}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield "";
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
              choices: Array<{ delta: { content?: string } }>;
            };

            const content = event.choices[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch {
            // skip malformed SSE data
          }
        }
      }
    }
  }
}
