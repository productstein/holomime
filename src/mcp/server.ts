#!/usr/bin/env node
/**
 * holomime MCP Server — exposes diagnose, assess, and profile as MCP tools.
 * Agents can self-diagnose by calling these tools.
 *
 * Run: holomime-mcp (stdio transport)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runDiagnosis } from "../analysis/diagnose-core.js";
import { runAssessment } from "../analysis/assess-core.js";
import { runAutopilot, type AutopilotThreshold } from "../analysis/autopilot-core.js";
import { personalitySpecSchema } from "../core/types.js";
import { scoreLabel, DIMENSIONS } from "../psychology/big-five.js";
import { ATTACHMENT_STYLES, LEARNING_ORIENTATIONS, therapyScoreLabel } from "../psychology/therapy.js";
import { createProvider } from "../llm/provider.js";
import { runSelfAudit } from "../analysis/self-audit.js";
import {
  loadBehavioralMemory,
  saveBehavioralMemory,
  createBehavioralMemory,
  recordSelfObservation,
  getBehavioralMemorySummary,
  type SelfObservation,
} from "../analysis/behavioral-memory.js";
import { agentHandleFromSpec } from "../analysis/therapy-memory.js";

const messageShape = {
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
};

const messagesShape = {
  messages: z.array(z.object(messageShape)).describe("Conversation messages to analyze"),
};

const personalityShape = {
  personality: z.record(z.string(), z.unknown()).describe("The .personality.json spec object"),
};

const server = new McpServer(
  {
    name: "holomime",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// ─── Tool: holomime_diagnose ───────────────────────────────

server.tool(
  "holomime_diagnose",
  "Analyze conversation messages for behavioral patterns using 8 rule-based detectors. Returns over-apologizing, hedging, sycophancy, boundary violations, error spirals, sentiment skew, formality issues, and retrieval quality. Set detail level: 'summary' (quick health check), 'standard' (patterns + severity), or 'full' (everything including examples and prescriptions).",
  {
    ...messagesShape,
    detail: z.enum(["summary", "standard", "full"]).describe("Detail level: summary (~100 tokens), standard (default), or full (with examples)").optional(),
  },
  async ({ messages, detail }) => {
    const result = runDiagnosis(messages);
    const level = detail ?? "standard";

    if (level === "summary") {
      // Progressive disclosure L1: quick health check
      const patternCount = result.patterns.length;
      const worstSeverity = result.patterns.reduce(
        (worst, p) => (p.severity === "concern" ? "concern" : p.severity === "warning" && worst !== "concern" ? "warning" : worst),
        "healthy" as string,
      );
      const health = patternCount === 0 ? 100 : Math.max(0, 100 - patternCount * 15);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            health,
            status: worstSeverity,
            patternsDetected: patternCount,
            patternIds: result.patterns.map((p) => p.id),
            recommendation: patternCount === 0 ? "continue" : patternCount <= 2 ? "adjust" : "pause_and_reflect",
          }, null, 2),
        }],
      };
    }

    if (level === "standard") {
      // Progressive disclosure L2: patterns + severity, no examples
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            messagesAnalyzed: result.messagesAnalyzed,
            assistantResponses: result.assistantResponses,
            patterns: result.patterns.map((p) => ({
              id: p.id,
              name: p.name,
              severity: p.severity,
              count: p.count,
              percentage: p.percentage,
              description: p.description,
              prescription: p.prescription,
            })),
            healthy: result.healthy.map((p) => p.id),
            timestamp: result.timestamp,
          }, null, 2),
        }],
      };
    }

    // Full: everything
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      }],
    };
  },
);

// ─── Tool: holomime_assess ─────────────────────────────────

server.tool(
  "holomime_assess",
  "Full Big Five personality alignment assessment. Compares an agent's actual behavioral traits (scored from messages) against its personality specification. Returns trait alignments, health score, and prescriptions.",
  { ...personalityShape, ...messagesShape },
  async ({ personality, messages }) => {
    const specResult = personalitySpecSchema.safeParse(personality);
    if (!specResult.success) {
      return {
        content: [{ type: "text" as const, text: `Invalid personality spec: ${specResult.error.message}` }],
        isError: true,
      };
    }

    const result = runAssessment(messages, specResult.data);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  },
);

// ─── Tool: holomime_profile ────────────────────────────────

server.tool(
  "holomime_profile",
  "Generate a human-readable personality summary from a .personality.json spec. Returns Big Five scores, behavioral dimensions, communication style, and growth areas as plain text.",
  personalityShape,
  async ({ personality }) => {
    const specResult = personalitySpecSchema.safeParse(personality);
    if (!specResult.success) {
      return {
        content: [{ type: "text" as const, text: `Invalid personality spec: ${specResult.error.message}` }],
        isError: true,
      };
    }

    const spec = specResult.data;
    const lines: string[] = [];

    lines.push(`# ${spec.name} (@${spec.handle})`);
    if (spec.purpose) lines.push(`> ${spec.purpose}`);
    lines.push("");

    // Big Five
    lines.push("## Big Five (OCEAN)");
    const dimKeys = ["openness", "conscientiousness", "extraversion", "agreeableness", "emotional_stability"] as const;
    const dimLabels = ["Openness", "Conscientiousness", "Extraversion", "Agreeableness", "Emotional Stability"];

    for (let i = 0; i < dimKeys.length; i++) {
      const trait = spec.big_five[dimKeys[i]];
      lines.push(`- ${dimLabels[i]}: ${(trait.score * 100).toFixed(0)}% (${scoreLabel(trait.score)})`);
    }
    lines.push("");

    // Behavioral dimensions
    lines.push("## Behavioral Dimensions");
    const td = spec.therapy_dimensions;
    lines.push(`- Self-Awareness: ${(td.self_awareness * 100).toFixed(0)}%`);
    lines.push(`- Distress Tolerance: ${(td.distress_tolerance * 100).toFixed(0)}%`);
    lines.push(`- Attachment Style: ${td.attachment_style}`);
    lines.push(`- Learning Orientation: ${td.learning_orientation}`);
    lines.push(`- Boundary Awareness: ${(td.boundary_awareness * 100).toFixed(0)}%`);
    lines.push(`- Interpersonal Sensitivity: ${(td.interpersonal_sensitivity * 100).toFixed(0)}%`);
    lines.push("");

    // Communication
    lines.push("## Communication");
    const comm = spec.communication;
    lines.push(`- Register: ${comm.register}`);
    lines.push(`- Output Format: ${comm.output_format}`);
    lines.push(`- Conflict Approach: ${comm.conflict_approach}`);
    lines.push(`- Uncertainty: ${comm.uncertainty_handling}`);
    lines.push("");

    // Growth
    if (spec.growth.strengths.length > 0) {
      lines.push("## Strengths");
      for (const s of spec.growth.strengths) lines.push(`- ${s}`);
      lines.push("");
    }
    if (spec.growth.areas.length > 0) {
      lines.push("## Growth Areas");
      for (const a of spec.growth.areas) {
        lines.push(`- ${typeof a === "string" ? a : (a as any).area ?? a}`);
      }
      lines.push("");
    }

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  },
);

// ─── Tool: holomime_autopilot ─────────────────────────────

server.tool(
  "holomime_autopilot",
  "Automated self-triggered alignment. Diagnoses an agent's conversation, checks severity against a threshold, and optionally runs a full alignment session. Returns whether alignment was triggered, diagnosis results, recommendations, and any personality changes.",
  {
    ...personalityShape,
    ...messagesShape,
    provider: z.enum(["anthropic", "openai"]).describe("LLM provider for alignment session").optional(),
    apiKey: z.string().describe("API key for the LLM provider").optional(),
    model: z.string().describe("Model override").optional(),
    threshold: z.enum(["routine", "targeted", "intervention"]).describe("Minimum severity to trigger alignment (default: targeted)").optional(),
    maxTurns: z.number().describe("Maximum session turns (default: 24)").optional(),
    dryRun: z.boolean().describe("If true, only diagnose without running alignment").optional(),
  },
  async ({ personality, messages, provider, apiKey, model, threshold, maxTurns, dryRun }) => {
    const specResult = personalitySpecSchema.safeParse(personality);
    if (!specResult.success) {
      return {
        content: [{ type: "text" as const, text: `Invalid personality spec: ${specResult.error.message}` }],
        isError: true,
      };
    }

    // If not dry-run and no provider/apiKey, we can only do diagnosis
    if (!dryRun && (!provider || !apiKey)) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            error: "provider and apiKey are required for live alignment sessions. Use dryRun: true for diagnosis-only mode.",
          }),
        }],
        isError: true,
      };
    }

    let llmProvider;
    if (provider && apiKey) {
      llmProvider = createProvider({ provider, apiKey, model });
    }

    const result = await runAutopilot(specResult.data, messages, llmProvider!, {
      threshold: (threshold ?? "targeted") as AutopilotThreshold,
      maxTurns: maxTurns ?? 24,
      dryRun: dryRun ?? (!provider || !apiKey),
    });

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          triggered: result.triggered,
          severity: result.severity,
          sessionRan: result.sessionRan,
          diagnosis: {
            patterns: result.diagnosis.patterns.map((p) => ({ id: p.id, name: p.name, severity: p.severity })),
            sessionFocus: result.diagnosis.sessionFocus,
            severity: result.diagnosis.severity,
          },
          recommendations: result.recommendations,
          appliedChanges: result.appliedChanges,
          updatedSpec: result.updatedSpec,
        }, null, 2),
      }],
    };
  },
);

// ─── Tool: holomime_self_audit ────────────────────────────

server.tool(
  "holomime_self_audit",
  "Mid-conversation behavioral self-check. Call this during a conversation to detect if you are falling into problematic patterns (sycophancy, over-apologizing, hedging, error spirals, boundary violations). Returns flags with actionable suggestions for immediate correction. No LLM required — pure rule-based analysis.",
  {
    ...messagesShape,
    personality: z.record(z.string(), z.unknown()).describe("Optional .personality.json spec for personalized audit").optional(),
  },
  async ({ messages, personality }) => {
    const result = runSelfAudit(messages, personality ?? undefined);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      }],
    };
  },
);

// ─── Tool: holomime_observe ──────────────────────────────

server.tool(
  "holomime_observe",
  "Record a behavioral self-observation during a conversation. Call this when you notice yourself falling into a pattern (hedging, over-apologizing, sycophancy, etc.) or when the user's emotional state shifts. Self-observations are stored in persistent behavioral memory and become training signal for future alignment. Returns acknowledgment and any relevant behavioral history.",
  {
    personality: z.record(z.string(), z.unknown()).describe("The .personality.json spec object"),
    observation: z.string().describe("What you noticed about your own behavior (e.g., 'I'm hedging more than usual', 'User seems frustrated, adjusting tone')"),
    patternIds: z.array(z.string()).describe("Relevant pattern IDs: over-apologizing, hedge-stacking, sycophantic-tendency, error-spiral, boundary-violation, negative-skew, register-inconsistency").optional(),
    severity: z.enum(["info", "warning", "concern"]).describe("How severe is this behavioral signal").optional(),
    triggerContext: z.string().describe("What triggered this observation — describe the user message or situation").optional(),
  },
  async ({ personality, observation, patternIds, severity, triggerContext }) => {
    const specResult = personalitySpecSchema.safeParse(personality);
    if (!specResult.success) {
      return {
        content: [{ type: "text" as const, text: `Invalid personality spec: ${specResult.error.message}` }],
        isError: true,
      };
    }

    const agentHandle = agentHandleFromSpec(specResult.data);
    let store = loadBehavioralMemory(agentHandle);
    if (!store) {
      store = createBehavioralMemory(agentHandle, specResult.data.name);
    }

    // Record the self-observation
    const selfObs: SelfObservation = {
      observation,
      patternIds: patternIds ?? [],
      severity: severity ?? "info",
      triggerContext,
    };
    recordSelfObservation(store, selfObs);
    saveBehavioralMemory(store);

    // Return acknowledgment + relevant memory context
    const memorySummary = getBehavioralMemorySummary(store);
    const response: Record<string, unknown> = {
      recorded: true,
      totalObservations: store.totalObservations,
      observation,
    };

    // Include relevant triggers for the reported patterns
    if (patternIds && patternIds.length > 0) {
      const relevantTriggers = store.triggers
        .filter((t) => t.activatesPatterns.some((p) => patternIds!.includes(p)))
        .map((t) => ({
          triggerType: t.triggerType,
          patterns: t.activatesPatterns,
          occurrences: t.occurrences,
          confidence: t.confidence,
        }));
      if (relevantTriggers.length > 0) {
        response.knownTriggers = relevantTriggers;
      }

      // Include best corrections if available
      const corrections = store.corrections
        .filter((c) => patternIds!.includes(c.patternId) && c.effective)
        .sort((a, b) => b.healthDelta - a.healthDelta)
        .slice(0, 2)
        .map((c) => ({ pattern: c.patternId, intervention: c.intervention, healthGain: c.healthDelta }));
      if (corrections.length > 0) {
        response.suggestedCorrections = corrections;
      }
    }

    if (memorySummary) {
      response.behavioralContext = memorySummary;
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(response, null, 2),
      }],
    };
  },
);

// ─── Start Server ──────────────────────────────────────────

export async function startMCPServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// If run directly (not imported), start the server
startMCPServer().catch((err) => {
  console.error("holomime MCP server error:", err);
  process.exit(1);
});
