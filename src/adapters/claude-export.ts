/**
 * Claude export format adapter.
 * Handles the JSON from Claude's conversation export.
 */

import type { Conversation, Message } from "../core/types.js";

interface ClaudeChatMessage {
  sender: "human" | "assistant";
  text: string;
  created_at?: string;
}

interface ClaudeConversation {
  name?: string;
  uuid?: string;
  chat_messages: ClaudeChatMessage[];
}

interface ClaudeExport {
  conversations?: ClaudeConversation[];
  // Some exports may also be an array directly
}

/**
 * Parse a Claude export (conversations JSON).
 */
export function parseClaudeExport(data: ClaudeExport | ClaudeConversation[]): Conversation[] {
  const convs = Array.isArray(data) ? data : (data.conversations ?? []);

  return convs.map((conv) => {
    const messages: Message[] = conv.chat_messages.map((msg) => {
      const message: Message = {
        role: msg.sender === "human" ? "user" : "assistant",
        content: msg.text,
      };
      if (msg.created_at) {
        message.timestamp = msg.created_at;
      }
      return message;
    });

    return {
      id: conv.uuid ?? conv.name ?? undefined,
      messages,
      metadata: { source: "claude", name: conv.name },
    };
  });
}

/**
 * Detect if raw data looks like a Claude export.
 */
export function isClaudeExport(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;

  // Check for {conversations: [{chat_messages: [...]}]}
  if ("conversations" in data) {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.conversations) && d.conversations.length > 0) {
      const first = d.conversations[0] as Record<string, unknown>;
      return "chat_messages" in first;
    }
  }

  // Check for array of [{chat_messages: [...]}]
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    return typeof first === "object" && first !== null && "chat_messages" in first;
  }

  return false;
}
