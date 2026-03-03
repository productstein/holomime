/**
 * Training Provider Interface — abstraction layer for ML fine-tuning.
 *
 * OpenAI ships first. HuggingFace TRL plugs in later via the same interface.
 */

import type { TrainingExport } from "./training-export.js";

// ─── Training Options ─────────────────────────────────────

export interface TrainOptions {
  baseModel: string;        // e.g. "gpt-4o-mini"
  suffix?: string;          // Model name suffix (default: agent name)
  epochs?: number;          // Training epochs (default: auto)
  method: "auto" | "sft" | "dpo";
  personalityPath: string;
  apiKey: string;
}

// ─── Progress Reporting ───────────────────────────────────

export type TrainStage =
  | "converting"
  | "uploading"
  | "queued"
  | "training"
  | "deploying"
  | "evaluating"
  | "complete"
  | "failed";

export interface TrainProgress {
  stage: TrainStage;
  message: string;
  percent?: number;         // 0-100 when available
}

// ─── Results ──────────────────────────────────────────────

export interface TrainResult {
  provider: string;         // "openai" | "huggingface"
  modelId: string;          // "ft:gpt-4o-mini:org::id" or "user/model-name"
  baseModel: string;
  examples: number;
  method: "sft" | "dpo";
  duration: number;         // ms
  status: "succeeded" | "failed";
  error?: string;
}

export interface DeployResult {
  modelId: string;
  personalityPath: string;
  updatedAt: string;
}

// ─── Provider Interface ───────────────────────────────────

export interface TrainProvider {
  name: string;
  train(data: TrainingExport, options: TrainOptions): AsyncGenerator<TrainProgress, TrainResult>;
}

// ─── Helpers ──────────────────────────────────────────────

/**
 * Infer the best training method from the export format.
 */
export function inferMethod(data: TrainingExport, preferred: "auto" | "sft" | "dpo"): "sft" | "dpo" {
  if (preferred !== "auto") return preferred;
  return data.format === "dpo" ? "dpo" : "sft";
}
