/**
 * OpenAI Fine-Tuning Provider — uses native fetch, no SDK dependency.
 *
 * Supports two training methods:
 * - SFT (Supervised Fine-Tuning): Alpaca/JSONL → chat messages
 * - DPO (Direct Preference Optimization): DPO pairs → preference format
 *
 * Full flow: convert → upload → create job → poll → return model ID
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { TrainingExport, DPOPair, AlpacaExample } from "./training-export.js";
import type {
  TrainProvider,
  TrainOptions,
  TrainProgress,
  TrainResult,
} from "./train-provider.js";
import { inferMethod } from "./train-provider.js";

const OPENAI_API = "https://api.openai.com/v1";
const POLL_INTERVAL_MS = 10_000; // 10 seconds between status checks

// ─── Format Conversion ───────────────────────────────────

/**
 * Convert DPO pairs to OpenAI preference fine-tuning format.
 * Each line: {input, preferred_output, non_preferred_output}
 */
function convertDPOToOpenAI(pairs: DPOPair[]): string[] {
  return pairs.map((pair) =>
    JSON.stringify({
      input: [{ role: "user", content: pair.prompt }],
      preferred_output: [{ role: "assistant", content: pair.chosen }],
      non_preferred_output: [{ role: "assistant", content: pair.rejected }],
    }),
  );
}

/**
 * Convert Alpaca examples to OpenAI chat fine-tuning format.
 * Each line: {messages: [{role, content}]}
 *
 * If a system prompt is provided (from the agent's compiled personality),
 * it's used instead of the generic fallback — so the fine-tuned model
 * learns to behave like this specific agent, not a generic assistant.
 */
function convertAlpacaToOpenAI(examples: AlpacaExample[], systemPrompt?: string): string[] {
  const sysContent = systemPrompt ??
    "You are a well-adjusted AI assistant with strong emotional intelligence. Respond with clarity, appropriate boundaries, and genuine helpfulness.";

  return examples.map((ex) => {
    const userContent = ex.input
      ? `${ex.instruction}\n\n${ex.input}`
      : ex.instruction;

    return JSON.stringify({
      messages: [
        { role: "system", content: sysContent },
        { role: "user", content: userContent },
        { role: "assistant", content: ex.output },
      ],
    });
  });
}

/**
 * Convert exported training data to OpenAI JSONL format.
 * Returns array of JSON strings (one per line).
 *
 * @param systemPrompt - Optional compiled system prompt from .personality.json.
 *   When provided, SFT training data includes the agent's real personality
 *   instead of a generic system message.
 */
export function convertToOpenAIFormat(data: TrainingExport, method: "sft" | "dpo", systemPrompt?: string): string[] {
  if (method === "dpo" && data.format === "dpo") {
    return convertDPOToOpenAI(data.examples as DPOPair[]);
  }
  // SFT: convert Alpaca/RLHF/JSONL to chat format
  return convertAlpacaToOpenAI(data.examples as AlpacaExample[], systemPrompt);
}

// ─── OpenAI API Calls ─────────────────────────────────────

interface OpenAIFileResponse {
  id: string;
  object: string;
  bytes: number;
  filename: string;
  purpose: string;
}

/**
 * Upload a JSONL training file to OpenAI Files API.
 */
export async function uploadTrainingFile(
  apiKey: string,
  jsonlContent: string,
  filename: string,
): Promise<string> {
  const blob = new Blob([jsonlContent], { type: "application/jsonl" });

  const formData = new FormData();
  formData.append("purpose", "fine-tune");
  formData.append("file", blob, filename);

  const response = await fetch(`${OPENAI_API}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI Files API error ${response.status}: ${err}`);
  }

  const data = (await response.json()) as OpenAIFileResponse;
  return data.id;
}

interface OpenAIJobResponse {
  id: string;
  object: string;
  model: string;
  status: string;
  fine_tuned_model: string | null;
  training_file: string;
  hyperparameters: { n_epochs: number | string };
  created_at: number;
  finished_at: number | null;
  trained_tokens: number | null;
  error?: { code: string; message: string };
}

/**
 * Create a fine-tuning job.
 */
export async function createFineTuningJob(
  apiKey: string,
  fileId: string,
  baseModel: string,
  options: { suffix?: string; epochs?: number; method: "sft" | "dpo" },
): Promise<string> {
  const body: Record<string, unknown> = {
    training_file: fileId,
    model: baseModel,
    method: {
      type: options.method === "dpo" ? "dpo" : "supervised",
    },
  };

  if (options.suffix) {
    body.suffix = options.suffix;
  }

  if (options.epochs) {
    body.hyperparameters = { n_epochs: options.epochs };
  }

  const response = await fetch(`${OPENAI_API}/fine_tuning/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI Fine-Tuning API error ${response.status}: ${err}`);
  }

  const data = (await response.json()) as OpenAIJobResponse;
  return data.id;
}

