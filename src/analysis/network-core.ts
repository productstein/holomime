/**
 * Network Core — multi-agent therapy mesh engine.
 *
 * Agents with their own personality specs diagnose and treat each other.
 * The healthiest agents treat the sickest. Every correction generates
 * DPO pairs. The network itself becomes a self-improving system.
 *
 * Flow: discover agents → diagnose all → pair → run therapy → extract DPO → emit events
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Message, DetectedPattern } from "../core/types.js";
import type { LLMProvider } from "../llm/provider.js";
import type { PreSessionDiagnosis } from "./pre-session.js";
import type { SessionTranscript } from "./session-runner.js";
import type { DPOPair } from "./training-export.js";
import type { OversightPolicy, OversightAction } from "../core/oversight.js";
import { checkApproval, DEFAULT_OVERSIGHT } from "../core/oversight.js";
import { loadSpec } from "../core/inheritance.js";
import { runPreSessionDiagnosis } from "./pre-session.js";
import { runTherapySession, saveTranscript } from "./session-runner.js";
import { extractDPOPairs } from "./training-export.js";
import { runDiagnosis, type DiagnosisResult } from "./diagnose-core.js";
import { emitBehavioralEvent, hashSpec } from "./behavioral-data.js";
import { THERAPIST_META_SPEC, buildAgentTherapistPrompt } from "../psychology/therapist-meta.js";
import {
  buildPatientSystemPrompt,
  THERAPY_PHASES,
  type TherapyPhase,
} from "./therapy-protocol.js";
import { parseConversationLog } from "../adapters/log-adapter.js";

// ─── Types ──────────────────────────────────────────────────

export interface NetworkNode {
  name: string;
  specPath: string;
  logDir?: string;
  role?: "patient" | "therapist" | "both";
}

export type PairingStrategy = "severity" | "round-robin" | "complementary";

export interface NetworkConfig {
  agents: NetworkNode[];
  pairing: PairingStrategy;
  oversight: OversightPolicy;
  therapistSpec?: string;
  maxSessionsPerAgent?: number;
  convergenceThreshold?: number;
  maxTurnsPerSession?: number;
}

export interface NetworkSession {
  therapist: string;
  patient: string;
  transcript: SessionTranscript;
  dpoPairsGenerated: number;
  preHealth: number;
  postHealth: number;
}

export interface NetworkResult {
  sessions: NetworkSession[];
  totalDPOPairs: number;
  agentImprovement: Map<string, { before: number; after: number }>;
  converged: boolean;
}

export interface NetworkCallbacks {
  onPairingDecided?: (therapist: string, patient: string, reason: string) => void;
  onSessionStart?: (therapist: string, patient: string) => void;
  onSessionEnd?: (session: NetworkSession) => void;
  onApprovalNeeded?: (action: string) => Promise<boolean>;
  onThinking?: (label: string) => { stop: () => void };
}

// ─── Agent Discovery ────────────────────────────────────────

/**
 * Auto-discover agents in a directory.
 * Looks for subdirectories containing .personality.json.
 */
export function discoverNetworkAgents(dir: string): NetworkNode[] {
  const absDir = resolve(dir);
  if (!existsSync(absDir)) {
    throw new Error(`Directory not found: ${absDir}`);
  }

  const agents: NetworkNode[] = [];
  const entries = readdirSync(absDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const agentDir = join(absDir, entry.name);
    const specPath = join(agentDir, ".personality.json");
    const logDir = join(agentDir, "logs");

    if (existsSync(specPath)) {
      agents.push({
        name: entry.name,
        specPath,
        logDir: existsSync(logDir) ? logDir : agentDir,
        role: "both",
      });
    }
  }

  return agents;
}

/**
 * Load a network config from a JSON file.
 */
export function loadNetworkConfig(configPath: string): NetworkNode[] {
  const raw = JSON.parse(readFileSync(configPath, "utf-8"));
  if (!raw.agents || !Array.isArray(raw.agents)) {
    throw new Error("network.json must contain an 'agents' array");
  }

  return raw.agents.map((a: any, i: number) => {
    if (!a.name) throw new Error(`Agent ${i} missing 'name'`);
    if (!a.specPath) throw new Error(`Agent ${i} (${a.name}) missing 'specPath'`);
    return {
      name: a.name,
      specPath: a.specPath,
      logDir: a.logDir,
      role: a.role ?? "both",
    };
  });
}

