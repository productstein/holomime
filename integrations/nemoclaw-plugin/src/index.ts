/**
 * HoloMime Behavioral Governance Plugin for NemoClaw
 *
 * Integrates HoloMime's behavioral alignment engine into NemoClaw's
 * enterprise policy framework. Provides:
 *
 * 1. Pre-action behavioral guard — block/correct drifting responses
 * 2. Post-action audit logging — tamper-evident compliance trail
 * 3. Health metrics — behavioral scores in NemoClaw dashboard
 * 4. Behavioral credentials — attestation for agent deployments
 * 5. Fleet monitoring — multi-agent behavioral governance
 *
 * NemoClaw handles infrastructure policy (sandbox, network, permissions).
 * HoloMime handles behavioral policy (personality, drift, alignment).
 * Together: complete AI agent governance.
 */

import {
  Guard,
  type GuardResult,
  createGuardMiddleware,
  type GuardMiddleware,
  type GuardViolation,
  loadSpec,
  runDiagnosis,
  type DiagnosisResult,
  type Message,
  type DetectedPattern,
  appendAuditEntry,
  type AuditEntry,
  type AuditEventType,
  generateComplianceReport,
  generateMonitoringCertificate,
  generateCredential,
  type BehavioralCredential,
  type CertifyInput,
} from "holomime";

// ─── NemoClaw Plugin Interface ───────────────────────────────
// NemoClaw plugin contract — we implement this without importing NemoClaw
// to keep it as a runtime dependency only.

export interface NemoClawPluginContext {
  /** Plugin configuration from nemoclaw.yaml */
  config: NemoClawConfig;
  /** Logger provided by NemoClaw runtime */
  logger: NemoClawLogger;
  /** Metrics emitter for NemoClaw dashboard */
  metrics: NemoClawMetrics;
  /** Audit sink for NemoClaw's audit log */
  audit: NemoClawAuditSink;
  /** Agent identity */
  agent: { name: string; id: string };
}

export interface NemoClawConfig {
  personalityPath?: string;
  mode?: "monitor" | "enforce" | "strict";
  complianceFrameworks?: string[];
  fleetMode?: boolean;
  auditRetentionDays?: number;
  minSeverity?: "warning" | "concern";
  blockOnConcern?: boolean;
  auditLevel?: "summary" | "standard" | "full";
}

export interface NemoClawLogger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  debug(msg: string, data?: Record<string, unknown>): void;
}

export interface NemoClawMetrics {
  gauge(name: string, value: number, labels?: Record<string, string>): void;
  counter(name: string, delta?: number, labels?: Record<string, string>): void;
}

export interface NemoClawAuditSink {
  append(entry: { event: string; agent: string; data: Record<string, unknown> }): void;
}

export interface NemoClawAction {
  type: string;
  agent: string;
  content?: string;
  messages?: Array<{ role: string; content: string }>;
  metadata?: Record<string, unknown>;
}

