#!/usr/bin/env node
/**
 * HoloMime MCP Server — exposes diagnose, assess, and profile as MCP tools.
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
  "Analyze conversation messages for behavioral patterns using 7 rule-based detectors. Returns over-apologizing, hedging, sycophancy, boundary violations, error spirals, sentiment skew, and formality issues.",
  messagesShape,
  async ({ messages }) => {
    const result = runDiagnosis(messages);
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

// ─── Start Server ──────────────────────────────────────────

export async function startMCPServer(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// If run directly (not imported), start the server
startMCPServer().catch((err) => {
  console.error("HoloMime MCP server error:", err);
  process.exit(1);
});
