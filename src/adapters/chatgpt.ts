/**
 * ChatGPT export format adapter.
 * Handles the JSON extracted from ChatGPT's "Export data" ZIP.
 * The user should unzip first and pass the conversations.json file.
 */

import type { Conversation, Message } from "../core/types.js";

interface ChatGPTMessage {
  author: { role: string };
  content: { parts?: (string | null)[] };
  create_time?: number | null;
}

interface ChatGPTNode {
  message: ChatGPTMessage | null;
  children?: string[];
}

interface ChatGPTConversation {
  title?: string;
  mapping: Record<string, ChatGPTNode>;
}

function mapRole(role: string): "user" | "assistant" | "system" {
  if (role === "user") return "user";
  if (role === "system") return "system";
  // assistant, tool, etc. → assistant
  return "assistant";
}

/**
 * Parse a ChatGPT export (conversations.json content).
 * Input is an array of conversation objects with `mapping` structure.
 */
export function parseChatGPTExport(data: ChatGPTConversation[]): Conversation[] {
  return data.map((conv) => {
    const messages: Message[] = [];

    // Walk mapping nodes, sort by create_time
    const nodes = Object.values(conv.mapping)
      .filter((n): n is ChatGPTNode & { message: ChatGPTMessage } => n.message !== null)
      .sort((a, b) => (a.message.create_time ?? 0) - (b.message.create_time ?? 0));

    for (const node of nodes) {
      const msg = node.message;
      const role = mapRole(msg.author.role);
      const content = (msg.content.parts ?? [])
        .filter((p): p is string => typeof p === "string")
        .join("");

      if (!content.trim()) continue;

      const message: Message = { role, content };
      if (msg.create_time) {
        message.timestamp = new Date(msg.create_time * 1000).toISOString();
      }
      messages.push(message);
    }

    return {
      id: conv.title ?? undefined,
      messages,
      metadata: { source: "chatgpt", title: conv.title },
    };
  });
}

/**
 * Detect if raw data looks like a ChatGPT export.
 */
export function isChatGPTExport(data: unknown): data is ChatGPTConversation[] {
  if (!Array.isArray(data)) return false;
  if (data.length === 0) return false;
  const first = data[0];
  return typeof first === "object" && first !== null && "mapping" in first;
}
