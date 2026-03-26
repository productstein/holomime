/**
 * Unified LLM provider interface for holomime.
 * All providers (Ollama, Anthropic, OpenAI) implement this.
 */

import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMProvider {
  name: string;
  modelName: string;
  chat(messages: LLMMessage[]): Promise<string>;
  chatStream?(messages: LLMMessage[]): AsyncGenerator<string>;
}

export interface ProviderConfig {
  provider: "ollama" | "anthropic" | "openai";
  model?: string;
  apiKey?: string;
}

export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.provider) {
    case "ollama":
      // Use OllamaProvider directly — it requires model discovery via getOllamaModels()
      throw new Error("Use OllamaProvider directly for Ollama (requires model discovery first)");
    case "anthropic": {
      if (!config.apiKey) throw new Error("ANTHROPIC_API_KEY is required");
      return new AnthropicProvider(config.apiKey, config.model);
    }
    case "openai": {
      if (!config.apiKey) throw new Error("OPENAI_API_KEY is required");
      return new OpenAIProvider(config.apiKey, config.model);
    }
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
