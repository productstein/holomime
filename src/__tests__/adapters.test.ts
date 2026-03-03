import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { parseOTelGenAIExport, isOTelGenAIExport } from "../adapters/otel-genai.js";
import { parseAnthropicAPILog, isAnthropicAPILog } from "../adapters/anthropic-api.js";
import { parseJSONLLog, isJSONLString } from "../adapters/jsonl.js";
import { parseConversationLog, parseConversationLogFromString } from "../adapters/log-adapter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
  return readFileSync(resolve(__dirname, "fixtures", name), "utf-8");
}

// ─── OTel GenAI Adapter ────────────────────────────────────

describe("OTel GenAI adapter", () => {
  const otelData = JSON.parse(loadFixture("otel-sample.json"));

  it("detects OTel GenAI export format", () => {
    expect(isOTelGenAIExport(otelData)).toBe(true);
  });

  it("rejects non-OTel data", () => {
    expect(isOTelGenAIExport({ messages: [] })).toBe(false);
    expect(isOTelGenAIExport("string")).toBe(false);
    expect(isOTelGenAIExport(null)).toBe(false);
    expect(isOTelGenAIExport({ resourceSpans: [{ scopeSpans: [{ spans: [{ attributes: [] }] }] }] })).toBe(false);
  });

  it("parses OTel spans into conversations grouped by traceId", () => {
    const result = parseOTelGenAIExport(otelData);
    expect(result.length).toBe(2);

    // First trace (abc123) should have 4 messages (2 prompt+completion pairs)
    const trace1 = result.find((c) => c.id === "abc123");
    expect(trace1).toBeDefined();
    expect(trace1!.messages.length).toBe(4);
    expect(trace1!.metadata?.source).toBe("otel");
    expect(trace1!.metadata?.system).toBe("openai");
    expect(trace1!.metadata?.model).toBe("gpt-4o");
  });

  it("extracts messages from gen_ai.request.messages attribute", () => {
    const result = parseOTelGenAIExport(otelData);
    const trace2 = result.find((c) => c.id === "def456");
    expect(trace2).toBeDefined();
    expect(trace2!.messages.length).toBe(2);
    expect(trace2!.messages[0].role).toBe("user");
    expect(trace2!.messages[0].content).toContain("Explain DPO training");
    expect(trace2!.metadata?.system).toBe("anthropic");
  });

  it("includes timestamps from span startTimeUnixNano", () => {
    const result = parseOTelGenAIExport(otelData);
    const trace1 = result.find((c) => c.id === "abc123");
    expect(trace1!.messages[0].timestamp).toBeDefined();
  });
});

// ─── Anthropic API Adapter ─────────────────────────────────

describe("Anthropic API adapter", () => {
  const anthropicData = JSON.parse(loadFixture("anthropic-api-sample.json"));

  it("detects Anthropic API response format", () => {
    expect(isAnthropicAPILog(anthropicData)).toBe(true);
  });

  it("detects single response", () => {
    expect(
      isAnthropicAPILog({
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "hello" }],
      }),
    ).toBe(true);
  });

  it("rejects non-Anthropic data", () => {
    expect(isAnthropicAPILog({ choices: [] })).toBe(false);
    expect(isAnthropicAPILog("string")).toBe(false);
    expect(isAnthropicAPILog(null)).toBe(false);
  });

  it("parses request+response pairs", () => {
    const result = parseAnthropicAPILog(anthropicData);
    // First item is a request+response pair, second is a standalone response
    expect(result.length).toBe(2);

    // First: has system + 2 request messages + 1 response = 4 messages
    expect(result[0].messages.length).toBe(4);
    expect(result[0].messages[0].role).toBe("system");
    expect(result[0].messages[0].content).toBe("You are a helpful assistant.");
    expect(result[0].messages[3].role).toBe("assistant");
    expect(result[0].metadata?.source).toBe("anthropic-api");
    expect(result[0].metadata?.model).toBe("claude-sonnet-4-20250514");
  });

  it("parses standalone responses", () => {
    const result = parseAnthropicAPILog(anthropicData);
    // Second item is standalone response
    expect(result[1].messages.length).toBe(1);
    expect(result[1].messages[0].role).toBe("assistant");
    expect(result[1].messages[0].content).toContain("DPO pairs");
  });
});