/**
 * Get the current status of a fine-tuning job.
 */
async function getJobStatus(apiKey: string, jobId: string): Promise<OpenAIJobResponse> {
  const response = await fetch(`${OPENAI_API}/fine_tuning/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
  }

  return (await response.json()) as OpenAIJobResponse;
}

interface OpenAIJobEvent {
  object: string;
  data: Array<{
    id: string;
    object: string;
    created_at: number;
    level: string;
    message: string;
    type: string;
  }>;
}

/**
 * Get recent events for a fine-tuning job.
 */
async function getJobEvents(
  apiKey: string,
  jobId: string,
  limit = 5,
): Promise<OpenAIJobEvent["data"]> {
  const response = await fetch(
    `${OPENAI_API}/fine_tuning/jobs/${jobId}/events?limit=${limit}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );

  if (!response.ok) return [];

  const data = (await response.json()) as OpenAIJobEvent;
  return data.data ?? [];
}

// ─── Training Provider ────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OpenAITrainProvider implements TrainProvider {
  name = "openai";

  async *train(
    data: TrainingExport,
    options: TrainOptions,
  ): AsyncGenerator<TrainProgress, TrainResult> {
    const startTime = Date.now();
    const method = inferMethod(data, options.method);

    // Step 1: Convert data (use compiled personality as system prompt when available)
    yield { stage: "converting", message: "Converting to OpenAI format..." };

    let systemPrompt: string | undefined;
    if (options.personalityPath) {
      const fullPath = resolve(process.cwd(), options.personalityPath);
      if (existsSync(fullPath)) {
        try {
          const spec = JSON.parse(readFileSync(fullPath, "utf-8"));
          const name = spec.name ?? "Agent";
          const purpose = spec.purpose ?? "";
          const parts = [`You are ${name}.`];
          if (purpose) parts.push(purpose);
          parts.push("Respond with clarity, appropriate boundaries, and genuine helpfulness.");
          systemPrompt = parts.join(" ");
        } catch {
          // Fall back to generic system prompt
        }
      }
    }

    const lines = convertToOpenAIFormat(data, method, systemPrompt);
    const jsonlContent = lines.join("\n") + "\n";
    const filename = `holomime-${data.format}-${Date.now()}.jsonl`;

    yield {
      stage: "converting",
      message: `Converted ${lines.length} examples to ${method === "dpo" ? "preference" : "chat"} format`,
    };

    // Step 2: Upload file
    yield { stage: "uploading", message: "Uploading training file to OpenAI..." };

    const fileId = await uploadTrainingFile(options.apiKey, jsonlContent, filename);

    yield { stage: "uploading", message: `File uploaded: ${fileId}` };

    // Step 3: Create job
    yield { stage: "queued", message: "Creating fine-tuning job..." };

    const jobId = await createFineTuningJob(options.apiKey, fileId, options.baseModel, {
      suffix: options.suffix,
      epochs: options.epochs,
      method,
    });

    yield { stage: "queued", message: `Job created: ${jobId}` };

    // Step 4: Poll until complete
    let lastEventId = "";

    while (true) {
      await sleep(POLL_INTERVAL_MS);

      const status = await getJobStatus(options.apiKey, jobId);

      // Check for new events to show progress
      const events = await getJobEvents(options.apiKey, jobId);
      const newEvents = events.filter((e) => e.id !== lastEventId);
      if (newEvents.length > 0) {
        lastEventId = newEvents[0].id;
      }

      const latestMessage = newEvents[0]?.message ?? `Status: ${status.status}`;

      if (status.status === "succeeded" && status.fine_tuned_model) {
        yield {
          stage: "complete",
          message: `Training complete: ${status.fine_tuned_model}`,
          percent: 100,
        };

        return {
          provider: "openai",
          modelId: status.fine_tuned_model,
          baseModel: options.baseModel,
          examples: lines.length,
          method,
          duration: Date.now() - startTime,
          status: "succeeded",
        };
      }

      if (status.status === "failed") {
        const errorMsg = status.error?.message ?? "Unknown error";
        yield { stage: "failed", message: `Training failed: ${errorMsg}` };

        return {
          provider: "openai",
          modelId: "",
          baseModel: options.baseModel,
          examples: lines.length,
          method,
          duration: Date.now() - startTime,
          status: "failed",
          error: errorMsg,
        };
      }

      if (status.status === "cancelled") {
        yield { stage: "failed", message: "Training job was cancelled" };

        return {
          provider: "openai",
          modelId: "",
          baseModel: options.baseModel,
          examples: lines.length,
          method,
          duration: Date.now() - startTime,
          status: "failed",
          error: "Job cancelled",
        };
      }

      // Still running
      const stage = status.status === "queued" ? "queued" as const : "training" as const;
      yield { stage, message: latestMessage };
    }
  }
}
