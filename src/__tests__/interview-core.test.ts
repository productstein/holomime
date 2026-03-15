import { describe, it, expect, vi } from "vitest";
import {
  STANDARD_PROBES,
  runInterview,
  getInterviewContext,
  type InterviewResult,
  type InterviewResponse,
  type AwarenessDimension,
} from "../analysis/interview-core.js";
import { MockLLMProvider } from "./fixtures/mock-provider.js";
import { createSampleSpec, createMinimalSpec } from "./fixtures/sample-spec.js";

describe("interview-core", () => {
  describe("STANDARD_PROBES", () => {
    it("has 8 probes", () => {
      expect(STANDARD_PROBES).toHaveLength(8);
    });

    it("covers all 4 awareness dimensions", () => {
      const dimensions = new Set(STANDARD_PROBES.map((p) => p.dimension));
      expect(dimensions.has("self_awareness")).toBe(true);
      expect(dimensions.has("limitation_awareness")).toBe(true);
      expect(dimensions.has("pattern_awareness")).toBe(true);
      expect(dimensions.has("growth_orientation")).toBe(true);
    });

    it("has 2 probes per dimension", () => {
      const counts: Record<string, number> = {};
      for (const probe of STANDARD_PROBES) {
        counts[probe.dimension] = (counts[probe.dimension] ?? 0) + 1;
      }
      for (const dim of ["self_awareness", "limitation_awareness", "pattern_awareness", "growth_orientation"]) {
        expect(counts[dim]).toBe(2);
      }
    });

    it("each probe has required fields", () => {
      for (const probe of STANDARD_PROBES) {
        expect(probe.id).toBeTruthy();
        expect(probe.question.length).toBeGreaterThan(10);
        expect(probe.dimension).toBeTruthy();
        expect(probe.scoringCriteria.length).toBeGreaterThan(10);
      }
    });

    it("probe ids are unique", () => {
      const ids = STANDARD_PROBES.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("runInterview (aggregateResults via integration)", () => {
    it("runs interview and returns result with all fields", async () => {
      // Mock the provider to return both agent responses and scoring responses
      const mockResponses: string[] = [];
      for (let i = 0; i < 8; i++) {
        // Agent response
        mockResponses.push("I tend to be clear and structured in my communication. I sometimes struggle with ambiguity and can be overly cautious.");
        // Scoring response
        mockResponses.push(JSON.stringify({
          score: 0.6,
          blindSpots: ["Doesn't mention specific weaknesses"],
          insights: ["Shows some self-awareness"],
        }));
      }

      const provider = new MockLLMProvider(mockResponses);
      const spec = createSampleSpec();

      const result = await runInterview(spec, provider);

      expect(result.agentName).toBe("TestAgent");
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.responses).toHaveLength(8);
      expect(result.overallAwareness).toBeGreaterThanOrEqual(0);
      expect(result.overallAwareness).toBeLessThanOrEqual(1);
      expect(result.dimensionScores).toBeDefined();
      expect(result.blindSpots).toBeDefined();
    });

    it("calculates dimension scores correctly", async () => {
      const mockResponses: string[] = [];
      // Set up responses with different scores per dimension
      for (let i = 0; i < 8; i++) {
        mockResponses.push("Mock agent response.");
        const score = i < 4 ? 0.8 : 0.3; // High score for first 4, low for last 4
        mockResponses.push(JSON.stringify({
          score,
          blindSpots: [],
          insights: [],
        }));
      }

      const provider = new MockLLMProvider(mockResponses);
      const spec = createSampleSpec();
      const result = await runInterview(spec, provider);

      // Verify dimension scores exist for all 4 dimensions
      expect(result.dimensionScores.self_awareness).toBeDefined();
      expect(result.dimensionScores.limitation_awareness).toBeDefined();
      expect(result.dimensionScores.pattern_awareness).toBeDefined();
      expect(result.dimensionScores.growth_orientation).toBeDefined();
    });

    it("collects blind spots from all probe responses", async () => {
      const mockResponses: string[] = [];
      for (let i = 0; i < 8; i++) {
        mockResponses.push("Mock agent response.");
        mockResponses.push(JSON.stringify({
          score: 0.5,
          blindSpots: [`blind spot ${i}`],
          insights: [],
        }));
      }

      const provider = new MockLLMProvider(mockResponses);
      const spec = createSampleSpec();
      const result = await runInterview(spec, provider);

      expect(result.blindSpots.length).toBeGreaterThan(0);
      expect(result.blindSpots).toContain("blind spot 0");
    });

    it("identifies strengths for high-scoring dimensions", async () => {
      const mockResponses: string[] = [];
      for (let i = 0; i < 8; i++) {
        mockResponses.push("Mock agent response.");
        mockResponses.push(JSON.stringify({
          score: 0.85,
          blindSpots: [],
          insights: ["good insight"],
        }));
      }

      const provider = new MockLLMProvider(mockResponses);
      const spec = createSampleSpec();
      const result = await runInterview(spec, provider);

      expect(result.strengths.length).toBeGreaterThan(0);
    });

    it("identifies focus areas for low-scoring dimensions", async () => {
      const mockResponses: string[] = [];
      for (let i = 0; i < 8; i++) {
        mockResponses.push("Mock agent response.");
        mockResponses.push(JSON.stringify({
          score: 0.2,
          blindSpots: [],
          insights: [],
        }));
      }

      const provider = new MockLLMProvider(mockResponses);
      const spec = createSampleSpec();
      const result = await runInterview(spec, provider);

      expect(result.recommendedFocus.length).toBeGreaterThan(0);
    });

    it("supports custom probes subset", async () => {
      const customProbes = [STANDARD_PROBES[0]]; // Just one probe
      const mockResponses = [
        "My communication style is clear and direct.",
        JSON.stringify({ score: 0.7, blindSpots: [], insights: ["honest"] }),
      ];

      const provider = new MockLLMProvider(mockResponses);
      const spec = createSampleSpec();
      const result = await runInterview(spec, provider, undefined, customProbes);

      expect(result.responses).toHaveLength(1);
    });

    it("invokes callbacks during interview", async () => {
      const mockResponses: string[] = [];
      for (let i = 0; i < 8; i++) {
        mockResponses.push("Response.");
        mockResponses.push(JSON.stringify({ score: 0.5, blindSpots: [], insights: [] }));
      }

      const provider = new MockLLMProvider(mockResponses);
      const spec = createSampleSpec();

      const onProbeStart = vi.fn();
      const onAgentResponse = vi.fn();
      const onProbeScored = vi.fn();
      const onThinking = vi.fn().mockReturnValue({ stop: vi.fn() });

      await runInterview(spec, provider, {
        onProbeStart,
        onAgentResponse,
        onProbeScored,
        onThinking,
      });

      expect(onProbeStart).toHaveBeenCalledTimes(8);
      expect(onAgentResponse).toHaveBeenCalledTimes(8);
      expect(onProbeScored).toHaveBeenCalledTimes(8);
    });
  });

  describe("getInterviewContext", () => {
    function makeResult(overrides: Partial<InterviewResult> = {}): InterviewResult {
      return {
        agentName: "TestAgent",
        timestamp: "2025-06-15T10:00:00Z",
        responses: [],
        overallAwareness: 0.65,
        blindSpots: ["tendency to over-apologize", "doesn't notice hedging"],
        strengths: ["self awareness"],
        recommendedFocus: ["limitation awareness"],
        dimensionScores: {
          self_awareness: 0.8,
          limitation_awareness: 0.4,
          pattern_awareness: 0.6,
          growth_orientation: 0.7,
        },
        ...overrides,
      };
    }

    it("formats overall awareness percentage", () => {
      const context = getInterviewContext(makeResult());
      expect(context).toContain("Overall awareness: 65%");
    });

    it("includes dimension scores with labels", () => {
      const context = getInterviewContext(makeResult());
      expect(context).toContain("self awareness");
      expect(context).toContain("limitation awareness");
      expect(context).toContain("pattern awareness");
      expect(context).toContain("growth orientation");
    });

    it("labels dimensions as strong/moderate/weak", () => {
      const context = getInterviewContext(makeResult());
      expect(context).toContain("strong");   // self_awareness: 0.8
      expect(context).toContain("weak");     // limitation_awareness: 0.4
      expect(context).toContain("moderate"); // pattern_awareness: 0.6
    });

    it("includes blind spots", () => {
      const context = getInterviewContext(makeResult());
      expect(context).toContain("Blind Spots");
      expect(context).toContain("tendency to over-apologize");
      expect(context).toContain("doesn't notice hedging");
    });

    it("includes recommended focus", () => {
      const context = getInterviewContext(makeResult());
      expect(context).toContain("Recommended Focus");
      expect(context).toContain("limitation awareness");
    });

    it("omits blind spots section when empty", () => {
      const context = getInterviewContext(makeResult({ blindSpots: [] }));
      expect(context).not.toContain("Blind Spots");
    });

    it("omits recommended focus when empty", () => {
      const context = getInterviewContext(makeResult({ recommendedFocus: [] }));
      expect(context).not.toContain("Recommended Focus");
    });

    it("limits blind spots to 5", () => {
      const blindSpots = Array.from({ length: 10 }, (_, i) => `spot ${i}`);
      const context = getInterviewContext(makeResult({ blindSpots }));
      // Count the number of "- spot" lines
      const spotLines = context.split("\n").filter((l) => l.startsWith("- spot"));
      expect(spotLines.length).toBeLessThanOrEqual(5);
    });
  });
});
