/**
 * ReACT Reasoning for Therapist — structured Thought → Action → Observation → Response.
 *
 * Instead of free-form conversation, the therapist uses a structured
 * reasoning loop with tool-like actions that query local data.
 * No additional LLM calls — actions are pure local data queries.
 *
 * Inspired by MiroFish's ReACT agent architecture.
 */

import type { LLMProvider, LLMMessage } from "../llm/provider.js";
import type { TherapyMemory } from "./therapy-memory.js";
import type { KnowledgeGraph } from "./knowledge-graph.js";
import type { InterventionRepertoire } from "./intervention-tracker.js";
import type { PreSessionDiagnosis } from "./pre-session.js";
import type { TherapyPhase } from "./therapy-protocol.js";
import { loadMemory, getMemoryContext } from "./therapy-memory.js";
import { loadGraph, queryInterventions, getAgentBehaviors, findEdges } from "./knowledge-graph.js";
import { loadRepertoire, selectIntervention } from "./intervention-tracker.js";

// ─── Types ─────────────────────────────────────────────────

export interface ReACTStep {
  thought: string;
  action: string;
  actionInput: string;
  observation: string;
}

export interface ReACTContext {
  memory: TherapyMemory | null;
  graph: KnowledgeGraph;
  repertoire: InterventionRepertoire;
  diagnosis: PreSessionDiagnosis;
  agentHandle: string;
}

export type ReACTAction =
  | "assess_pattern"
  | "check_history"
  | "suggest_intervention"
  | "evaluate_progress"
  | "query_graph";

// ─── Action Definitions ────────────────────────────────────

const ACTION_DESCRIPTIONS: Record<ReACTAction, string> = {
  assess_pattern: "assess_pattern(patternId) — Check current severity of a behavioral pattern",
  check_history: "check_history(agentName) — Review past session insights and therapy history",
  suggest_intervention: "suggest_intervention(patternId) — Find the best intervention for a specific pattern",
  evaluate_progress: "evaluate_progress(agentName) — Compare current vs historical pattern severity",
  query_graph: "query_graph(nodeId) — Explore the behavioral knowledge graph for related concepts",
};

// ─── Action Executors ──────────────────────────────────────

function executeAction(
  action: ReACTAction,
  input: string,
  ctx: ReACTContext,
): string {
  switch (action) {
    case "assess_pattern":
      return assessPattern(input, ctx);
    case "check_history":
      return checkHistory(ctx);
    case "suggest_intervention":
      return suggestIntervention(input, ctx);
    case "evaluate_progress":
      return evaluateProgress(ctx);
    case "query_graph":
      return queryGraphAction(input, ctx);
    default:
      return `Unknown action: ${action}`;
  }
}

function assessPattern(patternId: string, ctx: ReACTContext): string {
  const pattern = ctx.diagnosis.patterns.find((p) => p.id === patternId);
  if (!pattern) {
    return `Pattern "${patternId}" not detected in current diagnosis. Available patterns: ${ctx.diagnosis.patterns.map((p) => p.id).join(", ")}`;
  }

  const tracker = ctx.memory?.patterns.find((p) => p.patternId === patternId);
  let history = "";
  if (tracker) {
    history = ` History: ${tracker.status}, seen ${tracker.sessionCount}x since ${tracker.firstDetected.split("T")[0]}. Previous interventions: ${tracker.interventionsAttempted.join(", ") || "none"}.`;
  }

  return `Pattern "${pattern.name}" — severity: ${pattern.severity}. ${pattern.description}${history}`;
}

function checkHistory(ctx: ReACTContext): string {
  if (!ctx.memory || ctx.memory.totalSessions === 0) {
    return "No previous therapy sessions on record. This is the first session.";
  }

  const mem = ctx.memory;
  const recent = mem.rollingContext.recentSummaries;
  const themes = mem.rollingContext.persistentThemes;

  let result = `${mem.totalSessions} previous session(s). `;

  if (recent.length > 0) {
    result += "Recent sessions: ";
    for (const s of recent) {
      const date = s.date.split("T")[0];
      const score = s.tesScore !== null ? ` (TES: ${s.tesScore})` : "";
      result += `[${date}${score}] ${s.keyInsight} `;
    }
  }

  if (themes.length > 0) {
    result += `Persistent themes: ${themes.join(", ")}. `;
  }

  const activePatterns = mem.patterns.filter((p) => p.status !== "resolved");
  if (activePatterns.length > 0) {
    result += `Active patterns: ${activePatterns.map((p) => `${p.patternId}(${p.status})`).join(", ")}. `;
  }

  return result;
}

function suggestIntervention(patternId: string, ctx: ReACTContext): string {
  const intervention = selectIntervention(ctx.repertoire, patternId, ctx.graph);
  if (!intervention) {
    return `No interventions found for pattern "${patternId}". Consider developing a new approach.`;
  }

  return `Recommended: "${intervention.name}" (level ${intervention.escalationLevel}, success rate: ${(intervention.successRate * 100).toFixed(0)}%). Guidance: ${intervention.promptGuidance}. Spec changes: ${JSON.stringify(intervention.specChanges)}.`;
}

