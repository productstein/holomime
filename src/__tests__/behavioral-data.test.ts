import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  emitBehavioralEvent,
  loadCorpus,
  corpusStats,
  hashSpec,
} from "../analysis/behavioral-data.js";

const TEST_DIR = join(process.cwd(), ".holomime-test-corpus");

describe("Behavioral Data", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("hashSpec", () => {
    it("produces a hex string", () => {
      const hash = hashSpec({ name: "test", version: "2.0" });
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it("produces consistent hashes", () => {
      const spec = { name: "test", big_five: { openness: 0.8 } };
      expect(hashSpec(spec)).toBe(hashSpec(spec));
    });

    it("produces different hashes for different specs", () => {
      const hash1 = hashSpec({ name: "agent-a" });
      const hash2 = hashSpec({ name: "agent-b" });
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("emitBehavioralEvent + loadCorpus", () => {
    it("writes and reads a single event", () => {
      emitBehavioralEvent({
        event_type: "diagnosis",
        agent: "test-agent",
        data: { patterns: 3 },
        spec_hash: "abc123",
      }, TEST_DIR);

      const events = loadCorpus(join(TEST_DIR, "behavioral-corpus.jsonl"));
      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe("diagnosis");
      expect(events[0].agent).toBe("test-agent");
      expect(events[0].timestamp).toBeDefined();
    });

    it("appends multiple events", () => {
      emitBehavioralEvent({
        event_type: "diagnosis",
        agent: "agent-1",
        data: {},
        spec_hash: "a",
      }, TEST_DIR);

      emitBehavioralEvent({
        event_type: "session",
        agent: "agent-2",
        data: {},
        spec_hash: "b",
      }, TEST_DIR);

      emitBehavioralEvent({
        event_type: "dpo_pair",
        agent: "agent-1",
        data: { pattern: "over-apologizing" },
        spec_hash: "a",
      }, TEST_DIR);

      const events = loadCorpus(join(TEST_DIR, "behavioral-corpus.jsonl"));
      expect(events).toHaveLength(3);
    });

    it("preserves event ordering", () => {
      const agents = ["first", "second", "third"];
      for (const agent of agents) {
        emitBehavioralEvent({
          event_type: "diagnosis",
          agent,
          data: {},
          spec_hash: "",
        }, TEST_DIR);
      }

      const events = loadCorpus(join(TEST_DIR, "behavioral-corpus.jsonl"));
      expect(events.map((e) => e.agent)).toEqual(agents);
    });
  });

  describe("loadCorpus", () => {
    it("returns empty array for non-existent file", () => {
      const events = loadCorpus(join(TEST_DIR, "nonexistent.jsonl"));
      expect(events).toEqual([]);
    });
  });

  describe("corpusStats", () => {
    it("computes correct statistics", () => {
      const events = [
        { event_type: "diagnosis" as const, agent: "a", timestamp: "2026-01-01T00:00:00Z", data: {}, spec_hash: "" },
        { event_type: "diagnosis" as const, agent: "b", timestamp: "2026-01-02T00:00:00Z", data: {}, spec_hash: "" },
        { event_type: "session" as const, agent: "a", timestamp: "2026-01-03T00:00:00Z", data: {}, spec_hash: "" },
        { event_type: "dpo_pair" as const, agent: "a", timestamp: "2026-01-04T00:00:00Z", data: {}, spec_hash: "" },
      ];

      const stats = corpusStats(events);
      expect(stats.total).toBe(4);
      expect(stats.byType.diagnosis).toBe(2);
      expect(stats.byType.session).toBe(1);
      expect(stats.byType.dpo_pair).toBe(1);
      expect(stats.byAgent.a).toBe(3);
      expect(stats.byAgent.b).toBe(1);
      expect(stats.timeRange?.earliest).toBe("2026-01-01T00:00:00Z");
      expect(stats.timeRange?.latest).toBe("2026-01-04T00:00:00Z");
    });

    it("returns null timeRange for empty events", () => {
      const stats = corpusStats([]);
      expect(stats.total).toBe(0);
      expect(stats.timeRange).toBeNull();
    });
  });
});
