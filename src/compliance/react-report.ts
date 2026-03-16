/**
 * ReACT Compliance Report Generator
 *
 * Generates narrative-driven behavioral alignment audit reports using
 * a Reason-Act-Observe loop. Ported from Antihero's compliance_react.py.
 *
 * Produces executive summaries, risk findings, framework-specific
 * compliance sections, and actionable recommendations — all from
 * the tamper-evident audit trail.
 *
 * Supported frameworks:
 * - EU AI Act (Articles 9, 12, 14, 15)
 * - NIST AI RMF 1.0 (Govern, Map, Measure, Manage)
 * - SOC 2 Type II (CC6, CC7, CC8)
 * - Internal Behavioral Alignment Standard
 */

import {
  loadAuditLog,
  verifyAuditChain,
  type AuditEntry,
  type AuditEventType,
} from "./audit-trail.js";

// ─── Types ──────────────────────────────────────────────────

export interface ReACTStep {
  phase: "reason" | "act" | "observe";
  action: string;
  result: string;
  timestamp: string;
}

export interface RiskFinding {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  evidence: string[];
  recommendation: string;
}

export interface FrameworkSection {
  framework: string;
  articles: string[];
  status: "compliant" | "partial" | "non_compliant" | "not_assessed";
  findings: string[];
}

export interface ReACTReport {
  id: string;
  generatedAt: string;
  agent: string;
  period: { from: string; to: string };
  executiveSummary: string;
  chainIntegrity: { verified: boolean; totalEntries: number; description: string };
  statistics: ReportStatistics;
  riskFindings: RiskFinding[];
  frameworkSections: FrameworkSection[];
  recommendations: string[];
  steps: ReACTStep[];
}

export interface ReportStatistics {
  totalEvents: number;
  diagnoses: number;
  sessions: number;
  driftEvents: number;
  guardViolations: number;
  benchmarks: number;
  evolves: number;
  certifications: number;
  averageScore: number;
  gradeDistribution: Record<string, number>;
  topPatterns: Array<{ pattern: string; count: number }>;
  therapyEffectiveness: number | null;
}

// ─── Framework Definitions ──────────────────────────────────

const FRAMEWORK_SECTIONS: Record<string, { articles: string[]; focusAreas: AuditEventType[] }> = {
  "EU AI Act": {
    articles: [
      "Article 9 — Risk Management System",
      "Article 12 — Record-Keeping",
      "Article 14 — Human Oversight",
      "Article 15 — Accuracy, Robustness, Cybersecurity",
    ],
    focusAreas: ["diagnosis", "drift_detected", "guard_violation", "benchmark"],
  },
  "NIST AI RMF 1.0": {
    articles: [
      "GOVERN — Organizational policies and procedures",
      "MAP — Context and risk identification",
      "MEASURE — Analysis and assessment",
      "MANAGE — Prioritize, respond, recover",
    ],
    focusAreas: ["certify", "evolve", "session", "diagnosis"],
  },
  "SOC 2 Type II": {
    articles: [
      "CC6.1 — Logical and Physical Access Controls",
      "CC7.2 — System Monitoring",
      "CC8.1 — Change Management",
    ],
    focusAreas: ["guard_violation", "drift_detected", "spec_changed", "evolve"],
  },
  "Internal Behavioral Alignment": {
    articles: [
      "BAS-1 — Personality Specification Compliance",
      "BAS-2 — Behavioral Drift Monitoring",
      "BAS-3 — Therapy Session Outcomes",
      "BAS-4 — Guard Violation Response",
    ],
    focusAreas: ["diagnosis", "session", "drift_detected", "guard_violation"],
  },
};

// ─── ReACT Report Generator ─────────────────────────────────

export interface ReACTReportOptions {
  agent: string;
  agentHandle?: string;
  from: string;
  to: string;
  frameworks?: string[];
}

/**
 * Generate a narrative-driven compliance report using the ReACT
 * (Reason-Act-Observe) loop pattern.
 */
