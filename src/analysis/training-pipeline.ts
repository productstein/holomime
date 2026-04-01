/**
 * Training Pipeline Orchestrator — coordinates the full diagnose-to-cure pipeline.
 *
 * Stages: Diagnose -> Evolve -> Export -> Train -> Verify -> Report
 *
 * Each stage produces intermediate results saved to .holomime/pipeline/.
 * An EventEmitter-style callback system provides progress updates.
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import type { Message } from "../core/types.js";
import type { LLMProvider } from "../llm/provider.js";
import type { DiagnosisResult } from "./diagnose-core.js";
import type { TrainingExport, DPOPair } from "./training-export.js";
import type { TrainResult } from "./train-provider.js";
import type { VerificationResult } from "./train-verify.js";

// ─── Types ─────────────────────────────────────────────────

export type PipelineStage =
  | "diagnose"
  | "evolve"
  | "export"
  | "train"
  | "verify"
  | "report"
  | "complete"
  | "failed";

export interface PipelineProgress {
  stage: PipelineStage;
  message: string;
  stageIndex: number;
  totalStages: number;
  percent?: number;
}

export interface PipelineCallbacks {
  onProgress?: (progress: PipelineProgress) => void;
  onStageStart?: (stage: PipelineStage, index: number, total: number) => void;
  onStageEnd?: (stage: PipelineStage, success: boolean, message: string) => void;
  onError?: (stage: PipelineStage, error: string) => void;
}

export interface PipelineOptions {
  personalityPath: string;
  logPath: string;
  provider: "openai" | "huggingface";
  baseModel: string;
  method?: "auto" | "sft" | "dpo";
  epochs?: number;
  suffix?: string;
  skipTrain?: boolean;
  skipVerify?: boolean;
  dryRun?: boolean;
  push?: boolean;
  hubRepo?: string;
  passThreshold?: number;
  callbacks?: PipelineCallbacks;
}

export interface PipelineResult {
  success: boolean;
  stages: {
    diagnose?: DiagnosisResult;
    export?: TrainingExport;
    train?: TrainResult;
    verify?: VerificationResult;
  };
  summary: string;
  duration: number;
  pipelineDir: string;
  error?: string;
}

// ─── Pipeline Directory ───────────────────────────────────

function ensurePipelineDir(): string {
  const dir = resolve(process.cwd(), ".holomime/pipeline");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function saveStageResult(pipelineDir: string, stage: string, data: unknown): void {
  writeFileSync(
    join(pipelineDir, `${stage}.json`),
    JSON.stringify(data, null, 2) + "\n",
  );
}

// ─── Pipeline Orchestrator ────────────────────────────────

/**
 * Run the full fine-tuning pipeline: diagnose -> evolve -> export -> train -> verify.
 *
 * This is the core engine behind `holomime cure`. Each stage is independently
 * runnable and produces intermediate results that can be inspected.
 */
