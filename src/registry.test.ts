import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REGISTRY_DIR = join(__dirname, "..", "registry");
const INDEX_PATH = join(REGISTRY_DIR, "index.json");
const PERSONALITIES_DIR = join(REGISTRY_DIR, "personalities");

const VALID_CATEGORIES = ["care", "strategy", "creative", "action", "wisdom", "general"];

interface RegistryEntry {
  handle: string;
  name: string;
  purpose: string;
  category: string;
  author: string;
  url: string;
  tags: string[];
}

interface Registry {
  version: string;
  personalities: RegistryEntry[];
}

function loadRegistry(): Registry {
  const raw = readFileSync(INDEX_PATH, "utf-8");
  return JSON.parse(raw);
}

describe("registry index", () => {
  it("index.json exists and is valid JSON", () => {
    expect(existsSync(INDEX_PATH)).toBe(true);
    expect(() => loadRegistry()).not.toThrow();
  });

  it("has exactly 21 entries", () => {
    const registry = loadRegistry();
    expect(registry.personalities).toHaveLength(21);
  });

  it("each entry has required fields", () => {
    const registry = loadRegistry();
    const requiredFields: (keyof RegistryEntry)[] = [
      "handle", "name", "purpose", "category", "author", "url", "tags",
    ];

    for (const entry of registry.personalities) {
      for (const field of requiredFields) {
        expect(entry, `${entry.handle} missing ${field}`).toHaveProperty(field);
      }
    }
  });

  it("has no duplicate handles", () => {
    const registry = loadRegistry();
    const handles = registry.personalities.map((p) => p.handle);
    const unique = new Set(handles);
    expect(unique.size).toBe(handles.length);
  });

  it("all categories are valid", () => {
    const registry = loadRegistry();
    for (const entry of registry.personalities) {
      expect(
        VALID_CATEGORIES,
        `Invalid category "${entry.category}" for ${entry.handle}`,
      ).toContain(entry.category.toLowerCase());
    }
  });
});

describe("personality files", () => {
  const registry = loadRegistry();

  it("each handle has a corresponding .personality.json file", () => {
    for (const entry of registry.personalities) {
      const filePath = join(PERSONALITIES_DIR, `${entry.handle}.personality.json`);
      expect(existsSync(filePath), `Missing file for ${entry.handle}`).toBe(true);
    }
  });

  it("each personality file is valid JSON", () => {
    for (const entry of registry.personalities) {
      const filePath = join(PERSONALITIES_DIR, `${entry.handle}.personality.json`);
      const raw = readFileSync(filePath, "utf-8");
      expect(() => JSON.parse(raw), `Invalid JSON in ${entry.handle}`).not.toThrow();
    }
  });

  it("each personality file has big_five scores", () => {
    const traits = [
      "openness", "conscientiousness", "extraversion",
      "agreeableness", "emotional_stability",
    ];

    for (const entry of registry.personalities) {
      const filePath = join(PERSONALITIES_DIR, `${entry.handle}.personality.json`);
      const data = JSON.parse(readFileSync(filePath, "utf-8"));

      expect(data, `${entry.handle} missing big_five`).toHaveProperty("big_five");

      for (const trait of traits) {
        expect(
          data.big_five,
          `${entry.handle} missing big_five.${trait}`,
        ).toHaveProperty(trait);
      }
    }
  });

  it("all big_five scores are between 0 and 1", () => {
    const traits = [
      "openness", "conscientiousness", "extraversion",
      "agreeableness", "emotional_stability",
    ];

    for (const entry of registry.personalities) {
      const filePath = join(PERSONALITIES_DIR, `${entry.handle}.personality.json`);
      const data = JSON.parse(readFileSync(filePath, "utf-8"));

      for (const trait of traits) {
        const score = data.big_five[trait].score;
        expect(
          score,
          `${entry.handle}.big_five.${trait}.score = ${score} out of range`,
        ).toBeGreaterThanOrEqual(0);
        expect(
          score,
          `${entry.handle}.big_five.${trait}.score = ${score} out of range`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });
});
