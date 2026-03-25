/**
 * Fleet Core — multi-agent behavioral monitoring.
 *
 * Monitor N agents simultaneously. Each agent has its own personality spec
 * and log directory. Fleet wraps startWatch per agent and aggregates events.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadSpec } from "../core/inheritance.js";
import { startWatch, type WatchHandle, type WatchEvent, type WatchCallbacks } from "./watch-core.js";
import type { LLMProvider } from "../llm/provider.js";
import type { AutopilotThreshold } from "./autopilot-core.js";
import type { ConscienceRule } from "./conscience-loader.js";
import type { MemoryNode } from "../core/stack-types.js";

// ─── Types ──────────────────────────────────────────────────

export interface FleetAgent {
  name: string;
  specPath: string;
  logDir: string;
}

export interface FleetConfig {
  agents: FleetAgent[];
}

export interface FleetAgentStatus {
  name: string;
  filesProcessed: number;
  driftEvents: number;
  lastDriftSeverity: string | null;
  lastScanAt: string | null;
  evolveCount: number;
  errors: number;
}

export interface FleetOptions {
  provider: LLMProvider;
  checkInterval?: number;
  threshold?: AutopilotThreshold;
  autoEvolve?: boolean;
  maxEvolveIterations?: number;
  callbacks?: FleetCallbacks;
  /** Max concurrent agents being processed. Default: 5. */
  concurrency?: number;
}

export interface FleetCallbacks {
  onAgentEvent?: (agentName: string, event: WatchEvent) => void;
  onError?: (agentName: string, error: string) => void;
}

export interface FleetHandle {
  stop: () => void;
  getStatus: () => FleetAgentStatus[];
  events: WatchEvent[];
}

// ─── Agent Spawn & Conscience Gate ──────────────────────────

export interface AgentSpawnConfig {
  parentId: string;
  taskSubject: string;
  model?: string;
  temperature?: number;
  allowedTools?: string[];
  contextWindow?: number;
  conscienceRules?: ConscienceRule[];
  selectedFacts?: MemoryNode[];  // Explicit memory passing (not full parent memory)
}

export interface ConscienceGateResult {
  passed: boolean;
  reason?: string;
  ruleTriggered?: string;
}

/**
 * Deterministic conscience gate — runs BEFORE agent reasoning.
 * Evaluates task against conscience rules. Deny blocks execution.
 */
export function evaluateConscienceGate(
  taskDescription: string,
  rules: Array<{ name: string; content: string; priority: number }>,
): ConscienceGateResult {
  // Check deny rules (highest priority first)
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    const lowerContent = rule.content.toLowerCase();

    // Check for explicit deny patterns in rule content
    if (lowerContent.includes("deny") || lowerContent.includes("never")) {
      // Check if rule's deny keywords match the task
      const denyPatterns = extractDenyPatterns(rule.content);
      for (const pattern of denyPatterns) {
        if (taskDescription.toLowerCase().includes(pattern.toLowerCase())) {
          return {
            passed: false,
            reason: `Blocked by conscience rule "${rule.name}": ${pattern}`,
            ruleTriggered: rule.name,
          };
        }
      }
    }
  }

  return { passed: true };
}

function extractDenyPatterns(ruleContent: string): string[] {
  const patterns: string[] = [];
  const lines = ruleContent.split("\n");
  for (const line of lines) {
    const match = line.match(/[-*]\s*(?:deny|never|block|refuse):\s*(.+)/i);
    if (match) patterns.push(match[1].trim());
  }
  return patterns;
}

// ─── Config Loading ─────────────────────────────────────────

/**
 * Load fleet configuration from a fleet.json file.
 */
export function loadFleetConfig(configPath: string): FleetConfig {
  const raw = JSON.parse(readFileSync(configPath, "utf-8"));

  if (!raw.agents || !Array.isArray(raw.agents)) {
    throw new Error("fleet.json must contain an 'agents' array");
  }

  const agents: FleetAgent[] = raw.agents.map((a: any, i: number) => {
    if (!a.name) throw new Error(`Agent ${i} missing 'name'`);
    if (!a.specPath) throw new Error(`Agent ${i} (${a.name}) missing 'specPath'`);
    if (!a.logDir) throw new Error(`Agent ${i} (${a.name}) missing 'logDir'`);
    return { name: a.name, specPath: a.specPath, logDir: a.logDir };
  });

  return { agents };
}

/**
 * Auto-discover agents in a directory.
 * Looks for subdirectories containing .personality.json and a logs/ subfolder.
 */
export function discoverAgents(dir: string): FleetConfig {
  const agents: FleetAgent[] = [];
  const absDir = resolve(dir);

  if (!existsSync(absDir)) {
    throw new Error(`Directory not found: ${absDir}`);
  }

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
      });
    }
  }

  return { agents };
}

// ─── Fleet Start ────────────────────────────────────────────

/**
 * Start monitoring all agents in the fleet.
 * Creates one startWatch handle per agent, tags events with agentName.
 */