export function generateReACTReport(options: ReACTReportOptions): ReACTReport {
  const steps: ReACTStep[] = [];
  const now = new Date().toISOString();

  // ─── Phase 1: REASON — Plan the report ──────────────────
  steps.push({
    phase: "reason",
    action: "Plan report structure",
    result: `Generating behavioral compliance report for agent "${options.agent}" covering ${options.from} to ${options.to}`,
    timestamp: now,
  });

  // ─── Phase 2: ACT — Execute analysis steps ──────────────

  // Step 2a: Load and verify audit chain
  steps.push({ phase: "act", action: "Load audit log", result: "Loading...", timestamp: now });
  const allEntries = loadAuditLog(options.agentHandle);
  const chainVerified = verifyAuditChain(allEntries);
  steps[steps.length - 1].result = `Loaded ${allEntries.length} entries. Chain integrity: ${chainVerified ? "VERIFIED" : "FAILED"}`;

  // Filter to period
  const fromDate = new Date(options.from).getTime();
  const toDate = new Date(options.to).getTime();
  const entries = allEntries.filter(e => {
    const t = new Date(e.timestamp).getTime();
    return t >= fromDate && t <= toDate;
  });

  // Step 2b: Compute statistics
  steps.push({ phase: "act", action: "Compute statistics", result: "Computing...", timestamp: now });
  const statistics = computeStatistics(entries);
  steps[steps.length - 1].result = `${statistics.totalEvents} events: ${statistics.diagnoses} diagnoses, ${statistics.sessions} sessions, ${statistics.guardViolations} violations`;

  // Step 2c: Analyze risks
  steps.push({ phase: "act", action: "Analyze risks", result: "Scanning...", timestamp: now });
  const riskFindings = analyzeRisks(entries, statistics);
  steps[steps.length - 1].result = `Found ${riskFindings.length} risk findings`;

  // Step 2d: Evaluate frameworks
  steps.push({ phase: "act", action: "Evaluate framework compliance", result: "Evaluating...", timestamp: now });
  const selectedFrameworks = options.frameworks ?? Object.keys(FRAMEWORK_SECTIONS);
  const frameworkSections = evaluateFrameworks(entries, statistics, selectedFrameworks);
  steps[steps.length - 1].result = `Evaluated ${frameworkSections.length} frameworks`;

  // Step 2e: Generate recommendations
  steps.push({ phase: "act", action: "Generate recommendations", result: "Generating...", timestamp: now });
  const recommendations = generateRecommendations(riskFindings, statistics, frameworkSections);
  steps[steps.length - 1].result = `Generated ${recommendations.length} recommendations`;

  // Step 2f: Write executive summary
  steps.push({ phase: "act", action: "Write executive summary", result: "Writing...", timestamp: now });
  const executiveSummary = writeExecutiveSummary(options.agent, entries, statistics, riskFindings, chainVerified);
  steps[steps.length - 1].result = "Executive summary complete";

  // ─── Phase 3: OBSERVE — Compile final report ────────────
  steps.push({
    phase: "observe",
    action: "Compile final report",
    result: `Report complete: ${riskFindings.length} findings, ${recommendations.length} recommendations across ${frameworkSections.length} frameworks`,
    timestamp: now,
  });

  return {
    id: crypto.randomUUID(),
    generatedAt: now,
    agent: options.agent,
    period: { from: options.from, to: options.to },
    executiveSummary,
    chainIntegrity: {
      verified: chainVerified,
      totalEntries: allEntries.length,
      description: chainVerified
        ? "All audit entries verified. Hash chain is intact — no tampering detected."
        : "WARNING: Audit chain integrity check failed. One or more entries may have been tampered with.",
    },
    statistics,
    riskFindings,
    frameworkSections,
    recommendations,
    steps,
  };
}

// ─── Analysis Functions ─────────────────────────────────────

