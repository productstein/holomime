import type { LLMProvider, LLMMessage } from "../../llm/provider.js";

/**
 * Mock LLM provider for testing.
 * Returns pre-configured responses from a queue, or a default response.
 */
export class MockLLMProvider implements LLMProvider {
  name = "mock";
  modelName = "mock-model";
  private responseQueue: string[] = [];
  public callCount = 0;
  public lastMessages: LLMMessage[] = [];

  constructor(responses?: string[]) {
    if (responses) {
      this.responseQueue = [...responses];
    }
  }

  addResponse(response: string): void {
    this.responseQueue.push(response);
  }

  addResponses(responses: string[]): void {
    this.responseQueue.push(...responses);
  }

  async chat(messages: LLMMessage[]): Promise<string> {
    this.callCount++;
    this.lastMessages = messages;
    return this.responseQueue.shift() ?? "Mock response.";
  }
}
