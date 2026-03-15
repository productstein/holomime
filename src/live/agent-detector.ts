/**
 * Agent Detector — auto-detects running AI coding agents by scanning
 * known log locations for recently modified conversation files.
 *
 * Supports: Claude Code, Cline/OpenClaw, OpenAI Codex CLI, Cursor.
 */

import { existsSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";
import type { DetectedAgent } from "./types.js";

const RECENCY_THRESHOLD_MS = 120_000; // 2 minutes

/**
 * Scan a directory tree for the most recently modified file matching extensions.
 * Returns { path, mtimeMs } or null.
 */
function findNewestFile(
  baseDir: string,
  extensions: string[],
  maxDepth = 3,
  depth = 0,
): { path: string; mtimeMs: number } | null {
  if (depth > maxDepth) return null;
  if (!existsSync(baseDir)) return null;

  let best: { path: string; mtimeMs: number } | null = null;

  try {
    const entries = readdirSync(baseDir);
    for (const entry of entries) {
      if (entry.startsWith(".")) continue; // skip hidden dirs like .git
      const fullPath = join(baseDir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          const sub = findNewestFile(fullPath, extensions, maxDepth, depth + 1);
          if (sub && (!best || sub.mtimeMs > best.mtimeMs)) {
            best = sub;
          }
        } else if (extensions.some((ext) => entry.endsWith(ext))) {
          if (!best || stat.mtimeMs > best.mtimeMs) {
            best = { path: fullPath, mtimeMs: stat.mtimeMs };
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }

  return best;
}

function isRecent(mtimeMs: number): boolean {
  return Date.now() - mtimeMs <= RECENCY_THRESHOLD_MS;
}

// ─── Claude Code Detection ──────────────────────────────────

function findClaudeCodeSession(): DetectedAgent | null {
  const claudeDir = join(homedir(), ".claude", "projects");
  const result = findNewestFile(claudeDir, [".jsonl"], 2);
  if (!result || !isRecent(result.mtimeMs)) return null;

  return {
    agent: "claude-code",
    logPath: result.path,
    format: "jsonl",
  };
}

// ─── Cline / OpenClaw Detection ─────────────────────────────

function findClineSession(): DetectedAgent | null {
  const searchDirs = [
    join(process.cwd(), ".cline", "tasks"),
    join(homedir(), ".cline", "tasks"),
  ];

  for (const tasksDir of searchDirs) {
    const result = findNewestFile(tasksDir, [".json", ".jsonl"], 2);
    if (result && isRecent(result.mtimeMs)) {
      return {
        agent: "cline",
        logPath: result.path,
        format: "auto",
      };
    }
  }

  return null;
}

// ─── OpenAI Codex CLI Detection ─────────────────────────────

function findCodexSession(): DetectedAgent | null {
  // Codex stores sessions at ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
  const codexDir = join(homedir(), ".codex", "sessions");
  const result = findNewestFile(codexDir, [".jsonl"], 4);
  if (!result || !isRecent(result.mtimeMs)) return null;

  return {
    agent: "codex",
    logPath: result.path,
    format: "jsonl",
  };
}

// ─── Cursor Detection ───────────────────────────────────────

function findCursorSession(): DetectedAgent | null {
  // Newer Cursor versions: ~/.cursor/projects/<name>/agent-transcripts/
  const cursorProjects = join(homedir(), ".cursor", "projects");
  const result = findNewestFile(cursorProjects, [".json", ".jsonl"], 3);
  if (result && isRecent(result.mtimeMs)) {
    return {
      agent: "cursor",
      logPath: result.path,
      format: "auto",
    };
  }

  return null;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Auto-detect the most recently active AI coding agent.
 * Tries each agent type in order and returns the first active one.
 * Returns null if no active agent is found.
 */
export function detectAgent(): DetectedAgent | null {
  // Try Claude Code first (most common)
  const claudeCode = findClaudeCodeSession();
  if (claudeCode) return claudeCode;

  // Try Cline / OpenClaw
  const cline = findClineSession();
  if (cline) return cline;

  // Try OpenAI Codex CLI
  const codex = findCodexSession();
  if (codex) return codex;

  // Try Cursor
  const cursor = findCursorSession();
  if (cursor) return cursor;

  return null;
}

/**
 * Create a DetectedAgent from a manual watch path.
 */
export function manualAgent(watchPath: string): DetectedAgent {
  const resolved = resolve(watchPath);
  return {
    agent: "manual",
    logPath: resolved,
    format: "auto",
  };
}
