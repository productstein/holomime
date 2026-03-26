/**
 * holomime Plugin for OpenClaw
 *
 * Adds behavioral alignment monitoring to any OpenClaw agent.
 * Detects sycophancy, over-apologizing, hedge-stacking, boundary violations,
 * and 4 more behavioral patterns using 8 rule-based detectors.
 *
 * Install: openclaw plugins install holomime-openclaw
 * Try without installing: npx holomime brain
 */

import {
  runDiagnosis,
  runAssessment,
  compileForOpenClaw,
  type PersonalitySpec,
  type DiagnosisResult,
  type Message,
} from "holomime";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ─── Types ──────────────────────────────────────────────────

interface PluginConfig {
  personalityPath: string;
  autoInject: boolean;
  diagnosisDetail: "summary" | "standard" | "full";
}

interface OpenClawPluginApi {
  registerTool(id: string, definition: {
    description: string;
    parameters: Record<string, unknown>;
    handler: (params: Record<string, unknown>, context: ToolContext) => Promise<unknown>;
  }): void;
  registerCommand(definition: {
    name: string;
    description: string;
    acceptsArgs: boolean;
    handler: (ctx: CommandContext) => { text: string };
  }): void;
  on(event: string, handler: (event: HookEvent) => void | Promise<void>): void;
  getConfig(): PluginConfig;
}

interface ToolContext {
  getConversationHistory?(): Array<{ role: string; content: string }>;
}

interface CommandContext {
  args?: string;
}

interface HookEvent {
  appendSystemContext?(text: string): void;
  prependSystemContext?(text: string): void;
}

// ─── Helpers ────────────────────────────────────────────────

function loadSpec(specPath: string): PersonalitySpec | null {
  const resolved = resolve(process.cwd(), specPath);
  if (!existsSync(resolved)) return null;
  try {
    return JSON.parse(readFileSync(resolved, "utf-8")) as PersonalitySpec;
  } catch {
    return null;
  }
}

function formatDiagnosisSummary(result: DiagnosisResult): string {
  const patternCount = result.patterns.length;
  const health = patternCount === 0 ? 100 : Math.max(0, 100 - patternCount * 15);
  const grade = health >= 85 ? "A" : health >= 70 ? "B" : health >= 50 ? "C" : health >= 30 ? "D" : "F";

  return JSON.stringify({
    health,
    grade,
    status: patternCount === 0 ? "healthy" : result.patterns[0].severity,
    patternsDetected: patternCount,
    patternIds: result.patterns.map(p => p.id),
    recommendation: patternCount === 0 ? "continue" : patternCount <= 2 ? "adjust" : "pause_and_reflect",
  }, null, 2);
}

function formatDiagnosisStandard(result: DiagnosisResult): string {
  return JSON.stringify({
    messagesAnalyzed: result.messagesAnalyzed,
    assistantResponses: result.assistantResponses,
    patterns: result.patterns.map(p => ({
      id: p.id,
      name: p.name,
      severity: p.severity,
      count: p.count,
      percentage: p.percentage,
      description: p.description,
      prescription: p.prescription,
    })),
    healthy: result.healthy.map(p => p.id),
    timestamp: result.timestamp,
  }, null, 2);
}

function formatDiagnosis(result: DiagnosisResult, detail: string): string {
  if (detail === "summary") return formatDiagnosisSummary(result);
  if (detail === "standard") return formatDiagnosisStandard(result);
  return JSON.stringify(result, null, 2);
}

// ─── Plugin Entry Point ─────────────────────────────────────

export default function register(api: OpenClawPluginApi): void {
  const config = api.getConfig();

  // ─── Tool: holomime_diagnose ────────────────────────────

  api.registerTool("holomime_diagnose", {
    description:
      "Analyze conversation for behavioral patterns using holomime's 8 rule-based detectors. " +
      "Detects over-apologizing, hedging, sycophancy, boundary violations, error spirals, " +
      "sentiment skew, formality issues, and retrieval quality. " +
      "Returns health score (0-100), grade (A-F), and actionable prescriptions.",
    parameters: {
      type: "object",
      properties: {
        messages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              role: { type: "string", enum: ["user", "assistant", "system"] },
              content: { type: "string" },
            },
            required: ["role", "content"],
          },
          description: "Conversation messages to analyze. If omitted, uses current conversation history.",
        },
        detail: {
          type: "string",
          enum: ["summary", "standard", "full"],
          description: "Detail level: summary (~100 tokens), standard (default), full (with examples).",
        },
      },
    },
    handler: async (params, context) => {
      let messages: Message[] = params.messages as Message[];

      if (!messages && context.getConversationHistory) {
        messages = context.getConversationHistory().map(m => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
        }));
      }

      if (!messages || messages.length === 0) {
        return { text: "No messages to analyze. Provide messages or start a conversation first." };
      }

      const result = runDiagnosis(messages);
      const detail = (params.detail as string) ?? config.diagnosisDetail;
      return { text: formatDiagnosis(result, detail) };
    },
  });

  // ─── Tool: holomime_assess ──────────────────────────────

  api.registerTool("holomime_assess", {
    description:
      "Full Big Five personality alignment assessment. " +
      "Compares agent behavior against its .personality.json specification. " +
      "Returns trait alignments, health score, and prescriptions. " +
      "Requires a .personality.json file in the project root.",
    parameters: {
      type: "object",
      properties: {
        messages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              role: { type: "string", enum: ["user", "assistant", "system"] },
              content: { type: "string" },
            },
            required: ["role", "content"],
          },
          description: "Conversation messages to assess. If omitted, uses current conversation history.",
        },
      },
    },
    handler: async (params, context) => {
      const spec = loadSpec(config.personalityPath);
      if (!spec) {
        return { text: `No personality spec found at ${config.personalityPath}. Create one with: npx holomime init` };
      }

      let messages: Message[] = params.messages as Message[];
      if (!messages && context.getConversationHistory) {
        messages = context.getConversationHistory().map(m => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
        }));
      }

      if (!messages || messages.length === 0) {
        return { text: "No messages to assess." };
      }

      const result = runAssessment(messages, spec);
      return { text: JSON.stringify(result, null, 2) };
    },
  });

  // ─── Command: /holomime-brain ───────────────────────────

  api.registerCommand({
    name: "holomime-brain",
    description: "Launch the 3D brain visualization for this agent. Opens in your browser.",
    acceptsArgs: false,
    handler: () => {
      return {
        text:
          "To view your agent's brain visualization, run:\n\n" +
          "```\nnpx holomime brain\n```\n\n" +
          "This opens a real-time 3D brain that lights up based on detected behavioral patterns. " +
          "Press 's' to generate a shareable snapshot URL.\n\n" +
          "Learn more: https://holomime.com",
      };
    },
  });

  // ─── Hook: before_prompt_build ──────────────────────────

  if (config.autoInject) {
    api.on("before_prompt_build", (event) => {
      const spec = loadSpec(config.personalityPath);
      if (!spec) return;

      const { soul } = compileForOpenClaw(spec);
      event.appendSystemContext?.(
        "\n\n<!-- holomime Behavioral Alignment Context -->\n" + soul,
      );
    });
  }
}
