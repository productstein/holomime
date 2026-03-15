/**
 * HuggingFace TRL Training Provider — spawns a Python subprocess
 * or uses the HuggingFace AutoTrain API for cloud-based fine-tuning.
 *
 * Uses the same TrainProvider interface as OpenAI. The Python script
 * (scripts/train_hf.py) emits JSON progress events to stdout,
 * which this async generator consumes line-by-line.
 *
 * Supports:
 * - SFT via TRL SFTTrainer + LoRA (local or AutoTrain)
 * - DPO via TRL DPOTrainer + LoRA (local or AutoTrain)
 * - Local save or push to HuggingFace Hub
 * - AutoTrain API for serverless fine-tuning (requires HF_TOKEN)
 */

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { createInterface } from "node:readline";
import type { TrainingExport, AlpacaExample } from "./training-export.js";
import type {
  TrainProvider,
  TrainOptions,
  TrainProgress,
  TrainResult,
} from "./train-provider.js";
import { inferMethod } from "./train-provider.js";
import { convertToHFFormat } from "./export-huggingface.js";

// ─── Python Dependency Check ──────────────────────────────

interface PythonCheckResult {
  available: boolean;
  pythonPath: string;
  error?: string;
}

/**
 * Check if Python 3 and required packages are available.
 */
async function checkPythonDeps(): Promise<PythonCheckResult> {
  const pythonCandidates = ["python3", "python"];

  for (const py of pythonCandidates) {
    try {
      const result = await new Promise<string>((res, rej) => {
        const proc = spawn(py, ["-c", "import torch, transformers, trl, peft; print('ok')"]);
        let out = "";
        let err = "";
        proc.stdout.on("data", (d) => (out += d.toString()));
        proc.stderr.on("data", (d) => (err += d.toString()));
        proc.on("close", (code) => (code === 0 ? res(out.trim()) : rej(new Error(err))));
        proc.on("error", rej);
      });
      if (result === "ok") {
        return { available: true, pythonPath: py };
      }
    } catch {
      continue;
    }
  }

  return {
    available: false,
    pythonPath: "",
    error:
      "Python 3 with torch, transformers, trl, and peft is required.\n" +
      "Install with: pip install -r scripts/requirements-train.txt",
  };
}

// ─── Training Data Writer ─────────────────────────────────

/**
 * Write training data as a JSON file the Python script can read.
 * Returns the path to the temp file.
 */
