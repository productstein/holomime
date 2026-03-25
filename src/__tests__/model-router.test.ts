import { describe, it, expect } from "vitest";
import { ModelRouter, DEFAULT_MODEL_CONFIG } from "../core/model-router.js";

describe("model-router", () => {
  it("returns default model for unknown task", () => {
    const router = new ModelRouter();
    const config = router.getModelForTask("unknown-task");
    expect(config.model).toBe(DEFAULT_MODEL_CONFIG.default);
  });

  it("returns task-specific model", () => {
    const router = new ModelRouter();
    const config = router.getModelForTask("therapy-analysis");
    expect(config.model).toBe("claude-3-5-sonnet");
    expect(config.temperature).toBe(0.3);
  });

  it("returns summarization model", () => {
    const router = new ModelRouter();
    const config = router.getModelForTask("summarization");
    expect(config.model).toBe("gpt-4o-mini");
  });

  it("allows runtime override", () => {
    const router = new ModelRouter();
    router.override("therapy-analysis", "claude-3-opus", 0.1);
    const config = router.getModelForTask("therapy-analysis");
    expect(config.model).toBe("claude-3-opus");
    expect(config.temperature).toBe(0.1);
  });

  it("lists all assignments", () => {
    const router = new ModelRouter();
    const assignments = router.listAssignments();
    expect(assignments.length).toBeGreaterThan(0);
    expect(assignments.some((a) => a.task === "therapy-session")).toBe(true);
  });

  it("accepts custom config", () => {
    const router = new ModelRouter({
      default: "gpt-4o",
      tasks: { "custom-task": { model: "llama-3", temperature: 0.5 } },
    });
    expect(router.getModelForTask("custom-task").model).toBe("llama-3");
    expect(router.getModelForTask("therapy-analysis").model).toBe("claude-3-5-sonnet");
  });
});