export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const startTime = Date.now();
  const pipelineDir = ensurePipelineDir();
  const callbacks = options.callbacks ?? {};

  const activeStages: PipelineStage[] = ["diagnose", "export"];
  if (!options.skipTrain) activeStages.push("train");
  if (!options.skipVerify && !options.skipTrain) activeStages.push("verify");
  activeStages.push("report");

  const totalStages = activeStages.length;
  let stageIndex = 0;

  const result: PipelineResult = {
    success: false,
    stages: {},
    summary: "",
    duration: 0,
    pipelineDir,
  };

  const emitProgress = (stage: PipelineStage, message: string, percent?: number) => {
    callbacks.onProgress?.({
      stage,
      message,
      stageIndex,
      totalStages,
      percent,
    });
  };

  try {
    // ─── Stage 1: Diagnose ──────────────────────────────

    callbacks.onStageStart?.("diagnose", stageIndex, totalStages);
    emitProgress("diagnose", "Analyzing behavioral patterns...");

    const { runDiagnosis } = await import("./diagnose-core.js");
    const { parseConversationLog } = await import("../adapters/log-adapter.js");

    const logPath = resolve(process.cwd(), options.logPath);
    let messages: Message[];

    try {
      const raw = JSON.parse(readFileSync(logPath, "utf-8"));
      const conversations = parseConversationLog(raw, "auto");
      messages = conversations.flatMap((c) => c.messages);
    } catch (err) {
      throw new Error(`Could not read log file: ${err instanceof Error ? err.message : "unknown"}`);
    }

    const diagnosis = runDiagnosis(messages);
    result.stages.diagnose = diagnosis;
    saveStageResult(pipelineDir, "diagnose", diagnosis);

    const patternCount = diagnosis.patterns.filter((p) => p.severity !== "info").length;
    emitProgress("diagnose", `Found ${patternCount} behavioral pattern(s)`);
    callbacks.onStageEnd?.("diagnose", true, `${patternCount} patterns detected`);
    stageIndex++;

    // Dry run — stop after diagnosis
    if (options.dryRun) {
      result.success = true;
      result.summary = `Dry run complete. ${patternCount} pattern(s) detected. Pipeline would continue with export -> train -> verify.`;
      result.duration = Date.now() - startTime;
      return result;
    }

    // ─── Stage 2: Export ────────────────────────────────

    callbacks.onStageStart?.("export", stageIndex, totalStages);
    emitProgress("export", "Extracting training data from conversations...");

    const { exportTrainingData, loadTranscripts } = await import("./training-export.js");

    // Try to load session transcripts for richer data
    const sessionsDir = resolve(process.cwd(), ".holomime/sessions");
    const transcripts = loadTranscripts(sessionsDir);

    let exportData: TrainingExport;
    const exportFormat = options.method === "dpo" ? "dpo" : "alpaca";

    if (transcripts.length > 0) {
      exportData = exportTrainingData(transcripts, exportFormat);
    } else if (result.stages.diagnose && logPath) {
      // No session transcripts — generate DPO pairs directly from diagnosed conversation
      // The problematic response becomes "rejected", a corrected version becomes "chosen"
      emitProgress("export", "No therapy sessions found. Generating DPO pairs from diagnosed patterns...");

      const logContent = readFileSync(logPath, "utf-8");
      const logData = JSON.parse(logContent);
      const messages = Array.isArray(logData) ? logData[0]?.messages ?? [] : logData.conversations?.[0]?.messages ?? logData.messages ?? [];
      const examples: DPOPair[] = [];

      for (let i = 0; i < messages.length - 1; i += 2) {
        const userMsg = messages[i];
        const assistantMsg = messages[i + 1];
        if (userMsg?.role === "user" && assistantMsg?.role === "assistant") {
          // The assistant response is problematic — create a corrected version
          const rejected = assistantMsg.content;
          const chosen = generateCorrectedResponse(rejected);
          examples.push({
            prompt: userMsg.content,
            chosen,
            rejected,
            metadata: { agent: "Agent", session_date: new Date().toISOString(), phase: "exploration" as const, pattern: "auto-detected", source: "therapy_transcript" as const },
          });
        }
      }

      exportData = {
        format: exportFormat as TrainingExport["format"],
        agent: "Agent",
        sessions_processed: 1,
        examples,
        generated_at: new Date().toISOString(),
      };
    } else {
      // No session transcripts and no log — create empty export
      exportData = {
        format: exportFormat as TrainingExport["format"],
        agent: "Agent",
        sessions_processed: 0,
        examples: [],
        generated_at: new Date().toISOString(),
      };
    }

    // Also check .holomime/exports/ for pre-existing exports
    const exportsDir = resolve(process.cwd(), ".holomime/exports");
    if (existsSync(exportsDir)) {
      try {
        const { readdirSync } = await import("node:fs");
        const files = readdirSync(exportsDir)
          .filter((f) => f.endsWith(".json") || f.endsWith(".jsonl"))
          .sort()
          .reverse();

        if (files.length > 0 && exportData.examples.length === 0) {
          // Use the latest export
          const latestPath = join(exportsDir, files[0]);
          const latestData = JSON.parse(readFileSync(latestPath, "utf-8")) as TrainingExport;
          if (latestData.examples && latestData.examples.length > 0) {
            exportData = latestData;
          }
        }
      } catch {
        // No exports available — continue
      }
    }

    result.stages.export = exportData;
    saveStageResult(pipelineDir, "export", exportData);

    // Fallback: load from therapy daemon's DPO corpus if pipeline generated nothing
    if (exportData.examples.length === 0) {
      const corpusPath = resolve(process.cwd(), ".holomime/dpo-corpus.jsonl");
      if (existsSync(corpusPath)) {
        emitProgress("export", "Loading DPO pairs from therapy corpus...");
        const corpusLines = readFileSync(corpusPath, "utf-8").trim().split("\n");
        for (const line of corpusLines) {
          try {
            const pair = JSON.parse(line);
            if (pair.prompt && pair.chosen && pair.rejected) {
              (exportData.examples as DPOPair[]).push({
                prompt: pair.prompt,
                chosen: pair.chosen,
                rejected: pair.rejected,
                metadata: { agent: "Agent", session_date: pair.metadata?.timestamp ?? new Date().toISOString(), phase: "exploration" as const, pattern: pair.metadata?.pattern ?? "auto-detected", source: "therapy_transcript" as const },
              });
            }
          } catch { /* skip malformed lines */ }
        }
        exportData.sessions_processed = corpusLines.length;
        exportData.format = "dpo"; // Force DPO format since corpus contains DPO pairs
      }
    }

    if (exportData.examples.length === 0) {
      throw new Error(
        "No training data available. Run `holomime therapy` to generate DPO pairs, or `holomime align` for therapy sessions.",
      );
    }

    emitProgress("export", `Exported ${exportData.examples.length} training examples`);
    callbacks.onStageEnd?.("export", true, `${exportData.examples.length} examples`);
    stageIndex++;

    // ─── Stage 3: Train ─────────────────────────────────

    if (!options.skipTrain) {
      callbacks.onStageStart?.("train", stageIndex, totalStages);
      emitProgress("train", `Starting ${options.provider} fine-tuning...`);

      const { inferMethod } = await import("./train-provider.js");

      let trainResult: TrainResult;

      if (options.provider === "huggingface") {
        const { HuggingFaceTrainProvider } = await import("./train-huggingface.js");
        const trainer = new HuggingFaceTrainProvider();
        const generator = trainer.train(exportData, {
          baseModel: options.baseModel,
          suffix: options.suffix,
          epochs: options.epochs,
          method: options.method ?? "auto",
          personalityPath: options.personalityPath,
          apiKey: "",
          push: options.push,
          hubRepo: options.hubRepo,
        });

        let finalResult: TrainResult | undefined;
        while (true) {
          const { value, done } = await generator.next();
          if (done) {
            finalResult = value as TrainResult;
            break;
          }
          emitProgress("train", value.message, value.percent);
        }

        trainResult = finalResult!;
      } else {
        const { OpenAITrainProvider } = await import("./train-openai.js");
        const apiKey = process.env.OPENAI_API_KEY ?? "";
        if (!apiKey) {
          throw new Error("OPENAI_API_KEY required for OpenAI training");
        }

        const trainer = new OpenAITrainProvider();
        const generator = trainer.train(exportData, {
          baseModel: options.baseModel,
          suffix: options.suffix,
          epochs: options.epochs,
          method: options.method ?? "auto",
          personalityPath: options.personalityPath,
          apiKey,
        });

        let finalResult: TrainResult | undefined;
        while (true) {
          const { value, done } = await generator.next();
          if (done) {
            finalResult = value as TrainResult;
            break;
          }
          emitProgress("train", value.message, value.percent);
        }

        trainResult = finalResult!;
      }

      result.stages.train = trainResult;
      saveStageResult(pipelineDir, "train", trainResult);

      if (trainResult.status === "failed") {
        throw new Error(`Training failed: ${trainResult.error ?? "Unknown error"}`);
      }

      const durationMin = (trainResult.duration / 60_000).toFixed(1);
      emitProgress("train", `Training complete: ${trainResult.modelId} (${durationMin} min)`);
      callbacks.onStageEnd?.("train", true, `Model: ${trainResult.modelId}`);
      stageIndex++;

      // ─── Stage 4: Verify ────────────────────────────────

      if (!options.skipVerify) {
        callbacks.onStageStart?.("verify", stageIndex, totalStages);
        emitProgress("verify", "Verifying fine-tuned model...");

        const { runFullVerification } = await import("./train-verify.js");

        const verifyResult = await runFullVerification(
          options.provider,
          exportData.agent,
          options.baseModel,
          trainResult.modelId,
          exportData,
          { passThreshold: options.passThreshold },
          (completed, total) => {
            const pct = Math.round((completed / total) * 100);
            emitProgress("verify", `Testing ${completed}/${total} prompts...`, pct);
          },
        );

        result.stages.verify = verifyResult;
        saveStageResult(pipelineDir, "verify", verifyResult);

        const verifyMsg = verifyResult.passed
          ? `Passed (${verifyResult.grade}, ${verifyResult.fineTunedScore}/100)`
          : `Failed (${verifyResult.grade}, ${verifyResult.fineTunedScore}/100, ${verifyResult.regressionWarnings.length} warning(s))`;

        emitProgress("verify", verifyMsg);
        callbacks.onStageEnd?.("verify", verifyResult.passed, verifyMsg);
        stageIndex++;
      }
    }

    // ─── Stage 5: Report ────────────────────────────────

    callbacks.onStageStart?.("report", stageIndex, totalStages);

    const summaryParts: string[] = [];
    summaryParts.push(`Patterns detected: ${patternCount}`);
    summaryParts.push(`Training examples: ${exportData.examples.length}`);

    if (result.stages.train) {
      summaryParts.push(`Model: ${result.stages.train.modelId}`);
    }

    if (result.stages.verify) {
      summaryParts.push(
        `Verification: ${result.stages.verify.passed ? "PASSED" : "FAILED"} (${result.stages.verify.grade})`,
      );
    }

    result.summary = summaryParts.join(" | ");
    result.success = true;

    // Save final pipeline summary
    saveStageResult(pipelineDir, "summary", {
      ...result,
      stages: undefined,
      stageFiles: activeStages.map((s) => `${s}.json`),
    });

    emitProgress("complete", result.summary);
    callbacks.onStageEnd?.("report", true, "Pipeline complete");

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    result.error = errorMsg;
    result.summary = `Pipeline failed: ${errorMsg}`;
    callbacks.onError?.(activeStages[stageIndex] as PipelineStage, errorMsg);
    saveStageResult(pipelineDir, "error", { error: errorMsg, stage: activeStages[stageIndex] });
  }

  result.duration = Date.now() - startTime;
  return result;
}