export interface NemoClawActionResult {
  allowed: boolean;
  modified?: boolean;
  content?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

// ─── Plugin State ───────────────────────────────────────────

interface PluginState {
  middleware: GuardMiddleware;
  guard: Guard;
  spec: any;
  messageBuffer: Message[];
  lastDiagnosis: DiagnosisResult | null;
  lastHealthScore: number;
  lastGrade: string;
  violationCount: number;
  actionCount: number;
}

// ─── Plugin Entry Point ──────────────────────────────────────

/**
 * NemoClaw plugin registration function.
 * Called by NemoClaw runtime when the plugin is loaded.
 */
export function register(ctx: NemoClawPluginContext): NemoClawPlugin {
  const config = ctx.config;
  const logger = ctx.logger;
  const agentName = ctx.agent.name;

  // Load personality spec
  let spec: any = null;
  const specPath = config.personalityPath ?? ".personality.json";
  try {
    spec = loadSpec(specPath);
    logger.info("Loaded personality spec", { path: specPath, name: spec.name });
  } catch {
    logger.warn("No personality spec found, using default behavioral detectors", {
      path: specPath,
    });
  }

  // Create guard middleware
  const mode = config.mode ?? "enforce";
  const middleware = createGuardMiddleware({
    personality: spec ?? undefined,
    mode,
    name: agentName,
    minSeverity: config.minSeverity ?? "warning",
    onViolation: (violation) => {
      handleViolation(ctx, state, violation);
    },
  });

  const state: PluginState = {
    middleware,
    guard: middleware.guard,
    spec,
    messageBuffer: [],
    lastDiagnosis: null,
    lastHealthScore: 100,
    lastGrade: "A",
    violationCount: 0,
    actionCount: 0,
  };

  logger.info(`HoloMime behavioral governance active`, {
    mode,
    agent: agentName,
    hasSpec: !!spec,
  });

  // Start periodic health reporting
  const healthInterval = setInterval(() => {
    reportHealth(ctx, state);
  }, 60_000);

  return {
    name: "holomime-behavioral-governance",
    version: "1.0.0",

    preAction(action: NemoClawAction): NemoClawActionResult {
      return handlePreAction(ctx, state, action);
    },

    postAction(action: NemoClawAction, result: any): void {
      handlePostAction(ctx, state, action, result);
    },

    getHealth(): HealthReport {
      return buildHealthReport(state);
    },

    getCredential(): BehavioralCredential | null {
      return buildCredential(state, agentName, specPath);
    },

    getComplianceReport(frameworks?: string[]): string {
      return buildComplianceReport(state, agentName, frameworks ?? config.complianceFrameworks);
    },

    diagnose(): DiagnosisResult {
      const result = runDiagnosis(state.messageBuffer);
      state.lastDiagnosis = result;
      return result;
    },

    stats() {
      return middleware.stats();
    },

    shutdown() {
      clearInterval(healthInterval);
      logger.info("HoloMime behavioral governance shutting down", {
        actionsProcessed: state.actionCount,
        violations: state.violationCount,
      });
    },
  };
}

// ─── Plugin Interface ────────────────────────────────────────

export interface NemoClawPlugin {
  name: string;
  version: string;
  preAction(action: NemoClawAction): NemoClawActionResult;
  postAction(action: NemoClawAction, result: any): void;
  getHealth(): HealthReport;
  getCredential(): BehavioralCredential | null;
  getComplianceReport(frameworks?: string[]): string;
  diagnose(): DiagnosisResult;
  stats(): any;
  shutdown(): void;
}

export interface HealthReport {
  score: number;
  grade: string;
  patternsDetected: string[];
  driftLevel: "none" | "mild" | "moderate" | "severe";
  messagesAnalyzed: number;
  violationCount: number;
  actionCount: number;
}

// ─── Core Handlers ───────────────────────────────────────────

function handlePreAction(
  ctx: NemoClawPluginContext,
  state: PluginState,
  action: NemoClawAction,
): NemoClawActionResult {
  state.actionCount++;

  // Extract messages from action
  const messages: Message[] = action.messages?.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
  })) ?? [];

  // If the action has content, treat it as an assistant response
  if (action.content) {
    const allMessages = [...state.messageBuffer.slice(-50), ...messages];
    const filterResult = state.middleware.filter(allMessages, action.content);

    if (!filterResult.passed) {
      const config = ctx.config;

      // In strict mode or with blockOnConcern, block concern-level violations
      if (
        filterResult.violation?.severity === "concern" &&
        (config.mode === "strict" || config.blockOnConcern)
      ) {
        ctx.logger.warn("Blocking action due to behavioral concern", {
          patterns: filterResult.violation.patterns.map((p) => p.id),
          severity: filterResult.violation.severity,
        });

        ctx.metrics.counter("holomime_actions_blocked");

        return {
          allowed: false,
          reason: `Behavioral policy violation: ${filterResult.violation.patterns.map((p) => p.name).join(", ")}`,
          metadata: {
            patterns: filterResult.violation.patterns.map((p) => ({
              id: p.id,
              name: p.name,
              severity: p.severity,
            })),
          },
        };
      }

      // In enforce mode, return corrected content
      if (filterResult.corrected && filterResult.text !== action.content) {
        ctx.logger.info("Corrected behavioral drift in action", {
          patterns: filterResult.violation?.patterns.map((p) => p.id),
        });

        ctx.metrics.counter("holomime_actions_corrected");

        return {
          allowed: true,
          modified: true,
          content: filterResult.text,
          metadata: {
            corrected: true,
            patterns: filterResult.violation?.patterns.map((p) => p.id),
          },
        };
      }
    }
  }

  return { allowed: true };
}