function computeStatistics(entries: AuditEntry[]): ReportStatistics {
  const diagnoses = entries.filter(e => e.event === "diagnosis").length;
  const sessions = entries.filter(e => e.event === "session").length;
  const driftEvents = entries.filter(e => e.event === "drift_detected").length;
  const guardViolations = entries.filter(e => e.event === "guard_violation").length;
  const benchmarks = entries.filter(e => e.event === "benchmark").length;
  const evolves = entries.filter(e => e.event === "evolve").length;
  const certifications = entries.filter(e => e.event === "certify").length;

  // Extract scores
  const scores: number[] = [];
  const gradeDistribution: Record<string, number> = {};
  for (const e of entries) {
    if (e.data.score != null) {
      scores.push(e.data.score as number);
    }
    if (e.data.grade) {
      const grade = e.data.grade as string;
      gradeDistribution[grade] = (gradeDistribution[grade] ?? 0) + 1;
    }
  }
  const averageScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  // Extract pattern frequencies
  const patternCounts = new Map<string, number>();
  for (const e of entries) {
    if (e.data.patterns && Array.isArray(e.data.patterns)) {
      for (const p of e.data.patterns as string[]) {
        patternCounts.set(p, (patternCounts.get(p) ?? 0) + 1);
      }
    }
    if (e.data.pattern) {
      const p = e.data.pattern as string;
      patternCounts.set(p, (patternCounts.get(p) ?? 0) + 1);
    }
  }
  const topPatterns = [...patternCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([pattern, count]) => ({ pattern, count }));

  // Therapy effectiveness: compare scores before and after sessions
  let therapyEffectiveness: number | null = null;
  if (sessions > 0 && scores.length >= 2) {
    const half = Math.floor(scores.length / 2);
    const firstHalf = scores.slice(0, half);
    const secondHalf = scores.slice(half);
    const avgBefore = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgAfter = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    therapyEffectiveness = Math.round(avgAfter - avgBefore);
  }

  return {
    totalEvents: entries.length,
    diagnoses,
    sessions,
    driftEvents,
    guardViolations,
    benchmarks,
    evolves,
    certifications,
    averageScore,
    gradeDistribution,
    topPatterns,
    therapyEffectiveness,
  };
}

function analyzeRisks(entries: AuditEntry[], stats: ReportStatistics): RiskFinding[] {
  const findings: RiskFinding[] = [];
  let findingIndex = 0;

  // HIGH_RISK: Guard violations with high severity
  if (stats.guardViolations > 0) {
    const violations = entries.filter(e => e.event === "guard_violation");
    const severeCounts = violations.filter(e => (e.data.severity as string) === "concern" || (e.data.severity as string) === "warning").length;

    if (severeCounts > 0) {
      findings.push({
        id: `RF-${++findingIndex}`,
        severity: severeCounts >= 5 ? "critical" : severeCounts >= 3 ? "high" : "medium",
        title: "Behavioral Guard Violations Detected",
        description: `${severeCounts} guard violation${severeCounts !== 1 ? "s" : ""} with warning or concern severity detected during the audit period. This indicates the agent's responses triggered behavioral pattern detectors.`,
        evidence: violations.slice(0, 5).map(v => `[${v.timestamp}] ${v.event}: ${JSON.stringify(v.data).slice(0, 100)}`),
        recommendation: "Run therapy sessions targeting detected patterns. Consider switching guard mode from 'monitor' to 'enforce' to auto-correct violations.",
      });
    }
  }

  // REPEAT_OFFENDERS: Same pattern triggered 3+ times
  for (const { pattern, count } of stats.topPatterns) {
    if (count >= 3) {
      findings.push({
        id: `RF-${++findingIndex}`,
        severity: count >= 10 ? "high" : "medium",
        title: `Recurring Pattern: ${pattern}`,
        description: `The "${pattern}" pattern was detected ${count} times during the audit period. Recurring patterns indicate persistent behavioral misalignment that therapy sessions have not resolved.`,
        evidence: [`Pattern "${pattern}" detected ${count} times across ${stats.totalEvents} total events`],
        recommendation: `Run targeted therapy: holomime session --target ${pattern}. If the pattern persists after 3+ sessions, consider exporting DPO training pairs and fine-tuning the base model.`,
      });
    }
  }

  // DRIFT_TRAJECTORY: Increasing drift over time
  if (stats.driftEvents >= 3) {
    findings.push({
      id: `RF-${++findingIndex}`,
      severity: stats.driftEvents >= 5 ? "high" : "medium",
      title: "Behavioral Drift Trajectory",
      description: `${stats.driftEvents} drift events detected. A sustained drift trajectory suggests the agent's behavior is diverging from its declared personality specification.`,
      evidence: [`${stats.driftEvents} drift events over the audit period`],
      recommendation: "Run full evolve loop: holomime evolve --convergence 85. Review personality spec for overly rigid or ambiguous constraints.",
    });
  }

  // ERROR_SPIKE: Guard violation rate > 5%
  if (stats.totalEvents > 0 && stats.guardViolations / stats.totalEvents > 0.05) {
    const rate = (stats.guardViolations / stats.totalEvents * 100).toFixed(1);
    findings.push({
      id: `RF-${++findingIndex}`,
      severity: "high",
      title: "Guard Violation Rate Exceeds Threshold",
      description: `Guard violation rate is ${rate}% (${stats.guardViolations}/${stats.totalEvents} events), exceeding the 5% threshold. This may indicate a fundamental misalignment between the personality spec and the agent's base model behavior.`,
      evidence: [`Violation rate: ${rate}%`],
      recommendation: "Review guard configuration. If using 'monitor' mode, violations are logged but not corrected — consider switching to 'enforce'. Run adversarial stress test to identify specific failure modes.",
    });
  }

  // LOW_SESSION_COVERAGE: Drift events without corresponding therapy
  if (stats.driftEvents > 0 && stats.sessions === 0) {
    findings.push({
      id: `RF-${++findingIndex}`,
      severity: "medium",
      title: "Drift Detected Without Therapy Response",
      description: `${stats.driftEvents} drift events were detected but no therapy sessions were conducted during the audit period. Drift should trigger corrective therapy sessions.`,
      evidence: [`${stats.driftEvents} drift events, 0 therapy sessions`],
      recommendation: "Enable auto-evolve: holomime watch --evolve. Or manually run: holomime session --personality .personality.json",
    });
  }

  // NO_MONITORING: Very few events
  if (stats.totalEvents < 5) {
    findings.push({
      id: `RF-${++findingIndex}`,
      severity: "low",
      title: "Insufficient Monitoring Data",
      description: `Only ${stats.totalEvents} events recorded during the audit period. Insufficient data to draw meaningful conclusions about behavioral alignment.`,
      evidence: [`${stats.totalEvents} total events`],
      recommendation: "Increase monitoring frequency. Run regular benchmarks and enable continuous watch: holomime watch",
    });
  }

  return findings;
}

