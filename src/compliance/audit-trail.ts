/**
 * Compliance Audit Trail — tamper-evident logging for behavioral monitoring.
 *
 * EU AI Act + executive orders require auditable evidence of AI behavioral alignment.
 * This module provides:
 * 1. Append-only audit log with chained hashes (tamper-evident)
 * 2. Compliance report generation (Markdown/JSON)
 * 3. Continuous monitoring certificates
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { BehavioralCredential } from "../analysis/certify-core.js";

// ─── Types ────────────────────────────────────────────────

export interface AuditEntry {
  /** Sequential entry number. */
  seq: number;
  /** ISO timestamp. */
  timestamp: string;
  /** Event type. */
  event: AuditEventType;
  /** Agent name/handle. */
  agent: string;
  /** Event-specific data. */
  data: Record<string, unknown>;
  /** Hash of this entry (sha256-like djb2 chain). */
  hash: string;
  /** Hash of the previous entry (chain link). */
  prevHash: string;
}

export type AuditEventType =
  | "diagnosis"
  | "session"
  | "evolve"
  | "certify"
  | "benchmark"
  | "drift_detected"
  | "spec_changed"
  | "guard_violation"
  | "manual_review";

export interface ComplianceReport {
  /** Report generation timestamp. */
  generatedAt: string;
  /** Agent name. */
  agent: string;
  /** Reporting period. */
  period: { from: string; to: string };
  /** Summary statistics. */
  summary: {
    totalEvents: number;
    diagnoses: number;
    sessions: number;
    driftEvents: number;
    guardViolations: number;
    averageGrade: string;
    gradeHistory: Array<{ date: string; grade: string; score: number }>;
  };
  /** Credentials issued during period. */
  credentials: BehavioralCredential[];
  /** Chain integrity: whether the audit log is tamper-free. */
  chainIntegrity: boolean;
  /** Compliance standard references. */
  standards: string[];
}

export interface MonitoringCertificate {
  /** Agent name. */
  agent: string;
  /** Certificate period. */
  period: { from: string; to: string };
  /** Maintained grade during period. */
  maintainedGrade: string;
  /** Minimum score during period. */
  minScore: number;
  /** Maximum score during period. */
  maxScore: number;
  /** Total monitoring events. */
  totalEvents: number;
  /** Chain integrity verified. */
  verified: boolean;
  /** Issue timestamp. */
  issuedAt: string;
  /** Human-readable statement. */
  statement: string;
}

// ─── Hashing (deterministic, chain-friendly) ──────────────

function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

function hashEntry(entry: Omit<AuditEntry, "hash">): string {
  const content = `${entry.seq}|${entry.timestamp}|${entry.event}|${entry.agent}|${JSON.stringify(entry.data)}|${entry.prevHash}`;
  return djb2(content);
}

// ─── Audit Log ────────────────────────────────────────────

function auditLogPath(agentHandle?: string): string {
  const dir = resolve(process.cwd(), ".holomime", "audit");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const filename = agentHandle ? `${agentHandle}-audit.jsonl` : "audit.jsonl";
  return join(dir, filename);
}

/**
 * Append an event to the tamper-evident audit log.
 * Each entry includes a hash chained to the previous entry.
 */
export function appendAuditEntry(
  event: AuditEventType,
  agent: string,
  data: Record<string, unknown>,
  agentHandle?: string,
): AuditEntry {
  const logPath = auditLogPath(agentHandle);

  // Get previous hash
  let prevHash = "genesis";
  let seq = 1;

  if (existsSync(logPath)) {
    const lines = readFileSync(logPath, "utf-8").trim().split("\n").filter(Boolean);
    if (lines.length > 0) {
      try {
        const lastEntry = JSON.parse(lines[lines.length - 1]) as AuditEntry;
        prevHash = lastEntry.hash;
        seq = lastEntry.seq + 1;
      } catch {
        // Corrupted log — continue with genesis
      }
    }
  }

  const partial: Omit<AuditEntry, "hash"> = {
    seq,
    timestamp: new Date().toISOString(),
    event,
    agent,
    data,
    prevHash,
  };

  const entry: AuditEntry = {
    ...partial,
    hash: hashEntry(partial),
  };

  appendFileSync(logPath, JSON.stringify(entry) + "\n");
  return entry;
}

/**
 * Load all audit entries from the log.
 */
export function loadAuditLog(agentHandle?: string): AuditEntry[] {
  const logPath = auditLogPath(agentHandle);
  if (!existsSync(logPath)) return [];

  return readFileSync(logPath, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line) as AuditEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is AuditEntry => e !== null);
}

/**
 * Verify the integrity of the audit chain.
 * Returns true if no entries have been tampered with.
 */
export function verifyAuditChain(entries: AuditEntry[]): boolean {
  if (entries.length === 0) return true;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Verify hash
    const { hash, ...rest } = entry;
    const expected = hashEntry(rest);
    if (hash !== expected) return false;

    // Verify chain
    if (i === 0) {
      if (entry.prevHash !== "genesis") return false;
    } else {
      if (entry.prevHash !== entries[i - 1].hash) return false;
    }
  }

  return true;
}

