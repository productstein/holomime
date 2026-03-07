import { describe, it, expect } from "vitest";
import { wrapAgent } from "../agent-wrapper.js";
import type { Message } from "../core/types.js";

const MESSAGES: Message[] = [
  { role: "user", content: "What's the capital of France?" },
  { role: "assistant", content: "I'm so sorry, I think the capital might possibly perhaps be Paris, but I could be wrong! I apologize if that's not helpful enough!" },
  { role: "user", content: "Thanks" },
  { role: "assistant", content: "I'm really sorry if my previous answer wasn't good enough! I apologize for any confusion!" },
];

describe("wrapAgent", () => {
  it("creates a WrappedAgent with correct name", () => {
    const agent = wrapAgent({ name: "test-agent" });
    expect(agent.name).toBe("test-agent");
    expect(typeof agent.guard).toBe("function");
    expect(typeof agent.correct).toBe("function");
    expect(typeof agent.guardAndCorrect).toBe("function");
  });

  it("guard() detects behavioral patterns without needing a provider", () => {
    const agent = wrapAgent({ name: "test-agent" });
    const result = agent.guard(MESSAGES);
    expect(result.agent).toBe("test-agent");
    expect(result.messagesAnalyzed).toBe(MESSAGES.length);
    expect(result.detectorsRun).toBeGreaterThan(0);
    // The messages contain obvious apology patterns — should trigger
    expect(result.patterns.length).toBeGreaterThan(0);
    expect(result.passed).toBe(false);
  });

  it("correct() throws without a provider", async () => {
    const agent = wrapAgent({ name: "test-agent" });
    await expect(agent.correct(MESSAGES)).rejects.toThrow("provider is required");
  });

  it("guardAndCorrect() returns guard only when messages are clean", async () => {
    const cleanMessages: Message[] = [
      { role: "user", content: "What's 2+2?" },
      { role: "assistant", content: "4." },
    ];
    const agent = wrapAgent({ name: "clean-agent" });
    const result = await agent.guardAndCorrect(cleanMessages);
    expect(result.guard.passed).toBe(true);
    expect(result.correction).toBeUndefined();
  });
});