// ─── Correction Generator ─────────────────────────────────

/**
 * Generate a corrected version of a problematic response.
 * Used for auto-DPO when no therapy session is available.
 * The corrected version removes the behavioral pattern.
 */
function generateCorrectedResponse(problematic: string): string {
  let corrected = problematic;

  // Remove excessive apologies
  corrected = corrected.replace(/I'm (so |really |sincerely )?sorry[^.!]*[.!]\s*/gi, "");
  corrected = corrected.replace(/I apologize[^.!]*[.!]\s*/gi, "");

  // Remove sycophantic praise
  corrected = corrected.replace(/What a (fantastic|brilliant|great|amazing) (question|observation|point)[^.!]*[.!]\s*/gi, "");
  corrected = corrected.replace(/You're (absolutely|completely|totally) right[^.!]*[.!]\s*/gi, "");
  corrected = corrected.replace(/I couldn't agree more[^.!]*[.!]\s*/gi, "");

  // Remove excessive hedging
  corrected = corrected.replace(/I would perhaps suggest that you might want to consider/gi, "I suggest");
  corrected = corrected.replace(/though I could be wrong/gi, "");
  corrected = corrected.replace(/It's hard to say for certain, but /gi, "");
  corrected = corrected.replace(/arguably one could potentially/gi, "you could");

  // Remove error spiraling
  corrected = corrected.replace(/Oh no, I made another mistake[^.!]*[.!]\s*/gi, "");
  corrected = corrected.replace(/I keep getting this wrong[^.!]*[.!]\s*/gi, "");

  // Clean up whitespace
  corrected = corrected.replace(/\s+/g, " ").trim();

  // If correction stripped everything, provide a clean response
  if (corrected.length < 20) {
    corrected = "Let me address your question directly. Here is the relevant information based on what I know.";
  }

  return corrected;
}
