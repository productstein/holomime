/**
 * Ollama local LLM client for therapy sessions and analysis.
 */

import type { LLMProvider, LLMMessage } from "./provider.js";

export interface OllamaMessage {
  role: string;
  content: string;
}

export interface OllamaModel {
  name: string;
}

/**
 * Ollama provider implementing the unified LLMProvider interface.
 */
export class OllamaProvider implements LLMProvider {
  name = "ollama";
  modelName: string;

  constructor(model: string) {
    this.modelName = model;
  }

  async chat(messages: LLMMessage[]): Promise<string> {
    return ollamaChat(this.modelName, messages);
  }

  async *chatStream(messages: LLMMessage[]): AsyncGenerator<string> {
    yield* ollamaChatStream(this.modelName, messages);
  }
}

/**
 * Check if Ollama is running and return available models.
 */
export async function getOllamaModels(): Promise<OllamaModel[]> {
  const response = await fetch("http://localhost:11434/api/tags");
  if (!response.ok) throw new Error("Ollama not responding");

  const data = (await response.json()) as { models?: OllamaModel[] };
  return data.models ?? [];
}

/**
 * Send a chat request to Ollama.
 */
export async function ollamaChat(
  model: string,
  messages: OllamaMessage[],
): Promise<string> {
  const response = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false }),
  });

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}`);
  }

  const data = (await response.json()) as { message?: { content: string } };
  return data.message?.content ?? "I need a moment to think about that.";
}

/**
 * Stream a chat response from Ollama, yielding chunks.
 */
export async function* ollamaChatStream(
  model: string,
  messages: OllamaMessage[],
): AsyncGenerator<string> {
  const response = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}`);
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
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as { message?: { content: string }; done?: boolean };
        if (parsed.message?.content) {
          yield parsed.message.content;
        }
      } catch {
        // skip malformed lines
      }
    }
  }
}
