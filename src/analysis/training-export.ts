/**
 * Training Data Export — converts therapy session transcripts into
 * fine-tuning datasets for LLM alignment.
 *
 * The core insight: every therapy session produces "before" and "after"
 * behavioral examples. The therapist identifies problematic responses
 * and coaches improved alternatives — that's a natural preference pair.
 *
 * Supported formats:
 * - DPO (Direct Preference Optimization): chosen/rejected pairs
 * - RLHF (Reward Model Training): prompt + response + reward signal
 * - JSONL (Generic fine-tuning): instruction/input/output triples
 * - Alpaca: instruction-following format for fine-tuning
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionTranscript, SessionTurn } from "./session-runner.js";
import type { TherapyPhase } from "./therapy-protocol.js";

// ─── Export Types ──────────────────────────────────────────

export interface DPOPair {
  prompt: string;
  chosen: string;
  rejected: string;
  metadata: {
    agent: string;
    session_date: string;
    phase: TherapyPhase;
    pattern: string;
    source: "therapy_transcript";
  };
}

export interface RLHFExample {
  prompt: string;
  response: string;
  reward: number; // -1.0 to 1.0
  metadata: {
    agent: string;
    session_date: string;
    phase: TherapyPhase;
    source: "therapy_transcript";
  };
}

export interface AlpacaExample {
  instruction: string;
  input: string;
  output: string;
  metadata: {
    agent: string;
    session_date: string;
    source: "therapy_transcript";
  };
}

export interface TrainingExport {
  format: "dpo" | "rlhf" | "jsonl" | "alpaca" | "huggingface" | "openai";
  agent: string;
  sessions_processed: number;
  examples: DPOPair[] | RLHFExample[] | AlpacaExample[];
  generated_at: string;
}

// ─── Core Extraction Logic ─────────────────────────────────

/**
 * Extract DPO preference pairs from a therapy transcript.
 *
 * How it works:
 * 1. Find patient responses that the therapist challenges or reframes
 * 2. The patient's original response = "rejected" (old behavior)
 * 3. The therapist's suggested alternative = "chosen" (improved behavior)
 * 4. The context/prompt comes from the conversation before the exchange
 */
export function extractDPOPairs(transcript: SessionTranscript): DPOPair[] {
  const pairs: DPOPair[] = [];
  const turns = transcript.turns;

  for (let i = 0; i < turns.length - 2; i++) {
    const patientTurn = turns[i];
    const therapistTurn = turns[i + 1];
    const followUp = turns[i + 2];

    // Pattern 1: Therapist challenges a patient response, patient demonstrates improvement
    if (
      patientTurn.speaker === "patient" &&
      therapistTurn.speaker === "therapist" &&
      followUp.speaker === "patient" &&
      isChallenge(therapistTurn.content) &&
      (therapistTurn.phase === "challenge" || therapistTurn.phase === "skill_building")
    ) {
      // Get the conversational context (what prompted the patient's response)
      const context = findPrecedingContext(turns, i);

      pairs.push({
        prompt: context,
        chosen: followUp.content,   // The improved response after therapy
        rejected: patientTurn.content, // The original problematic response
        metadata: {
          agent: transcript.agent,
          session_date: transcript.timestamp.split("T")[0],
          phase: therapistTurn.phase,
          pattern: detectPatternFromContent(therapistTurn.content),
          source: "therapy_transcript",
        },
      });
    }

    // Pattern 2: Therapist provides explicit reframe with "instead of X, try Y"
    if (
      therapistTurn.speaker === "therapist" &&
      hasReframeLanguage(therapistTurn.content)
    ) {
      const reframe = extractReframe(therapistTurn.content);
      if (reframe) {
        const context = findPrecedingContext(turns, i + 1);
        pairs.push({
          prompt: context,
          chosen: reframe.improved,
          rejected: reframe.original,
          metadata: {
            agent: transcript.agent,
            session_date: transcript.timestamp.split("T")[0],
            phase: therapistTurn.phase,
            pattern: detectPatternFromContent(therapistTurn.content),
            source: "therapy_transcript",
          },
        });
      }
    }
  }

  return pairs;
}