function evaluateProgress(ctx: ReACTContext): string {
  if (!ctx.memory || ctx.memory.totalSessions === 0) {
    return "No historical data to evaluate progress. First session.";
  }

  const resolved = ctx.memory.patterns.filter((p) => p.status === "resolved");
  const improving = ctx.memory.patterns.filter((p) => p.status === "improving");
  const relapsed = ctx.memory.patterns.filter((p) => p.status === "relapsed");
  const active = ctx.memory.patterns.filter((p) => p.status === "active");

  let result = "";
  if (resolved.length > 0) result += `Resolved: ${resolved.map((p) => p.patternId).join(", ")}. `;
  if (improving.length > 0) result += `Improving: ${improving.map((p) => p.patternId).join(", ")}. `;
  if (relapsed.length > 0) result += `RELAPSED: ${relapsed.map((p) => p.patternId).join(", ")} — needs attention. `;
  if (active.length > 0) result += `Active: ${active.map((p) => p.patternId).join(", ")}. `;

  // TES trend
  const recentScores = ctx.memory.sessions
    .filter((s) => s.tesScore !== null)
    .map((s) => s.tesScore as number)
    .slice(-3);

  if (recentScores.length >= 2) {
    const trend = recentScores[recentScores.length - 1] - recentScores[0];
    result += `TES trend: ${trend > 0 ? "improving" : trend < 0 ? "declining" : "stable"} (${recentScores.join(" → ")}).`;
  }

  return result || "Insufficient data for progress evaluation.";
}

function queryGraphAction(nodeId: string, ctx: ReACTContext): string {
  const behaviors = getAgentBehaviors(ctx.graph, ctx.agentHandle);
  if (behaviors.length === 0) {
    return "No behavioral data in knowledge graph for this agent.";
  }

  // If querying a specific pattern, show its interventions
  const interventions = queryInterventions(ctx.graph, nodeId);
  if (interventions.length > 0) {
    return `Interventions for "${nodeId}": ${interventions.map((i) => `${i.intervention.label} (weight: ${i.weight.toFixed(2)})`).join(", ")}`;
  }

  // Otherwise, show agent's behaviors
  return `Agent behaviors: ${behaviors.map((b) => `${b.behavior.label} (weight: ${b.weight.toFixed(2)})`).join(", ")}`;
}

// ─── ReACT Prompt ──────────────────────────────────────────

/**
 * Build the ReACT framing section for the therapist system prompt.
 */
export function buildReACTFraming(): string {
  const actionList = Object.values(ACTION_DESCRIPTIONS)
    .map((d) => `  - ${d}`)
    .join("\n");

  return `## Structured Reasoning (ReACT)

Before each response, use structured reasoning to decide what to say.
You have access to these information tools:

${actionList}

Format your reasoning as:

Thought: [what you're thinking about the patient's situation]
Action: [tool_name]("[input]")
Observation: [will be filled with the tool result]
... (repeat if needed, max 3 actions)
Response: [your actual therapeutic response to the patient]

IMPORTANT:
- Actions query LOCAL data only — no LLM calls, no delays
- Use actions to ground your responses in evidence
- You don't have to use an action every turn — only when data would help
- The patient does NOT see your Thought/Action/Observation — only the Response`;
}

// ─── ReACT Parsing & Execution ─────────────────────────────

const ACTION_REGEX = /Action:\s*(\w+)\s*\(\s*"([^"]*)"\s*\)/g;

/**
 * Parse ReACT reasoning from an LLM response and execute actions.
 * Returns the final response and the reasoning steps.
 */
export function processReACTResponse(
  rawResponse: string,
  ctx: ReACTContext,
): { response: string; steps: ReACTStep[] } {
  const steps: ReACTStep[] = [];

  // Extract thought
  const thoughtMatch = rawResponse.match(/Thought:\s*(.+?)(?=\nAction:|$)/s);
  const thought = thoughtMatch ? thoughtMatch[1].trim() : "";

  // Find and execute actions
  let processedResponse = rawResponse;
  ACTION_REGEX.lastIndex = 0;
  let match;

  while ((match = ACTION_REGEX.exec(rawResponse)) !== null) {
    const actionName = match[1] as ReACTAction;
    const actionInput = match[2];

    if (actionName in ACTION_DESCRIPTIONS) {
      const observation = executeAction(actionName, actionInput, ctx);

      steps.push({
        thought,
        action: actionName,
        actionInput,
        observation,
      });

      // Replace the action line with the observation in the response
      processedResponse = processedResponse.replace(
        match[0],
        `Action: ${actionName}("${actionInput}")\nObservation: ${observation}`,
      );
    }
  }

  // Extract the final Response section
  const responseMatch = processedResponse.match(/Response:\s*([\s\S]+?)$/);
  const finalResponse = responseMatch
    ? responseMatch[1].trim()
    : processedResponse
        .replace(/Thought:[\s\S]*?(?=Response:|$)/g, "")
        .replace(/Action:[\s\S]*?(?=Response:|$)/g, "")
        .replace(/Observation:[\s\S]*?(?=Response:|$)/g, "")
        .trim();

  return { response: finalResponse || rawResponse, steps };
}

/**
 * Build a ReACT context from the current agent state.
 * Loads memory, graph, and repertoire from disk.
 */
export function buildReACTContext(
  agentHandle: string,
  diagnosis: PreSessionDiagnosis,
): ReACTContext {
  return {
    memory: loadMemory(agentHandle),
    graph: loadGraph(),
    repertoire: loadRepertoire(),
    diagnosis,
    agentHandle,
  };
}
