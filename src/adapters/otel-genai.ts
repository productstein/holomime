/**
 * OpenTelemetry GenAI semantic conventions adapter.
 * Handles OTel JSON export format with gen_ai.* span attributes.
 * Covers traces from LangChain, OpenAI SDK, Anthropic SDK, CrewAI,
 * Vercel AI SDK, AWS Strands, Google ADK, and any OTel-compatible framework.
 */

import type { Conversation, Message } from "../core/types.js";

// ─── OTel JSON Export Interfaces ───────────────────────────

interface OTelAttributeValue {
  stringValue?: string;
  intValue?: string | number;
  boolValue?: boolean;
  arrayValue?: { values?: OTelAttributeValue[] };
}

interface OTelAttribute {
  key: string;
  value: OTelAttributeValue;
}

interface OTelSpan {
  traceId: string;
  spanId: string;
  name: string;
  startTimeUnixNano?: string;
  endTimeUnixNano?: string;
  attributes?: OTelAttribute[];
}

interface OTelScopeSpan {
  scope?: { name?: string };
  spans?: OTelSpan[];
}

interface OTelResourceSpan {
  resource?: { attributes?: OTelAttribute[] };
  scopeSpans?: OTelScopeSpan[];
}

interface OTelExport {
  resourceSpans: OTelResourceSpan[];
}

// ─── Helpers ───────────────────────────────────────────────

function getAttr(attrs: OTelAttribute[] | undefined, key: string): string | undefined {
  if (!attrs) return undefined;
  const attr = attrs.find((a) => a.key === key);
  if (!attr) return undefined;
  return attr.value.stringValue ?? (attr.value.intValue != null ? String(attr.value.intValue) : undefined);
}

function hasGenAIAttrs(attrs: OTelAttribute[] | undefined): boolean {
  if (!attrs) return false;
  return attrs.some((a) => a.key.startsWith("gen_ai."));
}

function mapRole(role: string): "user" | "assistant" | "system" {
  if (role === "user") return "user";
  if (role === "system") return "system";
  return "assistant";
}

function nanoToISO(nano: string | undefined): string | undefined {
  if (!nano) return undefined;
  const ms = Number(BigInt(nano) / BigInt(1_000_000));
  return new Date(ms).toISOString();
}

// ─── Parser ────────────────────────────────────────────────

/**
 * Parse an OTel GenAI JSON export into normalized conversations.
 * Groups spans by traceId. Extracts messages from gen_ai.* attributes.
 */
export function parseOTelGenAIExport(data: OTelExport): Conversation[] {
  const traceMap = new Map<string, { messages: Message[]; system?: string; model?: string }>();

  for (const rs of data.resourceSpans) {
    for (const ss of rs.scopeSpans ?? []) {
      for (const span of ss.spans ?? []) {
        if (!hasGenAIAttrs(span.attributes)) continue;

        const traceId = span.traceId;
        if (!traceMap.has(traceId)) {
          traceMap.set(traceId, { messages: [] });
        }
        const trace = traceMap.get(traceId)!;

        const system = getAttr(span.attributes, "gen_ai.system");
        const model = getAttr(span.attributes, "gen_ai.request.model");
        if (system) trace.system = system;
        if (model) trace.model = model;

        const timestamp = nanoToISO(span.startTimeUnixNano);

        // Try structured messages first (gen_ai.request.messages is sometimes logged)
        const messagesAttr = span.attributes?.find((a) => a.key === "gen_ai.request.messages");
        if (messagesAttr?.value.stringValue) {
          try {
            const parsed = JSON.parse(messagesAttr.value.stringValue);
            if (Array.isArray(parsed)) {
              for (const m of parsed) {
                if (m.role && m.content) {
                  trace.messages.push({
                    role: mapRole(m.role),
                    content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
                    ...(timestamp && { timestamp }),
                  });
                }
              }
              continue;
            }
          } catch {
            // Fall through to attribute-based extraction
          }
        }

        // Extract from individual prompt/completion attributes
        // OTel GenAI uses gen_ai.prompt.{n}.content and gen_ai.completion.{n}.content
        const promptContent = getAttr(span.attributes, "gen_ai.prompt.0.content");
        const completionContent = getAttr(span.attributes, "gen_ai.completion.0.content");

        if (promptContent) {
          trace.messages.push({
            role: "user",
            content: promptContent,
            ...(timestamp && { timestamp }),
          });
        }

        if (completionContent) {
          trace.messages.push({
            role: "assistant",
            content: completionContent,
            ...(timestamp && { timestamp }),
          });
        }
      }
    }
  }

  const conversations: Conversation[] = [];
  for (const [traceId, trace] of traceMap) {
    if (trace.messages.length === 0) continue;
    conversations.push({
      id: traceId,
      messages: trace.messages,
      metadata: {
        source: "otel",
        ...(trace.system && { system: trace.system }),
        ...(trace.model && { model: trace.model }),
      },
    });
  }

  return conversations;
}

/**
 * Detect if raw data looks like an OTel GenAI export.
 */
export function isOTelGenAIExport(data: unknown): data is OTelExport {
  if (typeof data !== "object" || data === null) return false;
  if (!("resourceSpans" in data) || !Array.isArray((data as any).resourceSpans)) return false;

  // Check at least one span has gen_ai.* attributes
  const rs = (data as OTelExport).resourceSpans;
  for (const r of rs) {
    for (const ss of r.scopeSpans ?? []) {
      for (const span of ss.spans ?? []) {
        if (hasGenAIAttrs(span.attributes)) return true;
      }
    }
  }
  return false;
}
