import chalk from "chalk";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateReACTReport, formatReACTReportMarkdown } from "../compliance/react-report.js";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";

interface ComplianceOptions {
  agent: string;
  from?: string;
  to?: string;
  framework?: string;
  output?: string;
}

export async function complianceCommand(options: ComplianceOptions): Promise<void> {
  printHeader("Compliance Report — ReACT Behavioral Audit");

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const from = options.from ?? thirtyDaysAgo.toISOString().split("T")[0];
  const to = options.to ?? now.toISOString().split("T")[0];
  const frameworks = options.framework
    ? options.framework.split(",").map(s => s.trim())
    : undefined;

  console.log(chalk.dim(`  Agent: ${options.agent}`));
  console.log(chalk.dim(`  Period: ${from} to ${to}`));
  if (frameworks) {
    console.log(chalk.dim(`  Frameworks: ${frameworks.join(", ")}`));
  }
  console.log();

  // Generate report
  console.log(chalk.dim("  Generating ReACT compliance report..."));
  console.log();

  const report = generateReACTReport({
    agent: options.agent,
    agentHandle: options.agent,
    from,
    to,
    frameworks,
  });

  // Display ReACT trace
  console.log(chalk.bold("  ReACT Reasoning Trace:"));
  for (const step of report.steps) {
    const phaseColor = step.phase === "reason" ? chalk.cyan
      : step.phase === "act" ? chalk.yellow
      : chalk.green;
    console.log(`  ${phaseColor(`[${step.phase.toUpperCase()}]`)} ${step.action}`);
    console.log(`         ${chalk.dim(step.result)}`);
  }
  console.log();

  // Chain integrity
  const chainIcon = report.chainIntegrity.verified ? chalk.green("✓") : chalk.red("✕");
  console.log(`  Audit Chain: ${chainIcon} ${report.chainIntegrity.verified ? "Verified" : "FAILED"} (${report.chainIntegrity.totalEntries} entries)`);
  console.log();

  // Statistics summary
  console.log(chalk.bold("  Statistics:"));
  console.log(`  ${chalk.dim("Events:")} ${report.statistics.totalEvents}  ${chalk.dim("Diagnoses:")} ${report.statistics.diagnoses}  ${chalk.dim("Sessions:")} ${report.statistics.sessions}`);
  console.log(`  ${chalk.dim("Drift:")} ${report.statistics.driftEvents}  ${chalk.dim("Violations:")} ${report.statistics.guardViolations}  ${chalk.dim("Avg Score:")} ${report.statistics.averageScore}/100`);
  console.log();

  // Risk findings
  if (report.riskFindings.length > 0) {
    console.log(chalk.bold("  Risk Findings:"));
    for (const finding of report.riskFindings) {
      const sevColor = finding.severity === "critical" ? chalk.red
        : finding.severity === "high" ? chalk.yellow
        : finding.severity === "medium" ? chalk.cyan
        : chalk.dim;
      console.log(`  ${sevColor(`[${finding.severity.toUpperCase()}]`)} ${finding.title}`);
      console.log(`         ${chalk.dim(finding.recommendation)}`);
    }
    console.log();
  }

  // Framework compliance
  console.log(chalk.bold("  Framework Compliance:"));
  for (const section of report.frameworkSections) {
    const statusColor = section.status === "compliant" ? chalk.green
      : section.status === "partial" ? chalk.yellow
      : section.status === "non_compliant" ? chalk.red
      : chalk.dim;
    const statusLabel = section.status === "non_compliant" ? "NON-COMPLIANT"
      : section.status.toUpperCase().replace("_", " ");
    console.log(`  ${statusColor("●")} ${section.framework}: ${statusColor(statusLabel)}`);
  }
  console.log();

  // Recommendations
  if (report.recommendations.length > 0) {
    console.log(chalk.bold("  Recommendations:"));
    for (let i = 0; i < report.recommendations.length; i++) {
      console.log(`  ${chalk.cyan(`${i + 1}.`)} ${report.recommendations[i]}`);
    }
    console.log();
  }

  // Output to file
  if (options.output) {
    const outputPath = resolve(process.cwd(), options.output);
    const markdown = formatReACTReportMarkdown(report);
    writeFileSync(outputPath, markdown, "utf-8");
    printBox(`Report saved to ${chalk.cyan(options.output)}`, "success" as any);
    console.log();
  } else {
    printBox(
      `Save full report: ${chalk.cyan(`holomime compliance --agent ${options.agent} -o report.md`)}`,
      "info",
    );
    console.log();
  }
}
