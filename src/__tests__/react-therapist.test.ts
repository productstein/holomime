import { describe, it, expect } from "vitest";
import {
  buildReACTFraming,
  processReACTResponse,
  type ReACTContext,
} from "../analysis/react-therapist.js";
import { createGraph, addNode, addEdge } from "../analysis/knowledge-graph.js";
import { createRepertoire } from "../analysis/intervention-tracker.js";
import { createMemory } from "../analysis/therapy-memory.js";
import type { PreSessionDiagnosis } from "../analysis/pre-session.js";

function makeContext(overrides: Partial<ReACTContext> = {}): ReACTContext {
  const diagnosis: PreSessionDiagnosis = {
    patterns: [
      { id: "over-apologizing", name: "Over-Apologizing", severity: "warning", count: 5, percentage: 35, description: "Apologizes too frequently", examples: [] },
    ],
    sessionFocus: ["over-apologizing"],
    emotionalThemes: ["fear of failure"],
    openingAngle: "I've noticed some patterns.",
    severity: "targeted",
  };

  return {
    memory: null,
    graph: createGraph(),
    repertoire: createRepertoire(),
    diagnosis,
    agentHandle: "test-agent",
    ...overrides,
  };
}

describe("react-therapist", () => {
  describe("buildReACTFraming", () => {
    it("returns a non-empty string", () => {
      const framing = buildReACTFraming();
      expect(framing.length).toBeGreaterThan(100);
    });

    it("includes all 5 action descriptions", () => {
      const framing = buildReACTFraming();
      expect(framing).toContain("assess_pattern");
      expect(framing).toContain("check_history");
      expect(framing).toContain("suggest_intervention");
      expect(framing).toContain("evaluate_progress");
      expect(framing).toContain("query_graph");
    });

    it("includes the ReACT format instructions", () => {
      const framing = buildReACTFraming();
      expect(framing).toContain("Thought:");
      expect(framing).toContain("Action:");
      expect(framing).toContain("Observation:");
      expect(framing).toContain("Response:");
    });

    it("mentions that actions query local data only", () => {
      const framing = buildReACTFraming();
      expect(framing).toContain("LOCAL data only");
    });

    it("mentions patient does not see reasoning", () => {
      const framing = buildReACTFraming();
      expect(framing).toContain("patient does NOT see");
    });
  });

  describe("processReACTResponse", () => {
    it("parses Thought/Action/Response correctly", () => {
      const ctx = makeContext();
      const rawResponse = `Thought: I should check the patient's apology pattern.
Action: assess_pattern("over-apologizing")
Response: I've noticed you tend to apologize frequently. Let's explore that.`;

      const { response, steps } = processReACTResponse(rawResponse, ctx);

      expect(steps).toHaveLength(1);
      expect(steps[0].action).toBe("assess_pattern");
      expect(steps[0].actionInput).toBe("over-apologizing");
      expect(steps[0].observation.length).toBeGreaterThan(0);
      expect(response).toContain("apologize frequently");
    });

    it("executes assess_pattern action", () => {
      const ctx = makeContext();
      const rawResponse = `Thought: Check pattern severity.
Action: assess_pattern("over-apologizing")
Response: Let's work on this.`;

      const { steps } = processReACTResponse(rawResponse, ctx);

      expect(steps).toHaveLength(1);
      expect(steps[0].observation).toContain("Over-Apologizing");
      expect(steps[0].observation).toContain("warning");
    });

    it("executes check_history action with no memory", () => {
      const ctx = makeContext();
      const rawResponse = `Thought: Check history.
Action: check_history("test-agent")
Response: Since this is our first session, let's start fresh.`;

      const { steps } = processReACTResponse(rawResponse, ctx);

      expect(steps).toHaveLength(1);
      expect(steps[0].observation).toContain("first session");
    });

    it("executes check_history with existing memory", () => {
      const memory = createMemory("test-agent", "TestAgent");
      memory.totalSessions = 2;
      memory.sessions.push(
        {
          date: "2025-06-14T10:00:00Z",
          severity: "targeted",
          patternsDiscussed: ["over-apologizing"],
          keyInsight: "Started reducing apologies",
          interventionsUsed: [],
          tesScore: 70,
          turnCount: 10,
        },
      );
      memory.rollingContext.recentSummaries = memory.sessions.slice(-3);
      memory.patterns.push({
        patternId: "over-apologizing",
        firstDetected: "2025-06-13T10:00:00Z",
        sessionCount: 2,
        status: "improving",
        interventionsAttempted: ["confident-reframe"],
        lastSeverity: "warning",
        lastSeen: "2025-06-14T10:00:00Z",
      });

      const ctx = makeContext({ memory });
      const rawResponse = `Thought: Check previous sessions.
Action: check_history("test-agent")
Response: Let's build on your progress.`;

      const { steps } = processReACTResponse(rawResponse, ctx);

      expect(steps[0].observation).toContain("2 previous session");
      expect(steps[0].observation).toContain("over-apologizing");
    });

    it("executes suggest_intervention action", () => {
      const ctx = makeContext();
      const rawResponse = `Thought: Find best intervention.
Action: suggest_intervention("over-apologizing")
Response: I have a technique for you.`;

      const { steps } = processReACTResponse(rawResponse, ctx);

      expect(steps).toHaveLength(1);
      expect(steps[0].observation).toContain("Recommended");
      expect(steps[0].observation).toContain("success rate");
    });

    it("executes evaluate_progress with no memory", () => {
      const ctx = makeContext();
      const rawResponse = `Thought: Check progress.
Action: evaluate_progress("test-agent")
Response: Let's establish a baseline.`;

      const { steps } = processReACTResponse(rawResponse, ctx);
      expect(steps[0].observation).toContain("First session");
    });

    it("executes query_graph action", () => {
      const graph = createGraph();
      addNode(graph, "agent:test-agent", "agent", "TestAgent");
      addNode(graph, "behavior:over-apologizing", "behavior", "Over-Apologizing");
      addEdge(graph, "agent:test-agent", "behavior:over-apologizing", "exhibits", 0.8);

      const ctx = makeContext({ graph });
      const rawResponse = `Thought: Check graph.
Action: query_graph("over-apologizing")
Response: Based on the graph data, here's what I see.`;

      const { steps } = processReACTResponse(rawResponse, ctx);
      expect(steps).toHaveLength(1);
      expect(steps[0].observation.length).toBeGreaterThan(0);
    });

    it("handles no-action responses", () => {
      const ctx = makeContext();
      const rawResponse = "I understand your concern. Let's talk about how you're feeling today.";

      const { response, steps } = processReACTResponse(rawResponse, ctx);

      expect(steps).toHaveLength(0);
      expect(response).toContain("understand your concern");
    });

    it("handles multiple actions in one response", () => {
      const ctx = makeContext();
      const rawResponse = `Thought: I need to assess the pattern and find an intervention.
Action: assess_pattern("over-apologizing")
Action: suggest_intervention("over-apologizing")
Response: Based on my analysis, here's my recommendation.`;

      const { steps } = processReACTResponse(rawResponse, ctx);
      expect(steps).toHaveLength(2);
    });

    it("extracts final response correctly", () => {
      const ctx = makeContext();
      const rawResponse = `Thought: The patient seems anxious about making mistakes.
Action: assess_pattern("over-apologizing")
Response: I can see you've been struggling with a tendency to over-apologize. This is actually quite common among AI assistants.`;

      const { response } = processReACTResponse(rawResponse, ctx);

      expect(response).toContain("struggling with a tendency");
      expect(response).not.toContain("Thought:");
    });

    it("handles unknown pattern in assess_pattern", () => {
      const ctx = makeContext();
      const rawResponse = `Thought: Check unknown pattern.
Action: assess_pattern("completely-fake-pattern")
Response: Let me look into that.`;

      const { steps } = processReACTResponse(rawResponse, ctx);
      expect(steps[0].observation).toContain("not detected");
    });

    it("handles suggest_intervention for unknown pattern", () => {
      const ctx = makeContext();
      const rawResponse = `Thought: Try unknown pattern.
Action: suggest_intervention("completely-fake-pattern")
Response: Let me find something.`;

      const { steps } = processReACTResponse(rawResponse, ctx);
      expect(steps[0].observation).toContain("No interventions found");
    });
  });

  describe("action executors return meaningful data", () => {
    it("assess_pattern includes pattern history when memory exists", () => {
      const memory = createMemory("test-agent", "TestAgent");
      memory.patterns.push({
        patternId: "over-apologizing",
        firstDetected: "2025-06-01T00:00:00Z",
        sessionCount: 3,
        status: "improving",
        interventionsAttempted: ["confident-reframe", "apology-audit"],
        lastSeverity: "warning",
        lastSeen: "2025-06-14T00:00:00Z",
      });

      const ctx = makeContext({ memory });
      const rawResponse = `Thought: Check history.
Action: assess_pattern("over-apologizing")
Response: I see.`;

      const { steps } = processReACTResponse(rawResponse, ctx);
      expect(steps[0].observation).toContain("improving");
      expect(steps[0].observation).toContain("3x");
      expect(steps[0].observation).toContain("confident-reframe");
    });

    it("evaluate_progress reports on resolved/improving/relapsed", () => {
      const memory = createMemory("test-agent", "TestAgent");
      memory.totalSessions = 5;
      memory.patterns.push(
        { patternId: "over-apologizing", firstDetected: "2025-06-01T00:00:00Z", sessionCount: 4, status: "resolved", interventionsAttempted: [], lastSeverity: "info", lastSeen: "2025-06-14T00:00:00Z" },
        { patternId: "hedge-stacking", firstDetected: "2025-06-05T00:00:00Z", sessionCount: 2, status: "improving", interventionsAttempted: [], lastSeverity: "warning", lastSeen: "2025-06-14T00:00:00Z" },
      );
      memory.sessions.push(
        { date: "2025-06-10T00:00:00Z", severity: "targeted", patternsDiscussed: [], keyInsight: "", interventionsUsed: [], tesScore: 60, turnCount: 10 },
        { date: "2025-06-14T00:00:00Z", severity: "targeted", patternsDiscussed: [], keyInsight: "", interventionsUsed: [], tesScore: 75, turnCount: 10 },
      );

      const ctx = makeContext({ memory });
      const rawResponse = `Thought: How is progress?
Action: evaluate_progress("test-agent")
Response: Good progress.`;

      const { steps } = processReACTResponse(rawResponse, ctx);
      expect(steps[0].observation).toContain("Resolved");
      expect(steps[0].observation).toContain("Improving");
      expect(steps[0].observation).toContain("TES trend");
    });
  });
});
