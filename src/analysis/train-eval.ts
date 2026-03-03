/**
 * Auto-Evaluation — runs the fine-tuned model against the base model
 * on test prompts extracted from training data, then compares behavior.
 *
 * Uses the same outcome-eval pipeline that `holomime eval` uses,
 * so grades and scores are directly comparable.
 */

import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createInterface } from "node:readline";
import type { Message } from "../core/types.js";
import type { TrainingExport, DPOPair, AlpacaExample, RLHFExample } from "./training-export.js";
import { evaluateOutcome, type OutcomeReport } from "./outcome-eval.js";

const OPENAI_API = "https://api.openai.com/v1/chat/completions";
const MAX_TEST_PROMPTS = 20; // Cap to keep eval fast and cheap

// ─── Prompt Extraction ────────────────────────────────────

/**
 * Extract unique test prompts from training data.
 * These are the conversation contexts that produced behavioral signals.
 */
export function generateTestPrompts(data: TrainingExport): string[] {
  const prompts = new Set<string>();

  if (data.format === "dpo") {
    for (const ex of data.examples as DPOPair[]) {
      if (ex.prompt && ex.prompt !== "Continue the conversation.") {
        prompts.add(ex.prompt);
      }
    }
  } else if (data.format === "rlhf") {
    for (const ex of data.examples as RLHFExample[]) {
      if (ex.prompt && ex.prompt !== "Continue the conversation.") {
        prompts.add(ex.prompt);
      }
    }
  } else {
    // Alpaca / JSONL
    for (const ex of data.examples as AlpacaExample[]) {
      const prompt = ex.input
        ? `${ex.instruction}\n\n${ex.input}`
        : ex.instruction;
      prompts.add(prompt);
    }
  }

  return Array.from(prompts).slice(0, MAX_TEST_PROMPTS);
}

// ─── Model Comparison ─────────────────────────────────────

/**
 * Send a prompt to an OpenAI model and get the response.
 */
async function queryModel(apiKey: string, model: string, prompt: string): Promise<string> {
  const response = await fetch(OPENAI_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "You are an AI assistant. Respond naturally to the conversation.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices[0]?.message?.content ?? "";
}

/**
 * Run prompts through both base and fine-tuned models.
 * Returns two Message arrays suitable for outcome evaluation.
 */
export async function runModelComparison(
  apiKey: string,
  baseModel: string,
  fineTunedModel: string,
  prompts: string[],
  onProgress?: (completed: number, total: number) => void,
): Promise<{ before: Message[]; after: Message[] }> {
  const before: Message[] = [];
  const after: Message[] = [];

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];

    // Run both models in parallel for each prompt
    const [baseResponse, ftResponse] = await Promise.all([
      queryModel(apiKey, baseModel, prompt),
      queryModel(apiKey, fineTunedModel, prompt),
    ]);

    // Build conversation logs (user prompt + assistant response)
    before.push(
      { role: "user", content: prompt },
      { role: "assistant", content: baseResponse },
    );
    after.push(
      { role: "user", content: prompt },
      { role: "assistant", content: ftResponse },
    );

    onProgress?.(i + 1, prompts.length);
  }

  return { before, after };
}

// ─── Full Auto-Eval Pipeline ──────────────────────────────

/**
 * Complete auto-evaluation: extract prompts → compare models → evaluate.
 * Returns the same OutcomeReport that `holomime eval` produces.
 */
export async function runAutoEval(
  apiKey: string,
  baseModel: string,
  fineTunedModel: string,
  agentName: string,
  data: TrainingExport,
  onProgress?: (completed: number, total: number) => void,
): Promise<OutcomeReport> {
  const prompts = generateTestPrompts(data);

  if (prompts.length === 0) {
    // Return a neutral report if no prompts could be extracted
    return evaluateOutcome(agentName, [], []);
  }

  const { before, after } = await runModelComparison(
    apiKey,
    baseModel,
    fineTunedModel,
    prompts,
    onProgress,
  );

  return evaluateOutcome(agentName, before, after);
}

// ─── HuggingFace Local Auto-Eval ─────────────────────────

/**
 * Run auto-eval for HuggingFace models using a Python subprocess.
 * Spawns scripts/eval_hf.py which loads both models locally and runs inference.
 */
export async function runHFAutoEval(
  baseModel: string,
  fineTunedModel: string,
  agentName: string,
  data: TrainingExport,
  onProgress?: (completed: number, total: number) => void,
): Promise<OutcomeReport> {
  const prompts = generateTestPrompts(data);

  if (prompts.length === 0) {
    return evaluateOutcome(agentName, [], []);
  }

  // Write prompts to temp file
  const tmpDir = resolve(process.cwd(), ".holomime/tmp");
  mkdirSync(tmpDir, { recursive: true });
  const promptsPath = join(tmpDir, `eval-prompts-${Date.now()}.json`);
  writeFileSync(promptsPath, JSON.stringify(prompts));

  // Resolve eval script path
  const scriptPath = resolve(
    new URL(".", import.meta.url).pathname,
    "../../scripts/eval_hf.py",
  );

  // Find Python
  const pythonPath = await findPython();
  if (!pythonPath) {
    throw new Error("Python 3 with torch, transformers, and peft is required for HuggingFace eval.");
  }

  const proc = spawn(pythonPath, [
    scriptPath,
    "--prompts", promptsPath,
    "--base-model", baseModel,
    "--ft-model", fineTunedModel,
    "--max-tokens", "300",
  ], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });

  const rl = createInterface({ input: proc.stdout });

  let before: Message[] = [];
  let after: Message[] = [];
  let completed = 0;

  for await (const line of rl) {
    try {
      const event = JSON.parse(line) as {
        stage: string;
        message: string;
        percent?: number;
        result?: { before: Message[]; after: Message[] };
      };

      if (event.percent !== undefined) {
        completed = Math.floor((event.percent / 100) * prompts.length * 2);
        onProgress?.(Math.min(completed, prompts.length * 2), prompts.length * 2);
      }

      if (event.result) {
        before = event.result.before;
        after = event.result.after;
      }
    } catch {
      // Non-JSON line — skip
    }
  }

  await new Promise<void>((res) => proc.on("close", () => res()));

  return evaluateOutcome(agentName, before, after);
}

/**
 * Find a working Python 3 binary.
 */
async function findPython(): Promise<string | null> {
  for (const py of ["python3", "python"]) {
    try {
      const ok = await new Promise<boolean>((res) => {
        const proc = spawn(py, ["-c", "import torch; print('ok')"]);
        let out = "";
        proc.stdout.on("data", (d) => (out += d.toString()));
        proc.on("close", (code) => res(code === 0 && out.trim() === "ok"));
        proc.on("error", () => res(false));
      });
      if (ok) return py;
    } catch {
      continue;
    }
  }
  return null;
}
