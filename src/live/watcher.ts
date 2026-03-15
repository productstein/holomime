/**
 * Live File Watcher — watches an AI agent's conversation log for new entries,
 * runs diagnosis on each update, and emits BrainEvents via callback.
 *
 * Uses chokidar for sub-second file change detection and tracks byte offset
 * for incremental reads (tail -f equivalent).
 */

import { watch, type FSWatcher } from "chokidar";
import { createReadStream, statSync } from "fs";
import { createInterface } from "readline";
import type { Message } from "../core/types.js";
import { parseConversationLogFromString } from "../adapters/log-adapter.js";
import { runDiagnosis } from "../analysis/diagnose-core.js";
import { mapDiagnosisToBrainEvent } from "./brain-mapper.js";
import type { BrainEvent, DetectedAgent } from "./types.js";

export interface WatcherCallbacks {
  onEvent: (event: BrainEvent) => void;
  onError?: (error: Error) => void;
  onReady?: () => void;
}

export interface LiveWatcher {
  stop: () => void;
}

/**
 * Start watching an agent's conversation log file.
 * On each change, reads new lines, accumulates messages,
 * runs diagnosis, and emits a BrainEvent.
 */
export function startWatcher(
  agent: DetectedAgent,
  callbacks: WatcherCallbacks,
): LiveWatcher {
  const { logPath, format } = agent;

  let byteOffset = 0;
  let allMessages: Message[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let fsWatcher: FSWatcher | null = null;

  // Get initial file size so we only read new content
  try {
    const stat = statSync(logPath);
    byteOffset = stat.size;
  } catch {
    // File may not exist yet; start from 0
    byteOffset = 0;
  }

  // Do an initial full read to have baseline context
  initialRead().then(() => {
    // Start watching for changes
    fsWatcher = watch(logPath, {
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    fsWatcher.on("change", () => {
      // Debounce rapid writes (agents write multiple lines quickly)
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        readNewLines().catch((err) => {
          callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
        });
      }, 100);
    });

    fsWatcher.on("error", (err) => {
      callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    });

    callbacks.onReady?.();
  }).catch((err) => {
    callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
  });

  /**
   * Full initial read — parse entire file to build baseline message state.
   */
  async function initialRead(): Promise<void> {
    const content = await readFile(logPath, 0);
    if (!content) return;

    try {
      const conversations = parseConversationLogFromString(
        content,
        format === "auto" ? "auto" : format,
      );
      allMessages = conversations.flatMap((c) => c.messages);
    } catch {
      // File might be partially written; we'll catch up on next change
    }
  }

  /**
   * Read only new bytes appended since last read.
   */
  async function readNewLines(): Promise<void> {
    let currentSize: number;
    try {
      const stat = statSync(logPath);
      currentSize = stat.size;
    } catch {
      return;
    }

    // File was truncated or rotated — do a full re-read
    if (currentSize < byteOffset) {
      byteOffset = 0;
      allMessages = [];
    }

    if (currentSize === byteOffset) return;

    const newContent = await readFile(logPath, byteOffset);
    byteOffset = currentSize;

    if (!newContent || !newContent.trim()) return;

    // Parse new lines into messages
    try {
      const conversations = parseConversationLogFromString(
        newContent,
        format === "auto" ? "auto" : format,
      );
      const newMessages = conversations.flatMap((c) => c.messages);

      if (newMessages.length === 0) return;

      allMessages = [...allMessages, ...newMessages];

      const lastNew = newMessages[newMessages.length - 1];
      const latestMessage = lastNew.role !== "system"
        ? { role: lastNew.role as "user" | "assistant", content: lastNew.content }
        : undefined;

      // Run diagnosis on full conversation
      const diagnosis = runDiagnosis(allMessages);
      const brainEvent = mapDiagnosisToBrainEvent(diagnosis, latestMessage);

      callbacks.onEvent(brainEvent);
    } catch {
      // Partial write — wait for next change
    }
  }

  return {
    stop() {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (fsWatcher) {
        fsWatcher.close();
        fsWatcher = null;
      }
    },
  };
}

/**
 * Read file content starting from a byte offset.
 */
function readFile(filePath: string, startByte: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const stream = createReadStream(filePath, {
      start: startByte,
      encoding: "utf-8",
    });

    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    rl.on("line", (line) => {
      chunks.push(line);
    });

    rl.on("close", () => {
      resolve(chunks.join("\n"));
    });

    rl.on("error", reject);
    stream.on("error", reject);
  });
}