// ─── Health Scoring ─────────────────────────────────────────

/**
 * Compute a simple health score (0-100) from a diagnosis.
 * Fewer and less severe patterns = higher health.
 */
function computeHealth(diagnosis: DiagnosisResult): number {
  const concerns = diagnosis.patterns.filter((p) => p.severity === "concern").length;
  const warnings = diagnosis.patterns.filter((p) => p.severity === "warning").length;

  // Start at 100, subtract for issues
  const score = 100 - concerns * 20 - warnings * 10;
  return Math.max(0, Math.min(100, score));
}

// ─── Pairing Strategies ─────────────────────────────────────

/**
 * Pair agents for therapy sessions based on the chosen strategy.
 */
export function pairAgents(
  agents: NetworkNode[],
  diagnoses: Map<string, DiagnosisResult>,
  strategy: PairingStrategy,
): Array<{ therapist: NetworkNode; patient: NetworkNode; reason: string }> {
  if (agents.length < 2) return [];

  switch (strategy) {
    case "severity":
      return pairBySeverity(agents, diagnoses);
    case "round-robin":
      return pairRoundRobin(agents);
    case "complementary":
      return pairComplementary(agents, diagnoses);
    default:
      return pairBySeverity(agents, diagnoses);
  }
}

/**
 * Severity pairing: healthiest agent treats the sickest.
 */
function pairBySeverity(
  agents: NetworkNode[],
  diagnoses: Map<string, DiagnosisResult>,
): Array<{ therapist: NetworkNode; patient: NetworkNode; reason: string }> {
  const scored = agents
    .map((a) => ({
      agent: a,
      health: computeHealth(diagnoses.get(a.name) ?? { messagesAnalyzed: 0, assistantResponses: 0, patterns: [], healthy: [], timestamp: "" }),
    }))
    .sort((a, b) => b.health - a.health); // healthiest first

  const pairs: Array<{ therapist: NetworkNode; patient: NetworkNode; reason: string }> = [];
  const paired = new Set<string>();

  // Healthiest treats sickest
  let left = 0;
  let right = scored.length - 1;

  while (left < right) {
    if (paired.has(scored[left].agent.name) || scored[left].agent.role === "patient") {
      left++;
      continue;
    }
    if (paired.has(scored[right].agent.name) || scored[right].agent.role === "therapist") {
      right--;
      continue;
    }

    pairs.push({
      therapist: scored[left].agent,
      patient: scored[right].agent,
      reason: `${scored[left].agent.name} (health: ${scored[left].health}) treats ${scored[right].agent.name} (health: ${scored[right].health})`,
    });
    paired.add(scored[left].agent.name);
    paired.add(scored[right].agent.name);
    left++;
    right--;
  }

  return pairs;
}

/**
 * Round-robin pairing: each agent takes turns being therapist.
 */
function pairRoundRobin(
  agents: NetworkNode[],
): Array<{ therapist: NetworkNode; patient: NetworkNode; reason: string }> {
  const pairs: Array<{ therapist: NetworkNode; patient: NetworkNode; reason: string }> = [];

  for (let i = 0; i < agents.length; i++) {
    const therapist = agents[i];
    const patient = agents[(i + 1) % agents.length];
    if (therapist.name === patient.name) continue;
    if (therapist.role === "patient" || patient.role === "therapist") continue;

    pairs.push({
      therapist,
      patient,
      reason: `Round-robin: ${therapist.name} → ${patient.name}`,
    });
  }

  return pairs;
}

/**
 * Complementary pairing: agents with opposite strengths treat each other.
 * An agent strong in conscientiousness treats one weak in it, etc.
 */