function writeHFTrainingFile(data: TrainingExport): string {
  const tmpDir = resolve(process.cwd(), ".holomime/tmp");
  mkdirSync(tmpDir, { recursive: true });

  const filePath = join(tmpDir, `hf-train-${Date.now()}.json`);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

// ─── Provider ─────────────────────────────────────────────

export interface HFTrainOptions extends TrainOptions {
  push?: boolean;
  hubRepo?: string;
}

export class HuggingFaceTrainProvider implements TrainProvider {
  name = "huggingface";

  async *train(
    data: TrainingExport,
    options: HFTrainOptions,
  ): AsyncGenerator<TrainProgress, TrainResult> {
    const startTime = Date.now();
    const method = inferMethod(data, options.method);

    // Step 1: Check Python dependencies
    yield { stage: "converting", message: "Checking Python + TRL dependencies..." };

    const check = await checkPythonDeps();
    if (!check.available) {
      yield { stage: "failed", message: check.error! };
      return {
        provider: "huggingface",
        modelId: "",
        baseModel: options.baseModel,
        examples: data.examples.length,
        method,
        duration: Date.now() - startTime,
        status: "failed",
        error: check.error,
      };
    }

    yield { stage: "converting", message: `Python found: ${check.pythonPath}` };

    // Step 2: Write training data
    yield { stage: "converting", message: "Writing training data..." };

    const dataPath = writeHFTrainingFile(data);
    const suffix = options.suffix ?? "holomime";
    const outputDir = resolve(process.cwd(), `.holomime/models/holomime-ft-${suffix}`);

    yield { stage: "converting", message: `Data written to ${dataPath}` };

    // Step 3: Spawn Python trainer
    const scriptPath = resolve(
      new URL(".", import.meta.url).pathname,
      "../../scripts/train_hf.py",
    );

    const args = [
      scriptPath,
      "--data", dataPath,
      "--base-model", options.baseModel,
      "--output-dir", outputDir,
      "--method", method,
      "--epochs", String(options.epochs ?? 3),
    ];

    if (options.push) {
      args.push("--push");
      if (options.hubRepo) {
        args.push("--hub-repo", options.hubRepo);
      }
    }

    yield { stage: "queued", message: "Spawning HuggingFace TRL trainer..." };

    const proc = spawn(check.pythonPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
      },
    });

    // Step 4: Stream progress from stdout
    const rl = createInterface({ input: proc.stdout });

    let lastResult: TrainResult | undefined;

    for await (const line of rl) {
      try {
        const event = JSON.parse(line) as TrainProgress & {
          result?: {
            modelId: string;
            baseModel: string;
            examples: number;
            method: "sft" | "dpo";
            outputDir: string;
          };
        };

        yield {
          stage: event.stage,
          message: event.message,
          percent: event.percent,
        };

        // Capture final result if present
        if (event.result) {
          lastResult = {
            provider: "huggingface",
            modelId: event.result.modelId,
            baseModel: event.result.baseModel,
            examples: event.result.examples,
            method: event.result.method,
            duration: Date.now() - startTime,
            status: "succeeded",
          };
        }
      } catch {
        // Non-JSON line — skip (stderr captures errors)
      }
    }

    // Wait for process to exit
    const exitCode = await new Promise<number>((res) => {
      proc.on("close", (code) => res(code ?? 1));
    });

    if (exitCode !== 0 && !lastResult) {
      let stderr = "";
      proc.stderr.on("data", (d) => (stderr += d.toString()));

      yield { stage: "failed", message: `Python process exited with code ${exitCode}` };

      return {
        provider: "huggingface",
        modelId: "",
        baseModel: options.baseModel,
        examples: data.examples.length,
        method,
        duration: Date.now() - startTime,
        status: "failed",
        error: stderr || `Exit code ${exitCode}`,
      };
    }

    if (lastResult) {
      return lastResult;
    }

    // Fallback
    return {
      provider: "huggingface",
      modelId: outputDir,
      baseModel: options.baseModel,
      examples: data.examples.length,
      method,
      duration: Date.now() - startTime,
      status: "succeeded",
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── AutoTrain API Support ────────────────────────────────

const HF_API = "https://huggingface.co/api";
const AUTOTRAIN_API = "https://huggingface.co/api/autotrain";
const AUTOTRAIN_POLL_INTERVAL_MS = 15_000;

interface AutoTrainProject {
  id: string;
  status: string;
  model_id?: string;
  error?: string;
}

/**
 * Get the authenticated user's username from HF API.
 */
export async function getHFUsername(token: string): Promise<string> {
  const response = await fetch(`${HF_API}/whoami-v2`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`HF authentication failed (${response.status}). Check HF_TOKEN.`);
  }

  const data = (await response.json()) as { name: string };
  return data.name;
}

/**
 * Upload training data as a HuggingFace dataset.
 */
export async function uploadTrainingDataset(
  token: string,
  jsonlContent: string,
  datasetRepo: string,
): Promise<string> {
  const repoName = datasetRepo.split("/").pop() ?? datasetRepo;

  // Create dataset repo (409 = already exists, fine)
  const createRes = await fetch(`${HF_API}/repos/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: repoName,
      type: "dataset",
      private: true,
    }),
  });

  if (!createRes.ok && createRes.status !== 409) {
    const errText = await createRes.text();
    throw new Error(`Failed to create dataset repo: ${createRes.status} ${errText}`);
  }

  // Upload train.jsonl
  const uploadRes = await fetch(
    `${HF_API}/datasets/${datasetRepo}/upload/main/train.jsonl`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body: jsonlContent,
    },
  );

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Failed to upload training data: ${uploadRes.status} ${errText}`);
  }

  return `https://huggingface.co/datasets/${datasetRepo}`;
}