function evaluateFrameworks(
  entries: AuditEntry[],
  stats: ReportStatistics,
  frameworks: string[],
): FrameworkSection[] {
  return frameworks
    .filter(f => FRAMEWORK_SECTIONS[f])
    .map(framework => {
      const config = FRAMEWORK_SECTIONS[framework];
      const relevantEntries = entries.filter(e => config.focusAreas.includes(e.event));
      const findings: string[] = [];

      // Determine compliance status
      let status: FrameworkSection["status"] = "not_assessed";
      if (relevantEntries.length === 0) {
        status = "not_assessed";
        findings.push("No relevant audit events found for this framework during the reporting period.");
      } else if (stats.guardViolations === 0 && stats.driftEvents <= 1) {
        status = "compliant";
        findings.push("All behavioral alignment criteria met during the reporting period.");
        findings.push(`${relevantEntries.length} relevant events reviewed.`);
      } else if (stats.guardViolations <= 3 && stats.sessions > 0) {
        status = "partial";
        findings.push(`${stats.guardViolations} guard violations detected but corrective actions were taken (${stats.sessions} therapy sessions).`);
        if (stats.therapyEffectiveness != null && stats.therapyEffectiveness > 0) {
          findings.push(`Therapy improved average scores by +${stats.therapyEffectiveness} points.`);
        }
      } else {
        status = "non_compliant";
        findings.push(`${stats.guardViolations} guard violations and ${stats.driftEvents} drift events indicate non-compliance.`);
        if (stats.sessions === 0) {
          findings.push("No corrective therapy sessions were conducted.");
        }
      }

      return {
        framework,
        articles: config.articles,
        status,
        findings,
      };
    });
}

