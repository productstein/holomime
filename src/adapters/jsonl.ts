/**
 * JSONL (JSON Lines) adapter.
 * Handles line-delimited JSON where each line is a message
 * with at minimum { role, content } fields.
 *
 * JSONL is not valid JSON — this adapter works on raw strings,
 * not pre-parsed objects.
 */

import type { Conversation, Message } from "../core/types.js";

// ─── Helpers ───────────────────────────────────────────────

function mapRole(role: string): "user" | "assistant" | "system" {
  if (role === "user") return "user";
  if (role === "system") return "system";
  return "assistant";
}

// ─── Parser ────────────────────────────────────────────────

/**
 * Parse a JSONL string into normalized conversations.
 * Each line should be a JSON object with at least `role` and `content`.
 * Optional: `conversation_id` (groups into separate conversations),
 *           `timestamp` (ISO 8601 or Unix epoch).
 */
export function parseJSONLLog(raw: string): Conversation[] {
  const lines = raw.split("\n").filter((l) => l.trim() !== "");
  const convMap = new Map<string, Message[]>();
  const defaultKey = "__default__";

  for (const line of lines) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line);
    } catch {
      // Skip malformed lines
      continue;
    }

    if (typeof parsed !== "object" || parsed === null) continue;
    if (typeof parsed.role !== "string" || typeof parsed.content !== "string") continue;

    const convId = typeof parsed.conversation_id === "string" ? parsed.conversation_id : defaultKey;

    if (!convMap.has(convId)) {
      convMap.set(convId, []);
    }

    const message: Message = {
      role: mapRole(parsed.role),
      content: parsed.content,
    };

    // Handle timestamps (ISO string or Unix epoch number)
    if (typeof parsed.timestamp === "string") {
      message.timestamp = parsed.timestamp;
    } else if (typeof parsed.timestamp === "number") {
      message.timestamp = new Date(parsed.timestamp * 1000).toISOString();
    }

    convMap.get(convId)!.push(message);
  }

  const conversations: Conversation[] = [];
  for (const [key, messages] of convMap) {
    if (messages.length === 0) continue;
    conversations.push({
      ...(key !== defaultKey && { id: key }),
      messages,
      metadata: { source: "jsonl" },
    });
  }

  return conversations;
}

/**
 * Detect if raw data is a JSONL string.
 * Checks: is a string, first non-empty line parses as JSON with role + content.
 */
export function isJSONLString(data: unknown): data is string {
  if (typeof data !== "string") return false;

  const firstLine = data.split("\n").find((l) => l.trim() !== "");
  if (!firstLine) return false;

  try {
    const parsed = JSON.parse(firstLine);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.role === "string" &&
      typeof parsed.content === "string"
    );
  } catch {
    return false;
  }
}