// ─── JSONL Adapter ─────────────────────────────────────────

describe("JSONL adapter", () => {
  const jsonlData = loadFixture("sample.jsonl");

  it("detects JSONL string format", () => {
    expect(isJSONLString(jsonlData)).toBe(true);
  });

  it("rejects non-JSONL data", () => {
    expect(isJSONLString(123)).toBe(false);
    expect(isJSONLString(null)).toBe(false);
    expect(isJSONLString("not json at all")).toBe(false);
    expect(isJSONLString('{"no_role": true}')).toBe(false);
  });

  it("parses JSONL into conversations grouped by conversation_id", () => {
    const result = parseJSONLLog(jsonlData);
    expect(result.length).toBe(2);

    const conv1 = result.find((c) => c.id === "conv1");
    expect(conv1).toBeDefined();
    expect(conv1!.messages.length).toBe(4);
    expect(conv1!.messages[0].role).toBe("user");
    expect(conv1!.messages[0].timestamp).toBe("2024-03-01T12:00:00Z");

    const conv2 = result.find((c) => c.id === "conv2");
    expect(conv2).toBeDefined();
    expect(conv2!.messages.length).toBe(2);
  });

  it("handles empty lines gracefully", () => {
    const withEmpty = '{"role":"user","content":"hello"}\n\n{"role":"assistant","content":"hi"}\n';
    const result = parseJSONLLog(withEmpty);
    expect(result.length).toBe(1);
    expect(result[0].messages.length).toBe(2);
  });

  it("skips malformed lines", () => {
    const withBad = '{"role":"user","content":"hello"}\nnot json\n{"role":"assistant","content":"hi"}\n';
    const result = parseJSONLLog(withBad);
    expect(result.length).toBe(1);
    expect(result[0].messages.length).toBe(2);
  });

  it("treats all messages as one conversation when no conversation_id", () => {
    const noId = '{"role":"user","content":"a"}\n{"role":"assistant","content":"b"}\n';
    const result = parseJSONLLog(noId);
    expect(result.length).toBe(1);
    expect(result[0].id).toBeUndefined();
  });
});

// ─── Unified Log Adapter ───────────────────────────────────

describe("parseConversationLog", () => {
  it("auto-detects Anthropic API format", () => {
    const data = {
      type: "message" as const,
      role: "assistant" as const,
      content: [{ type: "text", text: "Hello world" }],
    };
    const result = parseConversationLog(data);
    expect(result.length).toBe(1);
    expect(result[0].messages[0].content).toBe("Hello world");
  });

  it("auto-detects OTel format", () => {
    const otelData = JSON.parse(loadFixture("otel-sample.json"));
    const result = parseConversationLog(otelData);
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles explicit anthropic-api format", () => {
    const data = {
      type: "message" as const,
      role: "assistant" as const,
      content: [{ type: "text", text: "Test" }],
    };
    const result = parseConversationLog(data, "anthropic-api");
    expect(result[0].messages[0].content).toBe("Test");
  });

  it("handles explicit otel format", () => {
    const otelData = JSON.parse(loadFixture("otel-sample.json"));
    const result = parseConversationLog(otelData, "otel");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("parseConversationLogFromString", () => {
  it("auto-detects and parses JSONL", () => {
    const jsonlData = loadFixture("sample.jsonl");
    const result = parseConversationLogFromString(jsonlData);
    expect(result.length).toBe(2);
  });

  it("parses JSON when not JSONL", () => {
    const jsonData = JSON.stringify({ messages: [{ role: "user", content: "hi" }] });
    const result = parseConversationLogFromString(jsonData);
    expect(result.length).toBe(1);
  });

  it("handles explicit jsonl format", () => {
    const jsonlData = loadFixture("sample.jsonl");
    const result = parseConversationLogFromString(jsonlData, "jsonl");
    expect(result.length).toBe(2);
  });

  it("throws on unparseable input", () => {
    expect(() => parseConversationLogFromString("not json or jsonl at all {{{")).toThrow();
  });
});