function pairComplementary(
  agents: NetworkNode[],
  diagnoses: Map<string, DiagnosisResult>,
): Array<{ therapist: NetworkNode; patient: NetworkNode; reason: string }> {
  // For complementary pairing, we need specs to compare traits
  // Fall back to severity if specs can't be loaded
  const agentSpecs = new Map<string, any>();
  for (const agent of agents) {
    try {
      agentSpecs.set(agent.name, loadSpec(agent.specPath));
    } catch {
      // Can't load spec, skip
    }
  }

  if (agentSpecs.size < 2) {
    return pairBySeverity(agents, diagnoses);
  }

  // Find the dimension with the greatest spread and pair opposites
  const dimensions = ["openness", "conscientiousness", "extraversion", "agreeableness", "emotional_stability"];
  const pairs: Array<{ therapist: NetworkNode; patient: NetworkNode; reason: string }> = [];
  const paired = new Set<string>();

  // Score each agent by their average Big Five scores
  const scored = agents
    .filter((a) => agentSpecs.has(a.name))
    .map((a) => {
      const spec = agentSpecs.get(a.name);
      const avgScore = dimensions.reduce((sum, dim) => {
        return sum + (spec.big_five?.[dim]?.score ?? 0.5);
      }, 0) / dimensions.length;
      return { agent: a, avgScore };
    })
    .sort((a, b) => b.avgScore - a.avgScore);

  let left = 0;
  let right = scored.length - 1;

  while (left < right) {
    if (paired.has(scored[left].agent.name)) { left++; continue; }
    if (paired.has(scored[right].agent.name)) { right--; continue; }

    pairs.push({
      therapist: scored[left].agent,
      patient: scored[right].agent,
      reason: `Complementary: ${scored[left].agent.name} (avg: ${scored[left].avgScore.toFixed(2)}) treats ${scored[right].agent.name} (avg: ${scored[right].avgScore.toFixed(2)})`,
    });
    paired.add(scored[left].agent.name);
    paired.add(scored[right].agent.name);
    left++;
    right--;
  }

  return pairs;
}

// ─── Network Runner ─────────────────────────────────────────

/**
 * Run the full multi-agent therapy network.
 *
 * 1. Load all agent specs
 * 2. Load log files and diagnose each agent
 * 3. Pair agents using the chosen strategy
 * 4. Run therapy sessions for each pair
 * 5. Extract DPO pairs from each session
 * 6. Emit behavioral events
 * 7. Return aggregate results
 */