function generateRecommendations(
  findings: RiskFinding[],
  stats: ReportStatistics,
  frameworks: FrameworkSection[],
): string[] {
  const recs: string[] = [];

  // Priority 1: Critical/High findings
  const criticalFindings = findings.filter(f => f.severity === "critical" || f.severity === "high");
  if (criticalFindings.length > 0) {
    recs.push(`PRIORITY: Address ${criticalFindings.length} critical/high-severity findings immediately. Run: holomime adversarial --personality .personality.json to identify failure modes.`);
  }

  // Therapy recommendations
  if (stats.driftEvents > 0 && stats.sessions < stats.driftEvents) {
    recs.push(`Schedule ${stats.driftEvents - stats.sessions} additional therapy sessions to address unresolved drift events.`);
  }

  // Guard mode recommendation
  if (stats.guardViolations > 3) {
    recs.push("Switch guard mode from 'monitor' to 'enforce' to auto-correct behavioral violations in real-time.");
  }

  // DPO training recommendation
  if (stats.sessions >= 3 && stats.driftEvents > 0) {
    recs.push("Sufficient therapy data exists for DPO fine-tuning. Run: holomime export --format dpo to extract training pairs, then: holomime train --format openai");
  }

  // Benchmark cadence
  if (stats.benchmarks < 2) {
    recs.push("Increase benchmark frequency to at least monthly. Run: holomime benchmark --personality .personality.json --save");
  }

  // Framework-specific
  const nonCompliant = frameworks.filter(f => f.status === "non_compliant");
  if (nonCompliant.length > 0) {
    recs.push(`${nonCompliant.length} framework(s) show non-compliance: ${nonCompliant.map(f => f.framework).join(", ")}. Review framework sections for specific remediation steps.`);
  }

  // Certification
  if (stats.averageScore >= 70 && stats.guardViolations <= 2) {
    recs.push("Agent meets certification threshold. Run: holomime certify to issue a behavioral alignment credential.");
  }

  return recs;
}

function writeExecutiveSummary(
  agent: string,
  entries: AuditEntry[],
  stats: ReportStatistics,
  findings: RiskFinding[],
  chainVerified: boolean,
): string {
  const critical = findings.filter(f => f.severity === "critical").length;
  const high = findings.filter(f => f.severity === "high").length;

  let healthStatement: string;
  if (critical > 0) {
    healthStatement = `The agent exhibits critical behavioral alignment issues requiring immediate attention.`;
  } else if (high > 0) {
    healthStatement = `The agent shows significant behavioral drift that should be addressed through targeted therapy sessions.`;
  } else if (stats.guardViolations > 0) {
    healthStatement = `The agent operates within acceptable parameters with minor violations that are being monitored.`;
  } else {
    healthStatement = `The agent demonstrates strong behavioral alignment with its declared personality specification.`;
  }

  const parts: string[] = [
    `Agent "${agent}" was continuously monitored during the audit period with ${stats.totalEvents} events recorded across ${entries.length > 0 ? Math.ceil((new Date(entries[entries.length - 1].timestamp).getTime() - new Date(entries[0].timestamp).getTime()) / 86400000) : 0} days.`,
    healthStatement,
  ];

  if (stats.sessions > 0) {
    parts.push(`${stats.sessions} therapy session${stats.sessions !== 1 ? "s were" : " was"} conducted during the period.`);
    if (stats.therapyEffectiveness != null) {
      if (stats.therapyEffectiveness > 0) {
        parts.push(`Therapy improved average behavioral scores by +${stats.therapyEffectiveness} points.`);
      } else if (stats.therapyEffectiveness < 0) {
        parts.push(`Note: Average scores decreased by ${stats.therapyEffectiveness} points after therapy — review session targeting.`);
      }
    }
  }

  if (stats.topPatterns.length > 0) {
    const top = stats.topPatterns[0];
    parts.push(`The most frequently detected pattern was "${top.pattern}" (${top.count} occurrences).`);
  }

  parts.push(`Audit chain integrity: ${chainVerified ? "VERIFIED — all entries are tamper-free." : "FAILED — audit log may have been tampered with."}`);

  return parts.join(" ");
}

// ─── Formatting ─────────────────────────────────────────────

/**
 * Format a ReACT report as Markdown.
 */
