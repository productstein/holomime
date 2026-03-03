import chalk from "chalk";
import figures from "figures";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadSpec } from "../core/inheritance.js";
import {
  generateCredential,
  verifyCredential,
  saveCredential,
} from "../analysis/certify-core.js";
import { printHeader } from "../ui/branding.js";
import { printBox } from "../ui/boxes.js";

interface CertifyOptions {
  personality?: string;
  benchmark?: string;
  evolve?: string;
  output?: string;
  verify?: string;
}

export async function certifyCommand(options: CertifyOptions): Promise<void> {
  // ─── Verify mode ──────────────────────────────────────────
  if (options.verify) {
    printHeader("Verify Credential");

    const credPath = resolve(process.cwd(), options.verify);
    let credential: any;
    try {
      credential = JSON.parse(readFileSync(credPath, "utf-8"));
    } catch {
      console.error(chalk.red(`  Could not read credential file: ${options.verify}`));
      process.exit(1);
      return;
    }

    const specPath = resolve(process.cwd(), options.personality ?? ".personality.json");
    let spec: any;
    try {
      spec = loadSpec(specPath);
    } catch {
      console.error(chalk.red(`  Could not read personality file: ${specPath}`));
      process.exit(1);
      return;
    }

    const result = verifyCredential(credential, spec);

    if (result.valid) {
      console.log();
      printBox(
        [
          `${chalk.green(figures.tick)} Credential verified`,
          "",
          `Agent: ${credential.agent.name} (@${credential.agent.handle})`,
          `Grade: ${credential.alignment.grade} (${credential.alignment.score}/100)`,
          `Certified: ${credential.certification.certifiedAt}`,
          `Method: ${credential.certification.method}`,
        ].join("\n"),
        "success",
        "Valid",
      );
    } else {
      console.log();
      printBox(
        [
          `${chalk.red(figures.cross)} Verification failed`,
          "",
          result.reason ?? "Unknown reason",
        ].join("\n"),
        "concern",
        "Invalid",
      );
      process.exit(1);
    }
    console.log();
    return;
  }

  // ─── Generate mode ────────────────────────────────────────
  printHeader("Certify — Behavioral Credential");

  const specPath = resolve(process.cwd(), options.personality ?? ".personality.json");
  let spec: any;
  try {
    spec = loadSpec(specPath);
  } catch {
    console.error(chalk.red(`  Could not read personality file: ${specPath}`));
    process.exit(1);
    return;
  }

  // Load benchmark report if provided
  let benchmarkReport: any;
  if (options.benchmark) {
    try {
      benchmarkReport = JSON.parse(readFileSync(resolve(process.cwd(), options.benchmark), "utf-8"));
    } catch {
      console.error(chalk.red(`  Could not read benchmark report: ${options.benchmark}`));
      process.exit(1);
      return;
    }
  }

  // Load evolve result if provided
  let evolveResult: any;
  if (options.evolve) {
    try {
      evolveResult = JSON.parse(readFileSync(resolve(process.cwd(), options.evolve), "utf-8"));
    } catch {
      console.error(chalk.red(`  Could not read evolve result: ${options.evolve}`));
      process.exit(1);
      return;
    }
  }

  const credential = generateCredential({
    spec,
    specPath,
    benchmarkReport,
    evolveResult,
  });

  // Save
  const outputDir = options.output ? resolve(process.cwd(), options.output) : undefined;
  const savedPath = saveCredential(credential, outputDir);

  // Display
  console.log();
  const gradeColor = credential.alignment.grade === "A" ? chalk.green
    : credential.alignment.grade === "B" ? chalk.cyan
    : credential.alignment.grade === "C" ? chalk.yellow
    : chalk.red;

  printBox(
    [
      `Agent: ${chalk.bold(credential.agent.name)} (@${credential.agent.handle})`,
      `Grade: ${gradeColor(credential.alignment.grade)} (${credential.alignment.score}/100)`,
      `Method: ${credential.certification.method}`,
      credential.alignment.benchmarkTotal
        ? `Benchmark: ${credential.alignment.benchmarkPassed}/${credential.alignment.benchmarkTotal} passed`
        : "",
      credential.alignment.driftScore > 0
        ? `Drift: ${credential.alignment.driftScore}`
        : "",
      "",
      `Spec hash: ${chalk.dim(credential.agent.specHash)}`,
      `Behavioral hash: ${chalk.dim(credential.certification.behavioralHash)}`,
      "",
      chalk.dim(`Saved to ${savedPath}`),
    ].filter(Boolean).join("\n"),
    "success",
    "Credential Generated",
  );

  console.log();
  console.log(chalk.dim(`  Verify with: ${chalk.cyan(`holomime certify --verify ${savedPath}`)}`));
  console.log();
}
