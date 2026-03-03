import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  deepMergeSpec,
  resolveInheritance,
  getInheritanceChain,
  loadSpec,
} from "../core/inheritance.js";

// ─── Test Fixtures ──────────────────────────────────────────

const BASE_SPEC = {
  version: "2.0",
  name: "Base Agent",
  handle: "base-agent",
  purpose: "Base purpose",
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
  communication: { register: "casual_professional", output_format: "mixed", emoji_policy: "sparingly" },
  domain: { expertise: ["general"], boundaries: { refuses: [], escalation_triggers: [], hard_limits: [] } },
  growth: { areas: [], patterns_to_watch: [], strengths: ["empathy"] },
};

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `holomime-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ─── deepMergeSpec ──────────────────────────────────────────

describe("deepMergeSpec", () => {
  it("merges nested objects recursively", () => {
    const base = { a: { b: 1, c: 2 }, d: 3 };
    const override = { a: { b: 10 }, e: 5 };
    const result = deepMergeSpec(base, override);
    expect(result).toEqual({ a: { b: 10, c: 2 }, d: 3, e: 5 });
  });

  it("arrays in override replace base entirely", () => {
    const base = { items: [1, 2, 3] };
    const override = { items: [4, 5] };
    const result = deepMergeSpec(base, override);
    expect(result.items).toEqual([4, 5]);
  });

  it("scalars in override replace base", () => {
    const base = { name: "old", score: 0.5 };
    const override = { name: "new" };
    const result = deepMergeSpec(base, override);
    expect(result.name).toBe("new");
    expect(result.score).toBe(0.5);
  });

  it("handles null/undefined gracefully", () => {
    expect(deepMergeSpec({ a: 1 }, undefined)).toEqual({ a: 1 });
    expect(deepMergeSpec(undefined, { a: 1 })).toEqual({ a: 1 });
    expect(deepMergeSpec(null, { a: 1 })).toEqual({ a: 1 });
    expect(deepMergeSpec({ a: 1 }, null)).toEqual({ a: 1 });
  });

  it("deeply merges personality spec structures", () => {
    const base = {
      big_five: { openness: { score: 0.5, facets: { imagination: 0.5, intellectual_curiosity: 0.6 } } },
      communication: { register: "formal" },
    };
    const override = {
      big_five: { openness: { score: 0.9 } },
      communication: { register: "conversational" },
    };
    const result = deepMergeSpec(base, override);
    expect(result.big_five.openness.score).toBe(0.9);
    expect(result.big_five.openness.facets.imagination).toBe(0.5);
    expect(result.communication.register).toBe("conversational");
  });
});

// ─── resolveInheritance ─────────────────────────────────────

describe("resolveInheritance", () => {
  it("returns spec unchanged if no extends field", () => {
    const spec = { name: "test", version: "2.0" };
    const result = resolveInheritance(spec, testDir);
    expect(result).toEqual(spec);
  });

  it("resolves single-level inheritance", () => {
    const basePath = join(testDir, "base.personality.json");
    writeFileSync(basePath, JSON.stringify(BASE_SPEC));

    const child = {
      extends: "./base.personality.json",
      name: "Child Agent",
      handle: "child-agent",
    };

    const result = resolveInheritance(child, testDir);
    expect(result.name).toBe("Child Agent");
    expect(result.handle).toBe("child-agent");
    expect(result.big_five.openness.score).toBe(0.7); // inherited from base
    expect(result.extends).toBeUndefined(); // stripped
  });

  it("resolves multi-level inheritance", () => {
    const grandparentPath = join(testDir, "grandparent.json");
    writeFileSync(grandparentPath, JSON.stringify({
      ...BASE_SPEC,
      name: "Grandparent",
      purpose: "grandparent purpose",
    }));

    const parentPath = join(testDir, "parent.json");
    writeFileSync(parentPath, JSON.stringify({
      extends: "./grandparent.json",
      name: "Parent",
      purpose: "parent purpose",
    }));

    const child = {
      extends: "./parent.json",
      name: "Child",
    };

    const result = resolveInheritance(child, testDir);
    expect(result.name).toBe("Child");
    expect(result.purpose).toBe("parent purpose"); // from parent, not grandparent
    expect(result.big_five.openness.score).toBe(0.7); // from grandparent
  });

  it("detects circular references", () => {
    const aPath = join(testDir, "a.json");
    const bPath = join(testDir, "b.json");

    writeFileSync(aPath, JSON.stringify({ extends: "./b.json", name: "A", version: "2.0" }));
    writeFileSync(bPath, JSON.stringify({ extends: "./a.json", name: "B", version: "2.0" }));

    const spec = JSON.parse(JSON.stringify({ extends: "./a.json", name: "Test" }));
    expect(() => resolveInheritance(spec, testDir)).toThrow(/[Cc]ircular/);
  });

  it("respects maxDepth", () => {
    // Create chain of 5
    for (let i = 0; i < 5; i++) {
      const content = i === 0
        ? { ...BASE_SPEC, name: `Level ${i}` }
        : { extends: `./${i - 1}.json`, name: `Level ${i}` };
      writeFileSync(join(testDir, `${i}.json`), JSON.stringify(content));
    }

    const spec = { extends: "./4.json", name: "Top" };
    // Should succeed with default maxDepth of 10
    const result = resolveInheritance(spec, testDir);
    expect(result.name).toBe("Top");

    // Should fail with maxDepth of 2
    expect(() => resolveInheritance(spec, testDir, { maxDepth: 2 })).toThrow(/depth exceeded/);
  });

  it("strips extends from final output", () => {
    const basePath = join(testDir, "base.json");
    writeFileSync(basePath, JSON.stringify(BASE_SPEC));

    const child = { extends: "./base.json", name: "Child" };
    const result = resolveInheritance(child, testDir);
    expect(result.extends).toBeUndefined();
    expect("extends" in result).toBe(false);
  });
});

// ─── getInheritanceChain ────────────────────────────────────

describe("getInheritanceChain", () => {
  it("returns empty array for spec with no extends", () => {
    const chain = getInheritanceChain({ name: "test" }, testDir);
    expect(chain).toEqual([]);
  });

  it("returns chain of base paths", () => {
    const basePath = join(testDir, "base.json");
    writeFileSync(basePath, JSON.stringify(BASE_SPEC));

    const child = { extends: "./base.json", name: "Child" };
    const chain = getInheritanceChain(child, testDir);
    expect(chain).toHaveLength(1);
    expect(chain[0]).toBe(basePath);
  });
});

// ─── loadSpec ───────────────────────────────────────────────

describe("loadSpec", () => {
  it("loads a simple spec without inheritance", () => {
    const specPath = join(testDir, "simple.json");
    writeFileSync(specPath, JSON.stringify(BASE_SPEC));

    const result = loadSpec(specPath);
    expect(result.name).toBe("Base Agent");
    expect(result.big_five.openness.score).toBe(0.7);
  });

  it("loads a spec with inheritance resolved", () => {
    const basePath = join(testDir, "base.personality.json");
    writeFileSync(basePath, JSON.stringify(BASE_SPEC));

    const childPath = join(testDir, "child.personality.json");
    writeFileSync(childPath, JSON.stringify({
      extends: "./base.personality.json",
      name: "Override Agent",
      handle: "override-agent",
      big_five: {
        openness: { score: 0.95 },
      },
    }));

    const result = loadSpec(childPath);
    expect(result.name).toBe("Override Agent");
    expect(result.handle).toBe("override-agent");
    expect(result.big_five.openness.score).toBe(0.95);
    expect(result.big_five.openness.facets.imagination).toBe(0.6); // from base
    expect(result.big_five.conscientiousness.score).toBe(0.6); // from base
  });
});
