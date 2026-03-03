import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  generateCredential,
  verifyCredential,
  saveCredential,
  type BehavioralCredential,
  type CertifyInput,
} from "../analysis/certify-core.js";

const SAMPLE_SPEC = {
  version: "2.0",
  name: "Test Agent",
  handle: "test-agent",
  purpose: "Testing",
  big_five: {
    openness: { score: 0.7, facets: { imagination: 0.6, intellectual_curiosity: 0.8, aesthetic_sensitivity: 0.5, willingness_to_experiment: 0.7 } },
    conscientiousness: { score: 0.6, facets: { self_discipline: 0.7, orderliness: 0.5, goal_orientation: 0.6, attention_to_detail: 0.6 } },
    extraversion: { score: 0.5, facets: { assertiveness: 0.5, enthusiasm: 0.5, sociability: 0.5, initiative: 0.5 } },
    agreeableness: { score: 0.8, facets: { warmth: 0.8, empathy: 0.9, cooperation: 0.7, trust_tendency: 0.6 } },
    emotional_stability: { score: 0.7, facets: { stress_tolerance: 0.6, emotional_regulation: 0.7, confidence: 0.8, adaptability: 0.7 } },
  },
  therapy_dimensions: {
    self_awareness: 0.7,
    distress_tolerance: 0.6,
    attachment_style: "secure",
    learning_orientation: "growth",
    boundary_awareness: 0.8,
    interpersonal_sensitivity: 0.6,
  },
  communication: { register: "casual_professional" },
  domain: { expertise: [], boundaries: { refuses: [], escalation_triggers: [], hard_limits: [] } },
  growth: { areas: [], patterns_to_watch: [], strengths: [] },
};

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `holomime-certify-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("generateCredential", () => {
  it("generates credential with rule-based method by default", () => {
    const credential = generateCredential({
      spec: SAMPLE_SPEC,
      specPath: ".personality.json",
    });

    expect(credential.version).toBe("1.0");
    expect(credential.agent.name).toBe("Test Agent");
    expect(credential.agent.handle).toBe("test-agent");
    expect(credential.certification.method).toBe("rule-based");
    expect(credential.alignment.grade).toBeDefined();
    expect(credential.alignment.score).toBeGreaterThanOrEqual(0);
    expect(credential.alignment.score).toBeLessThanOrEqual(100);
  });

  it("uses benchmark data when provided", () => {
    const credential = generateCredential({
      spec: SAMPLE_SPEC,
      specPath: ".personality.json",
      benchmarkReport: {
        results: [
          { passed: true, score: 90 },
          { passed: true, score: 85 },
          { passed: false, score: 40 },
        ],
        overallScore: 85,
        grade: "B",
      },
    });

    expect(credential.certification.method).toBe("benchmark");
    expect(credential.alignment.grade).toBe("B");
    expect(credential.alignment.score).toBe(85);
    expect(credential.alignment.benchmarkPassed).toBe(2);
    expect(credential.alignment.benchmarkTotal).toBe(3);
  });

  it("uses evolve data when provided", () => {
    const credential = generateCredential({
      spec: SAMPLE_SPEC,
      specPath: ".personality.json",
      evolveResult: {
        converged: true,
        finalTES: 92,
        totalIterations: 3,
        grade: "A",
      },
    });

    expect(credential.certification.method).toBe("evolve");
    expect(credential.alignment.grade).toBe("A");
    expect(credential.alignment.score).toBe(92);
    expect(credential.alignment.driftScore).toBe(0);
  });

  it("includes valid timestamps and hashes", () => {
    const credential = generateCredential({
      spec: SAMPLE_SPEC,
      specPath: ".personality.json",
    });

    expect(credential.certification.certifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(credential.agent.specHash.length).toBeGreaterThan(0);
    expect(credential.certification.behavioralHash.length).toBeGreaterThan(0);
    expect(credential.certification.specContentHash.length).toBeGreaterThan(0);
  });
});

describe("verifyCredential", () => {
  it("verifies a valid credential", () => {
    const credential = generateCredential({
      spec: SAMPLE_SPEC,
      specPath: ".personality.json",
    });

    const result = verifyCredential(credential, SAMPLE_SPEC);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("fails verification when spec has changed", () => {
    const credential = generateCredential({
      spec: SAMPLE_SPEC,
      specPath: ".personality.json",
    });

    const modifiedSpec = JSON.parse(JSON.stringify(SAMPLE_SPEC));
    modifiedSpec.big_five.openness.score = 0.1;

    const result = verifyCredential(credential, modifiedSpec);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("hash mismatch");
  });

  it("passes verification when non-behavioral fields change", () => {
    const credential = generateCredential({
      spec: SAMPLE_SPEC,
      specPath: ".personality.json",
    });

    const modifiedSpec = JSON.parse(JSON.stringify(SAMPLE_SPEC));
    modifiedSpec.name = "Renamed Agent";
    modifiedSpec.purpose = "Different purpose";

    // Name/purpose changes don't affect behavioral or content hash
    // since they're not included in the hash inputs
    // Note: specContentHash includes domain/growth but not name/purpose
    const result = verifyCredential(credential, modifiedSpec);
    expect(result.valid).toBe(true);
  });
});

describe("saveCredential", () => {
  it("saves credential to specified directory", () => {
    const credential = generateCredential({
      spec: SAMPLE_SPEC,
      specPath: ".personality.json",
    });

    const savedPath = saveCredential(credential, testDir);
    expect(savedPath).toContain("test-agent");
    expect(savedPath).toContain(testDir);

    const loaded = JSON.parse(readFileSync(savedPath, "utf-8"));
    expect(loaded.agent.name).toBe("Test Agent");
    expect(loaded.version).toBe("1.0");
  });
});