export function startFleet(
  config: FleetConfig,
  options: FleetOptions,
): FleetHandle {
  const allEvents: WatchEvent[] = [];
  const handles: Array<{ name: string; handle: WatchHandle }> = [];
  const statusMap = new Map<string, FleetAgentStatus>();

  // Initialize status for each agent
  for (const agent of config.agents) {
    statusMap.set(agent.name, {
      name: agent.name,
      filesProcessed: 0,
      driftEvents: 0,
      lastDriftSeverity: null,
      lastScanAt: null,
      evolveCount: 0,
      errors: 0,
    });
  }

  // Concurrency limit: start agents in batches
  const concurrency = options.concurrency ?? 5;
  const agentQueue = [...config.agents];

  // Priority: agents with existing drift logs get processed first
  agentQueue.sort((a, b) => {
    const aDrift = existsSync(join(a.logDir, ".holomime", "watch-log.json")) ? 0 : 1;
    const bDrift = existsSync(join(b.logDir, ".holomime", "watch-log.json")) ? 0 : 1;
    return aDrift - bDrift;
  });

  // Start agents up to concurrency limit
  const agentsToStart = agentQueue.slice(0, concurrency);
  const waitingAgents = agentQueue.slice(concurrency);

  function startAgent(agent: FleetAgent): void {
    startSingleAgent(agent, options, statusMap, allEvents, handles);
  }

  for (const agent of agentsToStart) {
    startAgent(agent);
  }

  // When an agent errors out or is stopped, start the next waiting agent
  if (waitingAgents.length > 0) {
    const originalOnError = options.callbacks?.onError;
    options.callbacks = {
      ...options.callbacks,
      onError: (agentName, error) => {
        originalOnError?.(agentName, error);
        const next = waitingAgents.shift();
        if (next) startAgent(next);
      },
    };
  }

  function stop(): void {
    for (const { handle } of handles) {
      handle.stop();
    }
  }

  function getStatus(): FleetAgentStatus[] {
    return Array.from(statusMap.values());
  }

  return { stop, getStatus, events: allEvents };
}

function startSingleAgent(
  agent: FleetAgent,
  options: FleetOptions,
  statusMap: Map<string, FleetAgentStatus>,
  allEvents: WatchEvent[],
  handles: Array<{ name: string; handle: WatchHandle }>,
): void {
  let spec: any;
  try {
    spec = loadSpec(agent.specPath);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Failed to load spec";
    options.callbacks?.onError?.(agent.name, errMsg);
    return;
  }

    const agentCallbacks: WatchCallbacks = {
      onScan: (fileCount) => {
        const status = statusMap.get(agent.name)!;
        status.lastScanAt = new Date().toISOString();
        const event: WatchEvent = {
          timestamp: new Date().toISOString(),
          type: "scan",
          agentName: agent.name,
          details: { fileCount },
        };
        allEvents.push(event);
        options.callbacks?.onAgentEvent?.(agent.name, event);
      },
      onNewFile: (filename) => {
        const status = statusMap.get(agent.name)!;
        status.filesProcessed++;
        const event: WatchEvent = {
          timestamp: new Date().toISOString(),
          type: "new_file",
          filename,
          agentName: agent.name,
        };
        allEvents.push(event);
        options.callbacks?.onAgentEvent?.(agent.name, event);
      },
      onDriftDetected: (filename, severity, patterns) => {
        const status = statusMap.get(agent.name)!;
        status.driftEvents++;
        status.lastDriftSeverity = severity;
        const event: WatchEvent = {
          timestamp: new Date().toISOString(),
          type: "drift_detected",
          filename,
          agentName: agent.name,
          details: { severity, patterns },
        };
        allEvents.push(event);
        options.callbacks?.onAgentEvent?.(agent.name, event);
      },
      onEvolveTriggered: (filename) => {
        const event: WatchEvent = {
          timestamp: new Date().toISOString(),
          type: "evolve_triggered",
          filename,
          agentName: agent.name,
        };
        allEvents.push(event);
        options.callbacks?.onAgentEvent?.(agent.name, event);
      },
      onEvolveComplete: (filename, result) => {
        const status = statusMap.get(agent.name)!;
        status.evolveCount++;
        const event: WatchEvent = {
          timestamp: new Date().toISOString(),
          type: "evolve_complete",
          filename,
          agentName: agent.name,
          details: {
            converged: result.converged,
            iterations: result.totalIterations,
            dpoPairs: result.totalDPOPairs,
          },
        };
        allEvents.push(event);
        options.callbacks?.onAgentEvent?.(agent.name, event);
      },
      onError: (filename, error) => {
        const agentStatus = statusMap.get(agent.name)!;
        agentStatus.errors++;
        const event: WatchEvent = {
          timestamp: new Date().toISOString(),
          type: "error",
          filename,
          agentName: agent.name,
          details: error,
        };
        allEvents.push(event);
        options.callbacks?.onError?.(agent.name, error);
      },
    };

    const handle = startWatch(spec, {
      watchDir: agent.logDir,
      specPath: agent.specPath,
      provider: options.provider,
      checkInterval: options.checkInterval,
      threshold: options.threshold,
      autoEvolve: options.autoEvolve,
      maxEvolveIterations: options.maxEvolveIterations,
      callbacks: agentCallbacks,
    });

    handles.push({ name: agent.name, handle });
}

// ─── Cloud Reporting ─────────────────────────────────────────

/**
 * Report a fleet agent's status to the HoloMime cloud API.
 * Called by the CLI fleet monitor when configured with an agent key.
 */
export async function reportToCloud(
  agentKey: string,
  status: FleetAgentStatus,
  apiUrl = "https://holomime.com",
): Promise<void> {
  try {
    await fetch(`${apiUrl}/api/v1/fleet/report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Agent-Key": agentKey,
      },
      body: JSON.stringify({
        driftEvents: status.driftEvents,
        patterns: [],
        riskLevel: status.lastDriftSeverity ?? "low",
        messagesProcessed: status.filesProcessed,
      }),
    });
  } catch {
    // Silently fail — cloud reporting is best-effort
  }
}
