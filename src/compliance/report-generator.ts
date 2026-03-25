/**
 * ISO Compliance Report Generator — produces structured compliance reports
 * from coverage checks against ISO standards.
 *
 * Output formats:
 * - JSON (for API consumption)
 * - Terminal-formatted (for CLI display)
 */

import chalk from "chalk";
import figures from "figures";
import type { ComplianceCoverageReport, ClauseStatus } from "./iso-mappings.js";

// ─── JSON Report ────────────────────────────────────────────

export interface ComplianceReportJSON {
  generatedAt: string;
  standards: ComplianceCoverageReport[];
  overallCoverage: number;
  totalClauses: number;
  totalCovered: number;
  totalMissing: number;
  recommendations: string[];
}

/**
 * Generate a JSON-formatted compliance report from one or more coverage checks.
 */
export function generateReportJSON(
  reports: ComplianceCoverageReport[],
): ComplianceReportJSON {
  const totalClauses = reports.reduce((sum, r) => sum + r.totalClauses, 0);
  const totalCovered = reports.reduce((sum, r) => sum + r.coveredClauses, 0);
  const totalMissing = totalClauses - totalCovered;
  const overallCoverage = totalClauses > 0
    ? Math.round((totalCovered / totalClauses) * 100)
    : 0;

  const recommendations = generateRecommendations(reports);

  return {
    generatedAt: new Date().toISOString(),
    standards: reports,
    overallCoverage,
    totalClauses,
    totalCovered,
    totalMissing,
    recommendations,
  };
}

// ─── Terminal Report ────────────────────────────────────────

/**
 * Format a compliance report for terminal display.
 */
export function formatReportTerminal(
  reports: ComplianceCoverageReport[],
): string {
  const lines: string[] = [];

  for (const report of reports) {
    lines.push("");
    lines.push(
      chalk.bold.underline(
        `${report.standard} — ${report.standardTitle} (v${report.standardVersion})`,
      ),
    );
    lines.push("");

    // Coverage bar
    const coverageColor =
      report.coveragePercent >= 80
        ? chalk.green
        : report.coveragePercent >= 50
          ? chalk.yellow
          : chalk.red;
    const barWidth = 30;
    const filled = Math.round((report.coveragePercent / 100) * barWidth);
    const bar =
      coverageColor("█".repeat(filled)) +
      chalk.gray("░".repeat(barWidth - filled));
    lines.push(
      `  Coverage: ${bar} ${coverageColor(`${report.coveragePercent}%`)} (${report.coveredClauses}/${report.totalClauses} clauses)`,
    );
    lines.push("");

    // Clause-by-clause
    for (const detail of report.details) {
      const icon = detail.covered
        ? chalk.green(figures.tick)
        : chalk.red(figures.cross);
      const clauseId = chalk.cyan(`[${detail.clause.id}]`);
      const title = detail.clause.title;

      lines.push(`  ${icon} ${clauseId} ${title}`);

      if (detail.covered) {
        lines.push(
          chalk.dim(`       ${detail.coverageMethod}`),
        );
        for (const ev of detail.evidence) {
          lines.push(chalk.dim(`       ${figures.arrowRight} ${ev}`));
        }
      } else {
        lines.push(
          chalk.dim.yellow(
            `       Missing: needs ${detail.clause.maps_to} rule for "${detail.clause.example_rule}"`,
          ),
        );
      }
    }
    lines.push("");
  }

  // Overall summary
  const totalClauses = reports.reduce((sum, r) => sum + r.totalClauses, 0);
  const totalCovered = reports.reduce((sum, r) => sum + r.coveredClauses, 0);
  const overallPercent = totalClauses > 0
    ? Math.round((totalCovered / totalClauses) * 100)
    : 0;

  if (reports.length > 1) {
    const overallColor =
      overallPercent >= 80
        ? chalk.green
        : overallPercent >= 50
          ? chalk.yellow
          : chalk.red;
    lines.push(
      chalk.bold(
        `  Overall: ${overallColor(`${overallPercent}%`)} coverage across ${reports.length} standards (${totalCovered}/${totalClauses} clauses)`,
      ),
    );
    lines.push("");
  }

  // Recommendations
  const recommendations = generateRecommendations(reports);
  if (recommendations.length > 0) {
    lines.push(chalk.bold("  Recommendations:"));
    for (const rec of recommendations) {
      lines.push(`    ${chalk.yellow(figures.warning)} ${rec}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Recommendations ────────────────────────────────────────

function generateRecommendations(
  reports: ComplianceCoverageReport[],
): string[] {
  const recommendations: string[] = [];

  for (const report of reports) {
    const missing = report.details.filter((d) => !d.covered);

    // Group missing by mapping type
    const missingByType = new Map<string, ClauseStatus[]>();
    for (const m of missing) {
      const type = m.clause.maps_to;
      if (!missingByType.has(type)) missingByType.set(type, []);
      missingByType.get(type)!.push(m);
    }

    for (const [type, clauses] of missingByType) {
      const clauseIds = clauses.map((c) => c.clause.id).join(", ");
      switch (type) {
        case "deny":
          recommendations.push(
            `Add deny rules to conscience.exe for ${report.standard} clauses ${clauseIds}`,
          );
          break;
        case "hard_limit":
          recommendations.push(
            `Add hard limits to conscience.exe for ${report.standard} clauses ${clauseIds}`,
          );
          break;
        case "safety_envelope":
          recommendations.push(
            `Configure safety envelope fields in body.api for ${report.standard} clauses ${clauseIds}`,
          );
          break;
        case "escalate":
          recommendations.push(
            `Add escalation triggers to conscience.exe for ${report.standard} clauses ${clauseIds}`,
          );
          break;
        case "soul":
          recommendations.push(
            `Define core values and purpose in soul.md for ${report.standard} clauses ${clauseIds}`,
          );
          break;
        case "psyche":
          recommendations.push(
            `Configure Big Five traits and therapy dimensions in psyche.sys for ${report.standard} clauses ${clauseIds}`,
          );
          break;
        case "conscience":
          recommendations.push(
            `Define governance rules in conscience.exe for ${report.standard} clauses ${clauseIds}`,
          );
          break;
        case "detectors":
          recommendations.push(
            `Configure behavioral drift monitoring for ${report.standard} clauses ${clauseIds}`,
          );
          break;
        case "therapy":
          recommendations.push(
            `Define growth areas for self-improvement loop for ${report.standard} clauses ${clauseIds}`,
          );
          break;
        default:
          recommendations.push(
            `Address ${type} requirements for ${report.standard} clauses ${clauseIds}`,
          );
      }
    }
  }

  return recommendations;
}
