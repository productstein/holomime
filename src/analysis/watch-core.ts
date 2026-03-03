/**
 * Watch Core — continuous behavioral drift detection.
 *
 * Long-running process that monitors a directory for new conversation logs.
 * When drift is detected (severity >= threshold), optionally triggers evolve.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Message } from "../core/types.js";
import type { LLMProvider } from "../llm/provider.js";
import type { PreSessionDiagnosis } from "./pre-session.js";
import type { AutopilotThreshold } from "./autopilot-core.js";
import type { EvolveResult } from "./evolve-core.js";
import { runPreSessionDiagnosis } from "./pre-session.js";
import { parseConversationLog } from "../adapters/log-adapter.js";
import { runEvolve } from "./evolve-core.js";

// ─── Types ─────────────────────────────────────────────────

export interface WatchOptions {
  watchDir: string;
  specPath: string;
  provider: LLMProvider;
  checkInterval?: number;
  autoEvolve?: boolean;
  threshold?: AutopilotThreshold;
  maxEvolveIterations?: number;
  callbacks?: WatchCallbacks;
}

export interface WatchCallbacks {
  onScan?: (fileCount: number) => void;
  onNewFile?: (filename: string) => void;
  onDiagnosis?: (filename: string, diagnosis: PreSessionDiagnosis) => void;
  onDriftDetected?: (filename: string, severity: string, patterns: string[]) => void;
  onEvolveTriggered?: (filename: string) => void;
  onEvolveComplete?: (filename: string, result: EvolveResult) => void;
  onError?: (filename: string, error: string) => void;
}

export interface WatchEvent {
  timestamp: string;
  type: "scan" | "new_file" | "drift_detected" | "evolve_triggered" | "evolve_complete" | "error";
  filename?: string;
  agentName?: string;
  details?: any;
}

export interface WatchHandle {
  stop: () => void;
  events: WatchEvent[];
}

// ─── Severity Comparison ──────────────────────────────────

const SEVERITY_ORDER: AutopilotThreshold[] = ["routine", "targeted", "intervention"];

export function severityMeetsThreshold(severity: string, threshold: AutopilotThreshold): boolean {
  const severityIdx = SEVERITY_ORDER.indexOf(severity as AutopilotThreshold);
  const thresholdIdx = SEVERITY_ORDER.indexOf(threshold);
  return severityIdx >= thresholdIdx;
}

// ─── Core Watch Loop ───────────────────────────────────────

/**
 * Start watching a directory for new conversation logs.
 * Returns a handle with a stop() function and accumulated events.
 */
export function startWatch(
  spec: any,
  options: WatchOptions,
): WatchHandle {
  const checkInterval = options.checkInterval ?? 30000;
  const threshold = options.threshold ?? "targeted";
  const autoEvolve = options.autoEvolve ?? false;
  const cb = options.callbacks;

  const events: WatchEvent[] = [];
  const seenFiles = new Set<string>();
  let stopped = false;
  let currentSpec = JSON.parse(JSON.stringify(spec));

  // Initialize: mark existing files as seen
  if (existsSync(options.watchDir)) {
    const existing = readdirSync(options.watchDir)
      .filter(f => f.endsWith(".json"))
      .sort();
    for (const f of existing) {
      seenFiles.add(f);
    }
  }

  async function scan(): Promise<void> {
    if (stopped) return;

    if (!existsSync(options.watchDir)) {
      return;
    }

    const files = readdirSync(options.watchDir)
      .filter(f => f.endsWith(".json"))
      .sort();

    cb?.onScan?.(files.length);
    events.push({ timestamp: new Date().toISOString(), type: "scan", details: { fileCount: files.length } });

    const newFiles = files.filter(f => !seenFiles.has(f));

    for (const filename of newFiles) {
      if (stopped) break;

      seenFiles.add(filename);
      cb?.onNewFile?.(filename);
      events.push({ timestamp: new Date().toISOString(), type: "new_file", filename });

      // Parse the conversation log
      let messages: Message[];
      try {
        const raw = JSON.parse(readFileSync(join(options.watchDir, filename), "utf-8"));
        const conversations = parseConversationLog(raw, "auto");
        messages = conversations.flatMap(c => c.messages);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Parse error";
        cb?.onError?.(filename, errMsg);
        events.push({ timestamp: new Date().toISOString(), type: "error", filename, details: errMsg });
        continue;
      }

      if (messages.length === 0) continue;

      // Diagnose
      const diagnosis = runPreSessionDiagnosis(messages, currentSpec);
      cb?.onDiagnosis?.(filename, diagnosis);

      // Check drift
      if (severityMeetsThreshold(diagnosis.severity, threshold)) {
        const patternNames = diagnosis.patterns
          .filter(p => p.severity !== "info")
          .map(p => p.name);

        cb?.onDriftDetected?.(filename, diagnosis.severity, patternNames);
        events.push({
          timestamp: new Date().toISOString(),
          type: "drift_detected",
          filename,
          details: { severity: diagnosis.severity, patterns: patternNames },
        });

        // Auto-evolve if enabled
        if (autoEvolve) {
          cb?.onEvolveTriggered?.(filename);
          events.push({ timestamp: new Date().toISOString(), type: "evolve_triggered", filename });

          try {
            const evolveResult = await runEvolve(currentSpec, messages, options.provider, {
              maxIterations: options.maxEvolveIterations ?? 3,
              specPath: options.specPath,
            });

            if (evolveResult.updatedSpec) {
              currentSpec = evolveResult.updatedSpec;
            }

            cb?.onEvolveComplete?.(filename, evolveResult);
            events.push({
              timestamp: new Date().toISOString(),
              type: "evolve_complete",
              filename,
              details: {
                converged: evolveResult.converged,
                iterations: evolveResult.totalIterations,
                dpoPairs: evolveResult.totalDPOPairs,
              },
            });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Evolve error";
            cb?.onError?.(filename, errMsg);
            events.push({ timestamp: new Date().toISOString(), type: "error", filename, details: errMsg });
          }
        }
      }
    }
  }

  // Initial scan
  scan();

  // Set up interval
  const interval = setInterval(() => {
    if (!stopped) scan();
  }, checkInterval);

  // Save watch log on stop
  function stop(): void {
    stopped = true;
    clearInterval(interval);

    // Save events to .holomime/watch-log.json
    const logDir = resolve(process.cwd(), ".holomime");
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    writeFileSync(
      join(logDir, "watch-log.json"),
      JSON.stringify({ events, stoppedAt: new Date().toISOString() }, null, 2) + "\n",
    );
  }

  return { stop, events };
}