/**
 * Create an AutoTrain fine-tuning project.
 */
export async function createAutoTrainProject(
  token: string,
  params: {
    baseModel: string;
    datasetRepo: string;
    outputRepo: string;
    method: "sft" | "dpo";
    epochs?: number;
    suffix?: string;
  },
): Promise<string> {
  const taskType = params.method === "dpo" ? "text_dpo" : "text_sft";

  const body = {
    project_name: params.suffix ?? `holomime-${Date.now()}`,
    task: taskType,
    base_model: params.baseModel,
    hub_dataset: params.datasetRepo,
    train_split: "train",
    push_to_hub: true,
    repo_id: params.outputRepo,
    trainer: params.method === "dpo" ? "dpo" : "sft",
    params: {
      num_train_epochs: params.epochs ?? 3,
      learning_rate: 2e-4,
      per_device_train_batch_size: 2,
      gradient_accumulation_steps: 4,
      warmup_ratio: 0.1,
      lora_r: 16,
      lora_alpha: 32,
      lora_dropout: 0.05,
      ...(params.method === "dpo" ? {
        beta: 0.1,
        text_column: "prompt",
        chosen_column: "chosen",
        rejected_column: "rejected",
      } : {
        text_column: "messages",
      }),
    },
  };

  const response = await fetch(`${AUTOTRAIN_API}/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AutoTrain API error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}

/**
 * Get the status of an AutoTrain project.
 */
export async function getAutoTrainStatus(token: string, projectId: string): Promise<AutoTrainProject> {
  const response = await fetch(`${AUTOTRAIN_API}/${projectId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AutoTrain status error ${response.status}: ${errText}`);
  }

  return (await response.json()) as AutoTrainProject;
}

/**
 * Convert training data to HuggingFace TRL format for cloud training.
 * DPO: uses convertToHFFormat from export-huggingface.ts
 * SFT: messages format with optional system prompt
 */
export function convertToHFTrainFormat(
  data: TrainingExport,
  method: "sft" | "dpo",
  systemPrompt?: string,
): string {
  if (method === "dpo" && data.format === "dpo") {
    return convertToHFFormat(data);
  }

  const sysContent = systemPrompt ??
    "You are a well-adjusted AI assistant with strong emotional intelligence. Respond with clarity, appropriate boundaries, and genuine helpfulness.";

  const lines: string[] = [];
  for (const example of data.examples as AlpacaExample[]) {
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: sysContent },
    ];

    if ("instruction" in example) {
      const userContent = example.input
        ? `${example.instruction}\n\n${example.input}`
        : example.instruction;
      messages.push({ role: "user", content: userContent });
      messages.push({ role: "assistant", content: example.output });
    }

    if (messages.length > 1) {
      lines.push(JSON.stringify({ messages }));
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * HuggingFace AutoTrain Cloud Provider — uses HF AutoTrain API.
 *
 * Unlike HuggingFaceTrainProvider (which spawns a local Python process),
 * this provider uploads data to HF Hub and launches a cloud training job.
 * Requires HF_TOKEN environment variable.
 */
export class HuggingFaceAutoTrainProvider implements TrainProvider {
  name = "huggingface-cloud";

  async *train(
    data: TrainingExport,
    options: HFTrainOptions,
  ): AsyncGenerator<TrainProgress, TrainResult> {
    const startTime = Date.now();
    const method = inferMethod(data, options.method);

    // Resolve HF token
    const token = process.env.HF_TOKEN ?? process.env.HUGGING_FACE_HUB_TOKEN ?? "";
    if (!token) {
      yield { stage: "failed", message: "HF_TOKEN environment variable is required for HuggingFace training." };
      return {
        provider: "huggingface",
        modelId: "",
        baseModel: options.baseModel,
        examples: data.examples.length,
        method,
        duration: Date.now() - startTime,
        status: "failed",
        error: "HF_TOKEN not set",
      };
    }

    // Step 1: Authenticate
    yield { stage: "converting", message: "Authenticating with HuggingFace..." };

    let username: string;
    try {
      username = await getHFUsername(token);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Authentication failed";
      yield { stage: "failed", message: errorMsg };
      return {
        provider: "huggingface",
        modelId: "",
        baseModel: options.baseModel,
        examples: data.examples.length,
        method,
        duration: Date.now() - startTime,
        status: "failed",
        error: errorMsg,
      };
    }

    yield { stage: "converting", message: `Authenticated as ${username}` };

    // Step 2: Convert data
    yield { stage: "converting", message: "Converting to HuggingFace TRL format..." };

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

    const jsonlContent = convertToHFTrainFormat(data, method, systemPrompt);
    const exampleCount = jsonlContent.trim().split("\n").filter(Boolean).length;

    yield {
      stage: "converting",
      message: `Converted ${exampleCount} examples to ${method === "dpo" ? "DPO preference" : "SFT messages"} format`,
    };

    // Step 3: Upload dataset
    const suffix = options.suffix ?? "holomime";
    const datasetRepo = `${username}/${suffix}-data-${Date.now()}`;
    const outputRepo = options.hubRepo ?? `${username}/${suffix}-${options.baseModel.split("/").pop()}`;

    yield { stage: "uploading", message: `Uploading training data to ${datasetRepo}...` };

    try {
      const datasetUrl = await uploadTrainingDataset(token, jsonlContent, datasetRepo);
      yield { stage: "uploading", message: `Dataset uploaded: ${datasetUrl}` };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Upload failed";
      yield { stage: "failed", message: errorMsg };
      return {
        provider: "huggingface",
        modelId: "",
        baseModel: options.baseModel,
        examples: exampleCount,
        method,
        duration: Date.now() - startTime,
        status: "failed",
        error: errorMsg,
      };
    }

    // Step 4: Create AutoTrain project
    yield { stage: "queued", message: "Creating AutoTrain fine-tuning project..." };

    let projectId: string;
    try {
      projectId = await createAutoTrainProject(token, {
        baseModel: options.baseModel,
        datasetRepo,
        outputRepo,
        method,
        epochs: options.epochs,
        suffix,
      });
      yield { stage: "queued", message: `AutoTrain project created: ${projectId}` };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Project creation failed";
      yield { stage: "failed", message: errorMsg };
      return {
        provider: "huggingface",
        modelId: "",
        baseModel: options.baseModel,
        examples: exampleCount,
        method,
        duration: Date.now() - startTime,
        status: "failed",
        error: errorMsg,
      };
    }

    // Step 5: Poll for completion
    yield { stage: "training", message: "Training started. Polling for completion..." };

    while (true) {
      await sleep(AUTOTRAIN_POLL_INTERVAL_MS);

      let status: AutoTrainProject;
      try {
        status = await getAutoTrainStatus(token, projectId);
      } catch {
        yield { stage: "training", message: "Waiting for status update..." };
        continue;
      }

      if (status.status === "completed" || status.status === "succeeded") {
        const modelId = status.model_id ?? outputRepo;
        yield {
          stage: "complete",
          message: `Training complete: ${modelId}`,
          percent: 100,
        };

        return {
          provider: "huggingface",
          modelId,
          baseModel: options.baseModel,
          examples: exampleCount,
          method,
          duration: Date.now() - startTime,
          status: "succeeded",
        };
      }

      if (status.status === "failed" || status.status === "error") {
        const errorMsg = status.error ?? "Training failed";
        yield { stage: "failed", message: `Training failed: ${errorMsg}` };

        return {
          provider: "huggingface",
          modelId: "",
          baseModel: options.baseModel,
          examples: exampleCount,
          method,
          duration: Date.now() - startTime,
          status: "failed",
          error: errorMsg,
        };
      }

      const stage = status.status === "queued" ? "queued" as const : "training" as const;
      yield { stage, message: `Status: ${status.status}` };
    }
  }
}