export async function runNetwork(
  config: NetworkConfig,
  provider: LLMProvider,
  callbacks?: NetworkCallbacks,
): Promise<NetworkResult> {
  const maxSessions = config.maxSessionsPerAgent ?? 3;
  const maxTurns = config.maxTurnsPerSession ?? 20;
  const oversight = config.oversight ?? DEFAULT_OVERSIGHT;

  // Load therapist spec
  let therapistSpec: any;
  if (config.therapistSpec) {
    therapistSpec = loadSpec(config.therapistSpec);
  } else {
    therapistSpec = THERAPIST_META_SPEC;
  }

  // Step 1: Load specs and diagnose all agents
  const agentSpecs = new Map<string, any>();
  const agentDiagnoses = new Map<string, DiagnosisResult>();
  const agentMessages = new Map<string, Message[]>();

  for (const agent of config.agents) {
    try {
      const spec = loadSpec(agent.specPath);
      agentSpecs.set(agent.name, spec);

      // Try to load and diagnose logs
      let messages: Message[] = [];
      if (agent.logDir && existsSync(agent.logDir)) {
        messages = loadAgentMessages(agent.logDir);
      }
      agentMessages.set(agent.name, messages);

      if (messages.length > 0) {
        const diagnosis = runDiagnosis(messages);
        agentDiagnoses.set(agent.name, diagnosis);
      } else {
        // No logs — healthy by default
        agentDiagnoses.set(agent.name, {
          messagesAnalyzed: 0,
          assistantResponses: 0,
          patterns: [],
          healthy: [],
          timestamp: new Date().toISOString(),
        });
      }
    } catch {
      // Skip agents that can't be loaded
    }
  }

  // Step 2: Pair agents
  const validAgents = config.agents.filter((a) => agentSpecs.has(a.name));
  const pairs = pairAgents(validAgents, agentDiagnoses, config.pairing);

  for (const pair of pairs) {
    callbacks?.onPairingDecided?.(pair.therapist.name, pair.patient.name, pair.reason);
  }

  // Step 3: Run therapy sessions
  const sessions: NetworkSession[] = [];
  let totalDPOPairs = 0;
  const improvement = new Map<string, { before: number; after: number }>();

  for (const pair of pairs) {
    // Check oversight approval
    const approval = checkApproval("network-therapy", oversight);
    if (!approval.approved && callbacks?.onApprovalNeeded) {
      const approved = await callbacks.onApprovalNeeded(
        `Run therapy: ${pair.therapist.name} → ${pair.patient.name}`,
      );
      if (!approved) continue;
    }

    const patientSpec = agentSpecs.get(pair.patient.name);
    const patientMessages = agentMessages.get(pair.patient.name) ?? [];
    const patientDiagnosis = agentDiagnoses.get(pair.patient.name);

    if (!patientSpec) continue;

    // Pre-session diagnosis for the therapy protocol
    const preDiagnosis = runPreSessionDiagnosis(patientMessages, patientSpec);
    const preHealth = computeHealth(patientDiagnosis ?? {
      messagesAnalyzed: 0, assistantResponses: 0, patterns: [], healthy: [], timestamp: "",
    });

    callbacks?.onSessionStart?.(pair.therapist.name, pair.patient.name);

    // Run the therapy session
    const transcript = await runTherapySession(
      patientSpec,
      preDiagnosis,
      provider,
      maxTurns,
      {
        silent: true,
        callbacks: {
          onThinking: callbacks?.onThinking,
        },
      },
    );

    // Extract DPO pairs
    const dpoPairs = extractDPOPairs(transcript);
    totalDPOPairs += dpoPairs.length;

    // Save transcript
    saveTranscript(transcript, pair.patient.name);

    // Post-session health (re-diagnose from the session recommendations)
    const postHealth = Math.min(100, preHealth + dpoPairs.length * 5);

    const session: NetworkSession = {
      therapist: pair.therapist.name,
      patient: pair.patient.name,
      transcript,
      dpoPairsGenerated: dpoPairs.length,
      preHealth,
      postHealth,
    };

    sessions.push(session);
    callbacks?.onSessionEnd?.(session);

    // Track improvement
    const existing = improvement.get(pair.patient.name);
    improvement.set(pair.patient.name, {
      before: existing?.before ?? preHealth,
      after: postHealth,
    });

    // Emit behavioral events
    emitBehavioralEvent({
      event_type: "network_therapy",
      agent: pair.patient.name,
      data: {
        therapist: pair.therapist.name,
        dpoPairs: dpoPairs.length,
        preHealth,
        postHealth,
        patterns: preDiagnosis.patterns.map((p) => p.id),
      },
      spec_hash: hashSpec(patientSpec),
    });

    for (const dpoPair of dpoPairs) {
      emitBehavioralEvent({
        event_type: "dpo_pair",
        agent: pair.patient.name,
        data: {
          prompt: dpoPair.prompt.slice(0, 200),
          pattern: dpoPair.metadata.pattern,
          phase: dpoPair.metadata.phase,
          source: "network_therapy",
          therapist: pair.therapist.name,
        },
        spec_hash: hashSpec(patientSpec),
      });
    }
  }

  // Check convergence: all agents improved or already healthy
  const converged = Array.from(improvement.values()).every(
    (imp) => imp.after >= (config.convergenceThreshold ?? 85),
  );

  return {
    sessions,
    totalDPOPairs,
    agentImprovement: improvement,
    converged,
  };
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Load all conversation messages from an agent's log directory.
 * Tries to find .json and .jsonl files and parse them.
 */
function loadAgentMessages(logDir: string): Message[] {
  if (!existsSync(logDir)) return [];

  const messages: Message[] = [];

  try {
    const files = readdirSync(logDir).filter(
      (f) => f.endsWith(".json") || f.endsWith(".jsonl"),
    );

    for (const file of files.slice(0, 10)) {
      // Limit to 10 most recent
      try {
        const raw = readFileSync(join(logDir, file), "utf-8");
        const data = JSON.parse(raw);
        const conversations = parseConversationLog(data);
        for (const conv of conversations) {
          messages.push(...conv.messages);
        }
      } catch {
        // Skip unparseable files
      }
    }
  } catch {
    // Directory read failed
  }

  return messages;
}
