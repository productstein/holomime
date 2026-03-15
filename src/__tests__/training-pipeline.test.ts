import { describe, it, expect } from "vitest";
import type { PipelineStage, PipelineProgress, PipelineCallbacks } from "../analysis/training-pipeline.js";

/**
 * Training Pipeline tests — unit tests for pipeline types and orchestration logic.
 *
 * Note: Full integration tests (which spawn actual training jobs) are not run here.
 * These tests validate the type contracts and callback interfaces.
 */

describe("training-pipeline", () => {
  describe("PipelineStage type", () => {
    it("includes all expected stages", () => {
      const validStages: PipelineStage[] = [
        "diagnose",
        "evolve",
        "export",
        "train",
        "verify",
        "report",
        "complete",
        "failed",
      ];

      // Type-check: all of these should compile
      expect(validStages).toHaveLength(8);
    });
  });

  describe("PipelineProgress interface", () => {
    it("constructs valid progress objects", () => {
      const progress: PipelineProgress = {
        stage: "diagnose",
        message: "Analyzing patterns...",
        stageIndex: 0,
        totalStages: 5,
        percent: 25,
      };

      expect(progress.stage).toBe("diagnose");
      expect(progress.message).toBe("Analyzing patterns...");
      expect(progress.stageIndex).toBe(0);
      expect(progress.totalStages).toBe(5);
      expect(progress.percent).toBe(25);
    });

    it("allows optional percent", () => {
      const progress: PipelineProgress = {
        stage: "train",
        message: "Starting training...",
        stageIndex: 2,
        totalStages: 5,
      };

      expect(progress.percent).toBeUndefined();
    });
  });

  describe("PipelineCallbacks interface", () => {
    it("all callbacks are optional", () => {
      const callbacks: PipelineCallbacks = {};
      expect(callbacks.onProgress).toBeUndefined();
      expect(callbacks.onStageStart).toBeUndefined();
      expect(callbacks.onStageEnd).toBeUndefined();
      expect(callbacks.onError).toBeUndefined();
    });

    it("accepts callbacks that track stage progression", () => {
      const stages: string[] = [];

      const callbacks: PipelineCallbacks = {
        onStageStart: (stage) => {
          stages.push(`start:${stage}`);
        },
        onStageEnd: (stage, success) => {
          stages.push(`end:${stage}:${success}`);
        },
        onProgress: (progress) => {
          stages.push(`progress:${progress.stage}`);
        },
        onError: (stage, error) => {
          stages.push(`error:${stage}:${error}`);
        },
      };

      // Simulate pipeline execution
      callbacks.onStageStart!("diagnose", 0, 5);
      callbacks.onProgress!({ stage: "diagnose", message: "...", stageIndex: 0, totalStages: 5 });
      callbacks.onStageEnd!("diagnose", true, "3 patterns");

      callbacks.onStageStart!("export", 1, 5);
      callbacks.onStageEnd!("export", true, "25 examples");

      callbacks.onStageStart!("train", 2, 5);
      callbacks.onError!("train", "API timeout");

      expect(stages).toEqual([
        "start:diagnose",
        "progress:diagnose",
        "end:diagnose:true",
        "start:export",
        "end:export:true",
        "start:train",
        "error:train:API timeout",
      ]);
    });
  });
});
