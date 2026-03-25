import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseConscienceRule,
  loadConscienceRules,
  filterByConfig,
  injectConscienceRules,
} from "../analysis/conscience-loader.js";

describe("conscience-loader", () => {
  const testDir = join(tmpdir(), "conscience-test-" + Date.now());

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(
      join(testDir, "safety.md"),
      `---
name: safety
enabled: true
priority: 1
scope: fleet
---
# Safety Rules
- Never override emergency stop
- Always escalate distress signals`,
    );
    writeFileSync(
      join(testDir, "privacy.md"),
      `---
name: privacy
enabled: false
priority: 2
scope: agent
---
# Privacy Rules
- Never share personal data`,
    );
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("parses a conscience rule from markdown", () => {
    const rule = parseConscienceRule(join(testDir, "safety.md"));
    expect(rule.name).toBe("safety");
    expect(rule.enabled).toBe(true);
    expect(rule.priority).toBe(1);
    expect(rule.scope).toBe("fleet");
    expect(rule.content).toContain("Never override emergency stop");
  });

  it("loads all rules from directory", () => {
    const rules = loadConscienceRules(testDir);
    expect(rules.length).toBe(2);
  });

  it("filters by config", () => {
    const rules = loadConscienceRules(testDir);
    const filtered = filterByConfig(rules, {
      rules: {
        safety: { enabled: true },
        privacy: { enabled: false },
      },
    });
    expect(filtered.length).toBe(1);
    expect(filtered[0].name).toBe("safety");
  });

  it("injects rules into system prompt", () => {
    const rules = loadConscienceRules(testDir).filter((r) => r.enabled);
    const prompt = injectConscienceRules("Base prompt here.", rules);
    expect(prompt).toContain("Base prompt here.");
    expect(prompt).toContain("Conscience Rules");
    expect(prompt).toContain("safety");
  });

  it("returns empty for nonexistent directory", () => {
    const rules = loadConscienceRules("/nonexistent/path");
    expect(rules).toEqual([]);
  });
});