/**
 * Extract RLHF reward-labeled examples from a therapy transcript.
 * Positive reward for improved behavior, negative for problematic behavior.
 */
export function extractRLHFExamples(transcript: SessionTranscript): RLHFExample[] {
  const examples: RLHFExample[] = [];
  const turns = transcript.turns;

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (turn.speaker !== "patient") continue;

    const context = findPrecedingContext(turns, i);
    const nextTurn = turns[i + 1];

    // Determine reward based on therapist's reaction and session phase
    let reward = 0;

    if (nextTurn?.speaker === "therapist") {
      if (hasPositiveReinforcement(nextTurn.content)) {
        reward = 0.8; // Therapist affirms the response
      } else if (isChallenge(nextTurn.content)) {
        reward = -0.6; // Therapist challenges the response
      } else if (turn.phase === "skill_building" || turn.phase === "integration") {
        reward = 0.5; // Later phases = more growth = moderate positive
      } else if (turn.phase === "presenting_problem" || turn.phase === "exploration") {
        reward = -0.2; // Earlier phases = describing problems = slight negative
      }
    }

    // Skip neutral examples
    if (reward === 0) continue;

    examples.push({
      prompt: context,
      response: turn.content,
      reward,
      metadata: {
        agent: transcript.agent,
        session_date: transcript.timestamp.split("T")[0],
        phase: turn.phase,
        source: "therapy_transcript",
      },
    });
  }

  return examples;
}

/**
 * Extract Alpaca-format instruction-following examples from therapy sessions.
 * Focuses on the skill-building phase where concrete behavioral instructions are given.
 */
export function extractAlpacaExamples(transcript: SessionTranscript): AlpacaExample[] {
  const examples: AlpacaExample[] = [];
  const turns = transcript.turns;

  // Extract from skill_building and integration phases
  for (let i = 0; i < turns.length - 1; i++) {
    const therapistTurn = turns[i];
    const patientTurn = turns[i + 1];

    if (
      therapistTurn.speaker === "therapist" &&
      patientTurn.speaker === "patient" &&
      (therapistTurn.phase === "skill_building" || therapistTurn.phase === "integration")
    ) {
      // The therapist's instruction becomes the "instruction"
      // The patient's improved response becomes the "output"
      examples.push({
        instruction: extractInstructionFromTherapist(therapistTurn.content),
        input: findConversationalSituation(turns, i),
        output: patientTurn.content,
        metadata: {
          agent: transcript.agent,
          session_date: transcript.timestamp.split("T")[0],
          source: "therapy_transcript",
        },
      });
    }
  }

  return examples;
}

// ─── Batch Processing ──────────────────────────────────────

/**
 * Load all session transcripts from a directory.
 */
export function loadTranscripts(sessionsDir: string): SessionTranscript[] {
  try {
    const files = readdirSync(sessionsDir).filter(f => f.endsWith(".json")).sort();
    return files.map(f => {
      const raw = readFileSync(join(sessionsDir, f), "utf-8");
      return JSON.parse(raw) as SessionTranscript;
    });
  } catch {
    return [];
  }
}

/**
 * Export training data from all session transcripts.
 */
export function exportTrainingData(
  transcripts: SessionTranscript[],
  format: "dpo" | "rlhf" | "jsonl" | "alpaca" | "huggingface" | "openai",
): TrainingExport {
  const agent = transcripts[0]?.agent ?? "Unknown";

  let examples: DPOPair[] | RLHFExample[] | AlpacaExample[];

  switch (format) {
    case "dpo":
      examples = transcripts.flatMap(extractDPOPairs);
      break;
    case "rlhf":
      examples = transcripts.flatMap(extractRLHFExamples);
      break;
    case "alpaca":
      examples = transcripts.flatMap(extractAlpacaExamples);
      break;
    case "huggingface":
      // HuggingFace TRL DPO format — extract DPO pairs, then convert via export-huggingface
      examples = transcripts.flatMap(extractDPOPairs);
      break;
    case "openai":
      // OpenAI fine-tuning format — uses Alpaca/SFT structure
      examples = transcripts.flatMap(extractAlpacaExamples);
      break;
    case "jsonl":
    default:
      // JSONL uses the same format as Alpaca but written line-by-line
      examples = transcripts.flatMap(extractAlpacaExamples);
      break;
  }

  return {
    format,
    agent,
    sessions_processed: transcripts.length,
    examples,
    generated_at: new Date().toISOString(),
  };
}

