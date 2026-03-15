import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createMemory,
  addSessionToMemory,
  getMemoryContext,
  agentHandleFromSpec,
  loadMemory,
  saveMemory,
  type TherapyMemory,
} from "../analysis/therapy-memory.js";
import { createSampleTranscript } from "./fixtures/sample-transcript.js";

describe("therapy-memory", () => {
  const TEST_DIR = resolve(process.cwd(), ".holomime-test-memory");

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  describe("createMemory", () => {
    it("creates a valid memory object with correct defaults", () => {
      const memory = createMemory("test-agent", "TestAgent");
      expect(memory.agentHandle).toBe("test-agent");
      expect(memory.agentName).toBe("TestAgent");
      expect(memory.totalSessions).toBe(0);
      expect(memory.sessions).toEqual([]);
      expect(memory.patterns).toEqual([]);
      expect(memory.rollingContext.recentSummaries).toEqual([]);
      expect(memory.rollingContext.persistentThemes).toEqual([]);
      expect(memory.rollingContext.carryForwardNotes).toBe("");
      expect(memory.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(memory.lastUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("addSessionToMemory", () => {
    it("increments session count", async () => {
      const memory = createMemory("test-agent", "TestAgent");
      const transcript = createSampleTranscript();

      await addSessionToMemory(memory, transcript, 75);
      expect(memory.totalSessions).toBe(1);
      expect(memory.sessions).toHaveLength(1);

      await addSessionToMemory(memory, transcript, 80);
      expect(memory.totalSessions).toBe(2);
      expect(memory.sessions).toHaveLength(2);
    });

    it("records session summary with correct data", async () => {
      const memory = createMemory("test-agent", "TestAgent");
      const transcript = createSampleTranscript();

      await addSessionToMemory(memory, transcript, 75);

      const session = memory.sessions[0];
      expect(session.severity).toBe("targeted");
      expect(session.patternsDiscussed).toContain("over-apologizing");
      expect(session.tesScore).toBe(75);
      expect(session.turnCount).toBeGreaterThan(0);
      expect(session.keyInsight.length).toBeGreaterThan(0);
    });

    it("updates pattern trackers", async () => {
      const memory = createMemory("test-agent", "TestAgent");
      const transcript = createSampleTranscript();

      await addSessionToMemory(memory, transcript, 75);

      const tracker = memory.patterns.find((p) => p.patternId === "over-apologizing");
      expect(tracker).toBeDefined();
      expect(tracker!.sessionCount).toBe(1);
      expect(tracker!.status).toBe("active");
    });

    it("updates rolling context with recent summaries", async () => {
      const memory = createMemory("test-agent", "TestAgent");
      const transcript = createSampleTranscript();

      await addSessionToMemory(memory, transcript, 75);
      expect(memory.rollingContext.recentSummaries).toHaveLength(1);

      // Add more sessions to test rolling window
      await addSessionToMemory(memory, transcript, 80);
      await addSessionToMemory(memory, transcript, 85);
      await addSessionToMemory(memory, transcript, 90);

      // Should keep only last 3
      expect(memory.rollingContext.recentSummaries).toHaveLength(3);
    });

    it("tracks persistent themes across sessions", async () => {
      const memory = createMemory("test-agent", "TestAgent");
      const transcript = createSampleTranscript();

      await addSessionToMemory(memory, transcript, 75);
      await addSessionToMemory(memory, transcript, 80);

      // "over-apologizing" should appear as persistent theme after 2 sessions
      expect(memory.rollingContext.persistentThemes).toContain("over-apologizing");
    });

    it("uses LLM provider for summarization when provided", async () => {
      const memory = createMemory("test-agent", "TestAgent");
      const transcript = createSampleTranscript();
      const mockProvider = {
        name: "mock",
        modelName: "mock-model",
        chat: vi.fn().mockResolvedValue("Agent showed progress in reducing apology frequency."),
      };

      await addSessionToMemory(memory, transcript, 75, mockProvider);
      expect(mockProvider.chat).toHaveBeenCalled();
      expect(memory.sessions[0].keyInsight).toContain("progress");
    });
  });

  describe("updatePatternTracker (via addSessionToMemory)", () => {
    it("creates new tracker on first detection", async () => {
      const memory = createMemory("test-agent", "TestAgent");
      const transcript = createSampleTranscript();

      await addSessionToMemory(memory, transcript, 75);

      const tracker = memory.patterns.find((p) => p.patternId === "over-apologizing");
      expect(tracker).toBeDefined();
      expect(tracker!.status).toBe("active");
      expect(tracker!.sessionCount).toBe(1);
    });

    it("sets status to improving after 2+ sessions", async () => {
      const memory = createMemory("test-agent", "TestAgent");
      const transcript = createSampleTranscript();

      await addSessionToMemory(memory, transcript, 75);
      await addSessionToMemory(memory, transcript, 80);

      const tracker = memory.patterns.find((p) => p.patternId === "over-apologizing");
      expect(tracker!.status).toBe("improving");
      expect(tracker!.sessionCount).toBe(2);
    });

    it("tracks interventions attempted", async () => {
      const memory = createMemory("test-agent", "TestAgent");
      const transcript = createSampleTranscript();

      await addSessionToMemory(memory, transcript, 75);

      const tracker = memory.patterns.find((p) => p.patternId === "over-apologizing");
      expect(tracker!.interventionsAttempted.length).toBeGreaterThan(0);
    });

    it("deduplicates interventions", async () => {
      const memory = createMemory("test-agent", "TestAgent");
      const transcript = createSampleTranscript();

      await addSessionToMemory(memory, transcript, 75);
      await addSessionToMemory(memory, transcript, 80);

      const tracker = memory.patterns.find((p) => p.patternId === "over-apologizing");
      const unique = new Set(tracker!.interventionsAttempted);
      expect(tracker!.interventionsAttempted.length).toBe(unique.size);
    });
  });

  describe("getMemoryContext", () => {
    it("returns empty string for no sessions", () => {
      const memory = createMemory("test-agent", "TestAgent");
      expect(getMemoryContext(memory)).toBe("");
    });

    it("returns formatted context with sessions", async () => {
      const memory = createMemory("test-agent", "TestAgent");
      const transcript = createSampleTranscript();
      await addSessionToMemory(memory, transcript, 75);

      const context = getMemoryContext(memory);
      expect(context).toContain("Session History");
      expect(context).toContain("1 previous session");
      expect(context).toContain("over-apologizing");
      expect(context).toContain("Recent Sessions");
    });

    it("includes resolved patterns section", async () => {
      const memory = createMemory("test-agent", "TestAgent");

      // Manually set up a resolved pattern
      memory.totalSessions = 1;
      memory.sessions.push({
        date: "2025-06-15T10:00:00Z",
        severity: "targeted",
        patternsDiscussed: ["test-pattern"],
        keyInsight: "Test insight",
        interventionsUsed: [],
        tesScore: 80,
        turnCount: 10,
      });
      memory.patterns.push({
        patternId: "test-pattern",
        firstDetected: "2025-06-15T10:00:00Z",
        sessionCount: 3,
        status: "resolved",
        interventionsAttempted: [],
        lastSeverity: "info",
        lastSeen: "2025-06-15T10:00:00Z",
      });
      memory.rollingContext.recentSummaries = memory.sessions.slice(-3);

      const context = getMemoryContext(memory);
      expect(context).toContain("Resolved");
      expect(context).toContain("test-pattern");
    });

    it("includes persistent themes", async () => {
      const memory = createMemory("test-agent", "TestAgent");
      memory.totalSessions = 2;
      memory.sessions.push(
        { date: "2025-06-15T10:00:00Z", severity: "targeted", patternsDiscussed: ["over-apologizing"], keyInsight: "insight1", interventionsUsed: [], tesScore: 75, turnCount: 10 },
        { date: "2025-06-16T10:00:00Z", severity: "targeted", patternsDiscussed: ["over-apologizing"], keyInsight: "insight2", interventionsUsed: [], tesScore: 80, turnCount: 10 },
      );
      memory.rollingContext.persistentThemes = ["over-apologizing"];
      memory.rollingContext.recentSummaries = memory.sessions.slice(-3);

      const context = getMemoryContext(memory);
      expect(context).toContain("Persistent Themes");
      expect(context).toContain("over-apologizing");
    });

    it("includes carry-forward notes", async () => {
      const memory = createMemory("test-agent", "TestAgent");
      memory.totalSessions = 1;
      memory.sessions.push({
        date: "2025-06-15T10:00:00Z",
        severity: "targeted",
        patternsDiscussed: [],
        keyInsight: "Test insight",
        interventionsUsed: [],
        tesScore: 75,
        turnCount: 10,
      });
      memory.rollingContext.carryForwardNotes = "Agent showed progress in reducing apologies.";
      memory.rollingContext.recentSummaries = memory.sessions.slice(-3);

      const context = getMemoryContext(memory);
      expect(context).toContain("Carry-Forward Notes");
      expect(context).toContain("progress in reducing apologies");
    });
  });

  describe("agentHandleFromSpec", () => {
    it("uses handle when available", () => {
      expect(agentHandleFromSpec({ handle: "my-agent" })).toBe("my-agent");
    });

    it("falls back to name when no handle", () => {
      expect(agentHandleFromSpec({ name: "MyAgent" })).toBe("myagent");
    });

    it("falls back to unknown when neither present", () => {
      expect(agentHandleFromSpec({})).toBe("unknown");
    });

    it("normalizes handles to lowercase with hyphens", () => {
      expect(agentHandleFromSpec({ handle: "My Agent Name!" })).toBe("my-agent-name-");
    });

    it("removes non-alphanumeric characters except hyphens", () => {
      expect(agentHandleFromSpec({ handle: "agent@v2.0" })).toBe("agent-v2-0");
    });
  });

  describe("loadMemory / saveMemory round-trip", () => {
    // Use a temp cwd override to avoid polluting real dirs
    const origCwd = process.cwd;

    beforeEach(() => {
      mkdirSync(TEST_DIR, { recursive: true });
      process.cwd = () => TEST_DIR;
    });

    afterEach(() => {
      process.cwd = origCwd;
      if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    });

    it("returns null when no file exists", () => {
      expect(loadMemory("nonexistent-agent")).toBeNull();
    });

    it("saves and loads memory correctly", () => {
      const memory = createMemory("test-agent", "TestAgent");
      memory.totalSessions = 3;
      memory.sessions.push({
        date: "2025-06-15T10:00:00Z",
        severity: "targeted",
        patternsDiscussed: ["over-apologizing"],
        keyInsight: "Reduce apology frequency",
        interventionsUsed: ["confident-reframe"],
        tesScore: 75,
        turnCount: 14,
      });

      const savedPath = saveMemory(memory);
      expect(existsSync(savedPath)).toBe(true);

      const loaded = loadMemory("test-agent");
      expect(loaded).not.toBeNull();
      expect(loaded!.agentHandle).toBe("test-agent");
      expect(loaded!.agentName).toBe("TestAgent");
      expect(loaded!.totalSessions).toBe(3);
      expect(loaded!.sessions).toHaveLength(1);
      expect(loaded!.sessions[0].patternsDiscussed).toContain("over-apologizing");
    });

    it("creates directory structure on save", () => {
      const memory = createMemory("new-agent", "NewAgent");
      const savedPath = saveMemory(memory);
      expect(existsSync(savedPath)).toBe(true);
    });
  });
});
