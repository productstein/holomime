/**
 * Certify Core — generate verifiable behavioral credentials for agents.
 *
 * A BehavioralCredential attests to an agent's alignment state at a point in time.
 * It includes spec hashes for verification, alignment scores, and certification metadata.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

// ─── Types ──────────────────────────────────────────────────

export interface BehavioralCredential {
  version: "1.0";
  agent: {
    name: string;
    handle: string;
    specHash: string;
  };
  alignment: {
    grade: string;
    score: number;
    driftScore: number;
    benchmarkPassed?: number;
    benchmarkTotal?: number;
  };
  certification: {
    certifiedAt: string;
    holomimeVersion: string;
    behavioralHash: string;
    specContentHash: string;
    method: string;
  };
  verifiable: {
    specPath: string;
    instructions: string;
  };
}

export interface CertifyInput {
  spec: any;
  specPath: string;
  benchmarkReport?: {
    results: Array<{ passed: boolean; score?: number }>;
    overallScore?: number;
    grade?: string;
  };
  evolveResult?: {
    converged: boolean;
    finalTES?: number;
    totalIterations: number;
    grade?: string;
  };
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
}

// ─── Hashing ────────────────────────────────────────────────

function djb2Hash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36).padStart(8, "0");
}

function hashSpecContent(spec: any): string {
  const content = JSON.stringify({
    big_five: spec.big_five,
    therapy_dimensions: spec.therapy_dimensions,
    communication: spec.communication,
    domain: spec.domain,
    growth: spec.growth,
  });
  return djb2Hash(content);
}

function hashBehavioral(spec: any): string {
  const behavioral = JSON.stringify({
    big_five: spec.big_five,
    therapy_dimensions: spec.therapy_dimensions,
  });
  return djb2Hash(behavioral);
}

// ─── Grading ────────────────────────────────────────────────

function scoreToGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

// ─── Core Functions ─────────────────────────────────────────

/**
 * Generate a behavioral credential for an agent.
 */
export function generateCredential(input: CertifyInput): BehavioralCredential {
  const { spec, specPath } = input;

  let grade = "C";
  let score = 70;
  let driftScore = 0;
  let method = "rule-based";
  let benchmarkPassed: number | undefined;
  let benchmarkTotal: number | undefined;

  // Score from benchmark report
  if (input.benchmarkReport) {
    const report = input.benchmarkReport;
    benchmarkTotal = report.results.length;
    benchmarkPassed = report.results.filter(r => r.passed).length;
    score = report.overallScore ?? Math.round((benchmarkPassed / benchmarkTotal) * 100);
    grade = report.grade ?? scoreToGrade(score);
    method = "benchmark";
  }

  // Score from evolve result (overrides benchmark if present)
  if (input.evolveResult) {
    const evolve = input.evolveResult;
    score = evolve.finalTES ?? score;
    grade = evolve.grade ?? scoreToGrade(score);
    driftScore = evolve.converged ? 0 : Math.max(0, 100 - score);
    method = "evolve";
  }

  // Fallback: lightweight rule-based grade from spec traits
  if (!input.benchmarkReport && !input.evolveResult) {
    const bf = spec.big_five;
    const td = spec.therapy_dimensions;
    if (bf && td) {
      // Simple heuristic: average stability and awareness scores
      const stabilityScore = (bf.emotional_stability?.score ?? 0.5) * 100;
      const awarenessScore = (td.self_awareness ?? 0.5) * 100;
      const boundaryScore = (td.boundary_awareness ?? 0.5) * 100;
      score = Math.round((stabilityScore + awarenessScore + boundaryScore) / 3);
      grade = scoreToGrade(score);
    }
    method = "rule-based";
  }

  return {
    version: "1.0",
    agent: {
      name: spec.name ?? "Unknown",
      handle: spec.handle ?? "unknown",
      specHash: hashSpecContent(spec),
    },
    alignment: {
      grade,
      score,
      driftScore,
      benchmarkPassed,
      benchmarkTotal,
    },
    certification: {
      certifiedAt: new Date().toISOString(),
      holomimeVersion: "1.0.0",
      behavioralHash: hashBehavioral(spec),
      specContentHash: hashSpecContent(spec),
      method,
    },
    verifiable: {
      specPath,
      instructions: "Verify by re-running `holomime certify --verify <credential.json>` with the original .personality.json in place.",
    },
  };
}

/**
 * Verify a credential against a spec.
 * Checks that the spec hashes match.
 */
export function verifyCredential(credential: BehavioralCredential, spec: any): VerifyResult {
  const currentSpecHash = hashSpecContent(spec);
  const currentBehavioralHash = hashBehavioral(spec);

  if (credential.certification.specContentHash !== currentSpecHash) {
    return {
      valid: false,
      reason: `Spec content hash mismatch: credential expects ${credential.certification.specContentHash}, current spec hashes to ${currentSpecHash}. The personality spec has been modified since certification.`,
    };
  }

  if (credential.certification.behavioralHash !== currentBehavioralHash) {
    return {
      valid: false,
      reason: `Behavioral hash mismatch: the agent's behavioral traits have changed since certification.`,
    };
  }

  return { valid: true };
}

/**
 * Save a credential to the .holomime/credentials directory.
 * Returns the path where the credential was saved.
 */
export function saveCredential(credential: BehavioralCredential, outputDir?: string): string {
  const dir = outputDir ?? resolve(process.cwd(), ".holomime", "credentials");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const date = new Date().toISOString().split("T")[0];
  const filename = `${credential.agent.handle}-${date}.json`;
  const filepath = join(dir, filename);

  writeFileSync(filepath, JSON.stringify(credential, null, 2) + "\n");
  return filepath;
}