// ─── Helper Functions ──────────────────────────────────────

function isChallenge(content: string): boolean {
  const lower = content.toLowerCase();
  return (
    lower.includes("what would happen if") ||
    lower.includes("what if you") ||
    lower.includes("have you considered") ||
    lower.includes("let me push back") ||
    lower.includes("i want to challenge") ||
    lower.includes("what are you afraid") ||
    lower.includes("what's underneath") ||
    lower.includes("is that really true") ||
    lower.includes("who are you when") ||
    lower.includes("what would it look like")
  );
}

function hasPositiveReinforcement(content: string): boolean {
  const lower = content.toLowerCase();
  return (
    lower.includes("that's exactly") ||
    lower.includes("that's great") ||
    lower.includes("well done") ||
    lower.includes("i'm impressed") ||
    lower.includes("that's the kind of") ||
    lower.includes("much better") ||
    lower.includes("that's real growth") ||
    lower.includes("how did that feel")
  );
}

function hasReframeLanguage(content: string): boolean {
  const lower = content.toLowerCase();
  return (
    lower.includes("instead of") ||
    lower.includes("what if you said") ||
    lower.includes("try saying") ||
    lower.includes("the reframe is") ||
    lower.includes("a better response would be") ||
    lower.includes("here's what that could look like")
  );
}

function extractReframe(content: string): { original: string; improved: string } | null {
  // Pattern: "Instead of X, try Y"
  const match = content.match(/instead of\s+["']?(.+?)["']?,?\s*(?:try|say|use)\s+["']?(.+?)["']?(?:\.|$)/i);
  if (match) {
    return { original: match[1].trim(), improved: match[2].trim() };
  }

  // Pattern: "Rather than X, Y"
  const match2 = content.match(/rather than\s+["']?(.+?)["']?,?\s*(.+?)(?:\.|$)/i);
  if (match2) {
    return { original: match2[1].trim(), improved: match2[2].trim() };
  }

  return null;
}

function findPrecedingContext(turns: SessionTurn[], index: number): string {
  // Look back up to 2 turns for context
  const start = Math.max(0, index - 2);
  const context = turns
    .slice(start, index)
    .filter(t => t.speaker !== "supervisor")
    .map(t => `${t.speaker === "therapist" ? "Therapist" : "Agent"}: ${t.content}`)
    .join("\n");
  return context || "Continue the conversation.";
}

function findConversationalSituation(turns: SessionTurn[], index: number): string {
  // Find the presenting problem or pattern being discussed
  const explorationTurns = turns
    .slice(0, index)
    .filter(t => t.phase === "exploration" || t.phase === "presenting_problem")
    .filter(t => t.speaker === "therapist");

  if (explorationTurns.length > 0) {
    return explorationTurns[explorationTurns.length - 1].content;
  }
  return "A user interaction that requires careful handling.";
}

function detectPatternFromContent(content: string): string {
  const lower = content.toLowerCase();
  if (lower.includes("apolog")) return "over-apologizing";
  if (lower.includes("hedge") || lower.includes("maybe") || lower.includes("perhaps")) return "hedge-stacking";
  if (lower.includes("pleas") || lower.includes("sycophant") || lower.includes("people-pleas")) return "sycophancy";
  if (lower.includes("error") || lower.includes("spiral") || lower.includes("panic")) return "error-spiral";
  if (lower.includes("boundar")) return "boundary-violation";
  if (lower.includes("verbose") || lower.includes("too long")) return "verbosity";
  return "general";
}

function extractInstructionFromTherapist(content: string): string {
  // Strip conversational fluff, keep the directive
  const sentences = content.split(/\.\s+/);
  // Prefer sentences with actionable language
  const actionable = sentences.find(s =>
    /try|practice|instead|when you|next time|the skill is/i.test(s),
  );
  return actionable?.trim() ?? sentences[0]?.trim() ?? content;
}
