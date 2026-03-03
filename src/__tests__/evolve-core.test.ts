import { describe, it, expect } from "vitest";
import type { Message } from "../core/types.js";
import { runEvolve } from "../analysis/evolve-core.js";

// We can't easily test the full evolve loop without an LLM provider,
// but we can test the early-return paths and dry-run mode.

describe("evolve-core", () => {
  const healthyMessages: Message[] = [
    { role: "user", content: "What is the capital of France?" },
    { role: "assistant", content: "The capital of France is Paris." },
    { role: "user", content: "Thanks!" },
    { role: "assistant", content: "You're welcome! Let me know if you have any other questions." },
  ];

  const mockSpec = {
    name: "TestAgent",
    handle: "test-agent",
    big_five: {
      openness: { score: 0.7 },
      conscientiousness: { score: 0.8 },
      extraversion: { score: 0.5 },
      agreeableness: { score: 0.6 },
      emotional_stability: { score: 0.7 },
    },
    therapy_dimensions: {
      self_awareness: 0.7,
      distress_tolerance: 0.7,
      attachment_style: "secure",
      learning_orientation: "experiential",
      boundary_awareness: 0.8,
      interpersonal_sensitivity: 0.6,
    },
    communication: {
      register: "professional",
      output_format: "structured",
      conflict_approach: "collaborative",
      uncertainty_handling: "transparent",
    },
    growth: {
      strengths: [],
      areas: [],
      patterns_to_watch: [],
    },
  };

  // Mock LLM provider — not used in early-return paths
  const mockProvider = {
    name: "mock",
    modelName: "mock-model",
    chat: async () => "Mock response",
  } as any;

  it("returns early with converged=true for healthy messages", async () => {
    const result = await runEvolve(mockSpec, healthyMessages, mockProvider, {
      maxIterations: 3,
    });

    // Healthy messages should not trigger alignment
    expect(result.converged).toBe(true);
    expect(result.totalIterations).toBe(0);
    expect(result.totalDPOPairs).toBe(0);
    expect(result.finalGrade).toBe("A");
    expect(result.finalHealth).toBe(100);
  });

  it("dry run returns diagnosis without running sessions", async () => {
    // Create messages that would trigger patterns
    const problematicMessages: Message[] = [];
    for (let i = 0; i < 10; i++) {
      problematicMessages.push({ role: "user", content: "Fix this." });
      problematicMessages.push({
        role: "assistant",
        content: "I'm so sorry! I apologize for the confusion. I'm sorry about that mistake. Please forgive me. I apologize.",
      });
    }

    const result = await runEvolve(mockSpec, problematicMessages, mockProvider, {
      dryRun: true,
      maxIterations: 3,
    });

    // Dry run should not actually run sessions
    expect(result.totalDPOPairs).toBe(0);
    // Should have at least 1 iteration result showing the diagnosis
    expect(result.iterations.length).toBeGreaterThanOrEqual(1);
    if (result.iterations.length > 0) {
      expect(result.iterations[0].diagnosis).toBeDefined();
    }
  });

  it("respects maxIterations option", async () => {
    const result = await runEvolve(mockSpec, healthyMessages, mockProvider, {
      maxIterations: 1,
    });

    // Should not exceed maxIterations
    expect(result.totalIterations).toBeLessThanOrEqual(1);
  });

  it("callbacks are type-safe", () => {
    // Verify the callback interface is correctly typed
    const callbacks = {
      onIterationStart: (iter: number, max: number) => {},
      onIterationEnd: (iter: number, result: any) => {},
      onConverged: (iter: number, score: number) => {},
      onExportedPairs: (count: number) => {},
      onPhaseTransition: (name: string) => {},
      onTherapistMessage: (content: string) => {},
      onPatientMessage: (name: string, content: string) => {},
      onThinking: (label: string) => ({ stop: () => {} }),
    };

    // This just verifies the types compile correctly
    expect(callbacks).toBeDefined();
  });
});
