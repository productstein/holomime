/**
 * Generic Voice Adapter — accepts transcripts via stdin or file watching.
 * Works with any voice platform by reading JSONL-formatted transcript segments.
 *
 * Input format (one JSON object per line):
 *   {"timestamp":"...","speaker":"user|agent","text":"...","prosody":{"pitch":220,"rate":150,"volume":0.6}}
 *
 * Usage:
 *   - stdin:  cat transcript.jsonl | holomime voice --platform generic
 *   - file:   holomime voice --platform generic --input transcript.jsonl
 */

import { createReadStream, existsSync, watchFile, unwatchFile, readFileSync } from "node:fs";
import { createInterface, type Interface } from "node:readline";
import type { VoiceAdapter, VoiceAdapterCallbacks, VoiceEvent } from "./types.js";

export interface GenericAdapterOptions {
  /** Path to JSONL transcript file (if not provided, reads from stdin) */
  inputPath?: string;
  /** Watch the file for changes (tail -f behavior) */
  watch?: boolean;
  /** Delimiter between JSON objects (default: newline) */
  delimiter?: string;
}

export class GenericAdapter implements VoiceAdapter {
  readonly platform = "generic";
  private callbacks: VoiceAdapterCallbacks | null = null;
  private options: GenericAdapterOptions;
  private connected = false;
  private rl: Interface | null = null;
  private processedLines = 0;

  constructor(options: GenericAdapterOptions = {}) {
    this.options = options;
  }

  async connect(callbacks: VoiceAdapterCallbacks): Promise<void> {
    this.callbacks = callbacks;

    if (this.options.inputPath) {
      await this.readFromFile(callbacks);
    } else {
      await this.readFromStdin(callbacks);
    }
  }

  async disconnect(): Promise<void> {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    if (this.options.inputPath && this.options.watch) {
      unwatchFile(this.options.inputPath);
    }
    this.connected = false;
    this.callbacks?.onDisconnected?.();
    this.callbacks = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async readFromFile(callbacks: VoiceAdapterCallbacks): Promise<void> {
    const filePath = this.options.inputPath!;

    if (!existsSync(filePath)) {
      callbacks.onError(`Input file not found: ${filePath}`);
      return;
    }

    // Read existing content
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter(Boolean);

    this.connected = true;
    callbacks.onConnected?.();

    for (const line of lines) {
      this.processLine(line);
    }
    this.processedLines = lines.length;

    // If watching, monitor for new lines
    if (this.options.watch) {
      watchFile(filePath, { interval: 500 }, () => {
        try {
          const newContent = readFileSync(filePath, "utf-8");
          const newLines = newContent.split("\n").filter(Boolean);
          for (let i = this.processedLines; i < newLines.length; i++) {
            this.processLine(newLines[i]);
          }
          this.processedLines = newLines.length;
        } catch (err) {
          callbacks.onError(`Error reading file update: ${err instanceof Error ? err.message : err}`);
        }
      });
    } else {
      // Not watching — signal completion
      callbacks.onDisconnected?.();
    }
  }

  private async readFromStdin(callbacks: VoiceAdapterCallbacks): Promise<void> {
    this.rl = createInterface({
      input: process.stdin,
      crlfDelay: Infinity,
    });

    this.connected = true;
    callbacks.onConnected?.();

    this.rl.on("line", (line) => {
      this.processLine(line);
    });

    this.rl.on("close", () => {
      this.connected = false;
      callbacks.onDisconnected?.();
    });

    this.rl.on("error", (err) => {
      callbacks.onError(`stdin error: ${err.message}`);
    });
  }

  private processLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const data = JSON.parse(trimmed) as Record<string, unknown>;
      const event = this.parseEvent(data);
      if (event) {
        this.callbacks?.onSegment(event);
      }
    } catch {
      this.callbacks?.onError(`Failed to parse line: ${trimmed.substring(0, 80)}...`);
    }
  }

  private parseEvent(data: Record<string, unknown>): VoiceEvent | null {
    const text = typeof data.text === "string" ? data.text : typeof data.content === "string" ? data.content : null;
    if (!text) return null;

    const speaker = typeof data.speaker === "string"
      ? data.speaker
      : typeof data.role === "string"
        ? (data.role === "assistant" ? "agent" : data.role)
        : "unknown";

    const prosodyData = data.prosody as Record<string, unknown> | undefined;

    return {
      timestamp: typeof data.timestamp === "string" ? data.timestamp : new Date().toISOString(),
      speaker,
      text,
      prosody: prosodyData
        ? {
            pitch: typeof prosodyData.pitch === "number" ? prosodyData.pitch : undefined,
            rate: typeof prosodyData.rate === "number" ? prosodyData.rate : undefined,
            volume: typeof prosodyData.volume === "number" ? prosodyData.volume : undefined,
          }
        : undefined,
    };
  }
}