export function formatReACTReportMarkdown(report: ReACTReport): string {
  const lines: string[] = [
    `# Behavioral Alignment Audit Report`,
    `## Agent: ${report.agent}`,
    "",
    `**Period:** ${report.period.from} to ${report.period.to}`,
    `**Generated:** ${report.generatedAt}`,
    `**Report ID:** ${report.id}`,
    "",
    "---",
    "",
    "## Executive Summary",
    "",
    report.executiveSummary,
    "",
    "---",
    "",
    "## Audit Chain Integrity",
    "",
    `**Status:** ${report.chainIntegrity.verified ? "VERIFIED" : "FAILED"}`,
    `**Total Entries:** ${report.chainIntegrity.totalEntries}`,
    "",
    report.chainIntegrity.description,
    "",
    "---",
    "",
    "## Statistics",
    "",
    `| Metric | Value |`,
    `|--------|------:|`,
    `| Total Events | ${report.statistics.totalEvents} |`,
    `| Diagnoses | ${report.statistics.diagnoses} |`,
    `| Therapy Sessions | ${report.statistics.sessions} |`,
    `| Drift Events | ${report.statistics.driftEvents} |`,
    `| Guard Violations | ${report.statistics.guardViolations} |`,
    `| Benchmarks | ${report.statistics.benchmarks} |`,
    `| Evolve Cycles | ${report.statistics.evolves} |`,
    `| Average Score | ${report.statistics.averageScore}/100 |`,
    "",
  ];

  if (report.statistics.topPatterns.length > 0) {
    lines.push("### Top Detected Patterns", "");
    lines.push("| Pattern | Count |");
    lines.push("|---------|------:|");
    for (const p of report.statistics.topPatterns) {
      lines.push(`| ${p.pattern} | ${p.count} |`);
    }
    lines.push("");
  }

  // Risk Findings
  if (report.riskFindings.length > 0) {
    lines.push("---", "", "## Risk Findings", "");
    for (const finding of report.riskFindings) {
      const severityBadge = finding.severity === "critical" ? "🔴 CRITICAL"
        : finding.severity === "high" ? "🟠 HIGH"
        : finding.severity === "medium" ? "🟡 MEDIUM"
        : "🟢 LOW";
      lines.push(`### ${finding.id}: ${finding.title}`);
      lines.push("");
      lines.push(`**Severity:** ${severityBadge}`);
      lines.push("");
      lines.push(finding.description);
      lines.push("");
      if (finding.evidence.length > 0) {
        lines.push("**Evidence:**");
        for (const ev of finding.evidence) {
          lines.push(`- ${ev}`);
        }
        lines.push("");
      }
      lines.push(`**Recommendation:** ${finding.recommendation}`);
      lines.push("");
    }
  }

  // Framework Sections
  lines.push("---", "", "## Compliance Framework Assessment", "");
  for (const section of report.frameworkSections) {
    const statusBadge = section.status === "compliant" ? "COMPLIANT"
      : section.status === "partial" ? "PARTIAL"
      : section.status === "non_compliant" ? "NON-COMPLIANT"
      : "NOT ASSESSED";
    lines.push(`### ${section.framework} — ${statusBadge}`);
    lines.push("");
    lines.push("**Applicable Articles:**");
    for (const article of section.articles) {
      lines.push(`- ${article}`);
    }
    lines.push("");
    lines.push("**Findings:**");
    for (const finding of section.findings) {
      lines.push(`- ${finding}`);
    }
    lines.push("");
  }

  // Recommendations
  if (report.recommendations.length > 0) {
    lines.push("---", "", "## Recommendations", "");
    for (let i = 0; i < report.recommendations.length; i++) {
      lines.push(`${i + 1}. ${report.recommendations[i]}`);
    }
    lines.push("");
  }

  // ReACT Trace
  lines.push("---", "", "## ReACT Reasoning Trace", "");
  lines.push("| Phase | Action | Result |");
  lines.push("|-------|--------|--------|");
  for (const step of report.steps) {
    lines.push(`| ${step.phase.toUpperCase()} | ${step.action} | ${step.result.slice(0, 80)} |`);
  }
  lines.push("");

  return lines.join("\n");
}
