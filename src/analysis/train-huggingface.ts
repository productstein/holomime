/**
 * HuggingFace TRL Training Provider — spawns a Python subprocess.
 *
 * Uses the same TrainProvider interface as OpenAI. The Python script
 * (scripts/train_hf.py) emits JSON progress events to stdout,
 * which this async generator consumes line-by-line.
 *
 * Supports:
 * - SFT via TRL SFTTrainer + LoRA
 * - DPO via TRL DPOTrainer + LoRA
 * - Local save or push to HuggingFace Hub
 */

import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createInterface } from "node:readline";
import type { TrainingExport } from "./training-export.js";
import type {
  TrainProvider,
  TrainOptions,
  TrainProgress,
  TrainResult,
} from "./train-provider.js";
import { inferMethod } from "./train-provider.js";

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