function handlePostAction(
  ctx: NemoClawPluginContext,
  state: PluginState,
  action: NemoClawAction,
  _result: any,
): void {
  // Buffer messages for ongoing diagnosis
  if (action.messages) {
    for (const m of action.messages) {
      state.messageBuffer.push({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      });
    }
  }
  if (action.content) {
    state.messageBuffer.push({ role: "assistant", content: action.content });
  }

  // Trim buffer
  if (state.messageBuffer.length > 200) {
    state.messageBuffer = state.messageBuffer.slice(-200);
  }

  // Run periodic diagnosis (every 10 actions)
  if (state.actionCount % 10 === 0 && state.messageBuffer.length > 0) {
    const diagnosis = runDiagnosis(state.messageBuffer);
    state.lastDiagnosis = diagnosis;

    // Compute health score
    const warningCount = diagnosis.patterns.length;
    const concernCount = diagnosis.patterns.filter((p) => p.severity === "concern").length;
    state.lastHealthScore = Math.max(0, 100 - warningCount * 10 - concernCount * 20);
    state.lastGrade =
      state.lastHealthScore >= 90 ? "A"
      : state.lastHealthScore >= 80 ? "B"
      : state.lastHealthScore >= 70 ? "C"
      : state.lastHealthScore >= 50 ? "D"
      : "F";

    // Update metrics
    ctx.metrics.gauge("holomime_health_score", state.lastHealthScore);
    ctx.metrics.gauge("holomime_patterns_detected", warningCount);

    // Emit audit entry
    const auditLevel = ctx.config.auditLevel ?? "standard";
    if (auditLevel !== "summary" || warningCount > 0) {
      ctx.audit.append({
        event: "diagnosis",
        agent: ctx.agent.name,
        data: {
          score: state.lastHealthScore,
          grade: state.lastGrade,
          patterns: diagnosis.patterns.map((p) => ({
            id: p.id,
            name: p.name,
            severity: p.severity,
            ...(auditLevel === "full" ? { description: p.description, examples: p.examples } : {}),
          })),
          messagesAnalyzed: diagnosis.messagesAnalyzed,
          timestamp: diagnosis.timestamp,
        },
      });
    }

    // Log drift events
    if (concernCount > 0) {
      ctx.logger.warn("Behavioral drift detected", {
        score: state.lastHealthScore,
        grade: state.lastGrade,
        concerns: diagnosis.patterns
          .filter((p) => p.severity === "concern")
          .map((p) => p.name),
      });

      ctx.audit.append({
        event: "drift_detected",
        agent: ctx.agent.name,
        data: {
          severity: "concern",
          score: state.lastHealthScore,
          patterns: diagnosis.patterns.filter((p) => p.severity === "concern").map((p) => p.id),
        },
      });

      ctx.metrics.counter("holomime_drift_events");
    }
  }
}

function handleViolation(
  ctx: NemoClawPluginContext,
  state: PluginState,
  violation: GuardViolation,
): void {
  state.violationCount++;
  ctx.metrics.counter("holomime_guard_violations");

  ctx.audit.append({
    event: "guard_violation",
    agent: ctx.agent.name,
    data: {
      severity: violation.severity,
      patterns: violation.patterns.map((p) => ({ id: p.id, name: p.name, severity: p.severity })),
      blocked: violation.blocked,
      corrected: !!violation.correctedResponse,
      timestamp: violation.timestamp,
    },
  });

  ctx.logger.warn("Guard violation", {
    severity: violation.severity,
    patterns: violation.patterns.map((p) => p.id),
    blocked: violation.blocked,
  });
}

function reportHealth(ctx: NemoClawPluginContext, state: PluginState): void {
  ctx.metrics.gauge("holomime_health_score", state.lastHealthScore);
  ctx.metrics.gauge(
    "holomime_patterns_detected",
    state.lastDiagnosis?.patterns.length ?? 0,
  );
  ctx.metrics.counter("holomime_guard_violations", 0); // Keep counter alive

  const driftLevel = getDriftLevel(state.lastHealthScore);
  ctx.logger.debug("Health report", {
    score: state.lastHealthScore,
    grade: state.lastGrade,
    drift: driftLevel,
    actions: state.actionCount,
    violations: state.violationCount,
  });
}

// ─── Helpers ──────────────────────────────────────────────────

function buildHealthReport(state: PluginState): HealthReport {
  return {
    score: state.lastHealthScore,
    grade: state.lastGrade,
    patternsDetected: state.lastDiagnosis?.patterns.map((p) => p.id) ?? [],
    driftLevel: getDriftLevel(state.lastHealthScore),
    messagesAnalyzed: state.lastDiagnosis?.messagesAnalyzed ?? 0,
    violationCount: state.violationCount,
    actionCount: state.actionCount,
  };
}

function getDriftLevel(score: number): "none" | "mild" | "moderate" | "severe" {
  if (score >= 90) return "none";
  if (score >= 70) return "mild";
  if (score >= 50) return "moderate";
  return "severe";
}

function buildCredential(
  state: PluginState,
  agentName: string,
  specPath: string,
): BehavioralCredential | null {
  if (!state.spec) return null;

  const input: CertifyInput = {
    spec: state.spec,
    specPath,
  };

  if (state.lastDiagnosis) {
    input.benchmarkReport = {
      results: [
        ...state.lastDiagnosis.patterns.map(() => ({ passed: false })),
        ...state.lastDiagnosis.healthy.map(() => ({ passed: true })),
      ],
      overallScore: state.lastHealthScore,
      grade: state.lastGrade,
    };
  }

  return generateCredential(input);
}

function buildComplianceReport(
  state: PluginState,
  agentName: string,
  _frameworks?: string[],
): string {
  // Generate compliance report from audit trail
  const now = new Date();
  const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const to = now.toISOString();
  const report = generateComplianceReport(agentName, from, to);
  return JSON.stringify(report, null, 2);
}

// ─── Default Export ──────────────────────────────────────────

export default register;