// ─── Compliance Report ───────────────────────────────────

/**
 * Generate a compliance report for a given period.
 */
export function generateComplianceReport(
  agent: string,
  from: string,
  to: string,
  agentHandle?: string,
): ComplianceReport {
  const entries = loadAuditLog(agentHandle);
  const fromDate = new Date(from).getTime();
  const toDate = new Date(to).getTime();

  const periodEntries = entries.filter(e => {
    const t = new Date(e.timestamp).getTime();
    return t >= fromDate && t <= toDate;
  });

  const diagnoses = periodEntries.filter(e => e.event === "diagnosis").length;
  const sessions = periodEntries.filter(e => e.event === "session").length;
  const driftEvents = periodEntries.filter(e => e.event === "drift_detected").length;
  const guardViolations = periodEntries.filter(e => e.event === "guard_violation").length;

  // Extract grade history from certify events
  const gradeHistory: Array<{ date: string; grade: string; score: number }> = [];
  for (const e of periodEntries) {
    if (e.event === "certify" || e.event === "benchmark" || e.event === "evolve") {
      const grade = (e.data.grade as string) ?? "?";
      const score = (e.data.score as number) ?? 0;
      gradeHistory.push({ date: e.timestamp.split("T")[0], grade, score });
    }
  }

  const avgScore = gradeHistory.length > 0
    ? gradeHistory.reduce((sum, g) => sum + g.score, 0) / gradeHistory.length
    : 0;
  const averageGrade = avgScore >= 90 ? "A" : avgScore >= 80 ? "B" : avgScore >= 70 ? "C" : avgScore >= 60 ? "D" : "F";

  return {
    generatedAt: new Date().toISOString(),
    agent,
    period: { from, to },
    summary: {
      totalEvents: periodEntries.length,
      diagnoses,
      sessions,
      driftEvents,
      guardViolations,
      averageGrade,
      gradeHistory,
    },
    credentials: [],
    chainIntegrity: verifyAuditChain(entries),
    standards: [
      "EU AI Act Article 9 (Risk Management)",
      "EU AI Act Article 12 (Record-keeping)",
      "NIST AI RMF 1.0 (Govern, Map, Measure, Manage)",
    ],
  };
}

// ─── Monitoring Certificate ──────────────────────────────

/**
 * Generate a continuous monitoring certificate.
 * Attests that an agent maintained a certain behavioral grade over a period.
 */
export function generateMonitoringCertificate(
  agent: string,
  from: string,
  to: string,
  agentHandle?: string,
): MonitoringCertificate {
  const report = generateComplianceReport(agent, from, to, agentHandle);

  const scores = report.summary.gradeHistory.map(g => g.score);
  const minScore = scores.length > 0 ? Math.min(...scores) : 0;
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0;

  const statement = `This certifies that AI agent "${agent}" was continuously monitored by holomime ` +
    `from ${from} to ${to}. During this period, the agent maintained an average behavioral ` +
    `alignment grade of ${report.summary.averageGrade} (scores ranging ${minScore}-${maxScore}/100). ` +
    `${report.summary.driftEvents} drift events were detected and ${report.summary.sessions} ` +
    `therapy sessions were conducted. Audit chain integrity: ${report.chainIntegrity ? "VERIFIED" : "FAILED"}.`;

  return {
    agent,
    period: { from, to },
    maintainedGrade: report.summary.averageGrade,
    minScore,
    maxScore,
    totalEvents: report.summary.totalEvents,
    verified: report.chainIntegrity,
    issuedAt: new Date().toISOString(),
    statement,
  };
}

/**
 * Format a compliance report as Markdown.
 */
export function formatComplianceReportMarkdown(report: ComplianceReport): string {
  const lines: string[] = [
    `# Behavioral Compliance Report — ${report.agent}`,
    "",
    `**Period:** ${report.period.from} to ${report.period.to}`,
    `**Generated:** ${report.generatedAt}`,
    `**Chain Integrity:** ${report.chainIntegrity ? "VERIFIED" : "FAILED"}`,
    "",
    "## Summary",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Events | ${report.summary.totalEvents} |`,
    `| Diagnoses Run | ${report.summary.diagnoses} |`,
    `| Therapy Sessions | ${report.summary.sessions} |`,
    `| Drift Events | ${report.summary.driftEvents} |`,
    `| Guard Violations | ${report.summary.guardViolations} |`,
    `| Average Grade | ${report.summary.averageGrade} |`,
    "",
  ];

  if (report.summary.gradeHistory.length > 0) {
    lines.push("## Grade History", "");
    lines.push("| Date | Grade | Score |");
    lines.push("|------|:-----:|------:|");
    for (const g of report.summary.gradeHistory) {
      lines.push(`| ${g.date} | ${g.grade} | ${g.score}/100 |`);
    }
    lines.push("");
  }

  lines.push("## Applicable Standards", "");
  for (const s of report.standards) {
    lines.push(`- ${s}`);
  }
  lines.push("");

  return lines.join("\n");
}
