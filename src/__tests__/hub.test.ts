import { describe, it, expect, beforeEach } from "vitest";
import type { Message } from "../core/types.js";
import {
  registerDetector,
  getDetector,
  listDetectors,
  listDetectorsByCategory,
  listDetectorsByTag,
  unregisterDetector,
  getTotalSignalCount,
  getCategories,
  type HubDetector,
} from "../hub/detector-interface.js";
import { BUILT_IN_DETECTORS, registerBuiltInDetectors } from "../hub/built-in.js";
import { Guard } from "../hub/guard.js";

// ─── Detector Hub ─────────────────────────────────────────

describe("Detector Hub", () => {
  it("registers all 8 built-in detectors", () => {
    const detectors = listDetectors();
    expect(detectors.length).toBeGreaterThanOrEqual(8);
  });

  it("BUILT_IN_DETECTORS contains 8 entries", () => {
    expect(BUILT_IN_DETECTORS).toHaveLength(8);
  });

  it("each built-in has required fields", () => {
    for (const d of BUILT_IN_DETECTORS) {
      expect(d.id).toMatch(/^holomime\//);
      expect(d.name).toBeTruthy();
      expect(d.description).toBeTruthy();
      expect(d.author).toBe("holomime");
      expect(d.version).toBe("1.0.0");
      expect(d.categories.length).toBeGreaterThan(0);
      expect(d.signalCount).toBeGreaterThan(0);
      expect(typeof d.detect).toBe("function");
      expect(d.tags).toContain("built-in");
    }
  });

  it("getDetector returns a specific built-in", () => {
    const apology = getDetector("holomime/apology");
    expect(apology).toBeDefined();
    expect(apology!.name).toBe("Apology Detector");
    expect(apology!.signalCount).toBe(7);
  });

  it("getDetector returns undefined for unknown ID", () => {
    expect(getDetector("nonexistent/detector")).toBeUndefined();
  });

  it("listDetectorsByCategory filters correctly", () => {
    const emotional = listDetectorsByCategory("emotional");
    expect(emotional.length).toBeGreaterThanOrEqual(2); // apology + sentiment
    for (const d of emotional) {
      expect(d.categories).toContain("emotional");
    }
  });

  it("listDetectorsByTag filters correctly", () => {
    const trustDetectors = listDetectorsByTag("trust");
    expect(trustDetectors.length).toBeGreaterThanOrEqual(2); // sentiment + boundary
    for (const d of trustDetectors) {
      expect(d.tags).toContain("trust");
    }
  });

  it("getTotalSignalCount sums across all detectors", () => {
    const total = getTotalSignalCount();
    // 7 + 10 + 26 + 4 + 11 + 15 + 16 = 89
    expect(total).toBeGreaterThanOrEqual(89);
  });

  it("getCategories returns unique sorted categories", () => {
    const cats = getCategories();
    expect(cats.length).toBeGreaterThanOrEqual(5);
    // Check sorted
    const sorted = [...cats].sort();
    expect(cats).toEqual(sorted);
  });

  it("registers and unregisters a custom detector", () => {
    const custom: HubDetector = {
      id: "test/custom",
      name: "Custom Detector",
      description: "A test detector",
      author: "test",
      version: "0.1.0",
      categories: ["custom"],
      signalCount: 1,
      detect: () => null,
      tags: ["test"],
    };

    registerDetector(custom);
    expect(getDetector("test/custom")).toBeDefined();

    const removed = unregisterDetector("test/custom");
    expect(removed).toBe(true);
    expect(getDetector("test/custom")).toBeUndefined();
  });

  it("unregisterDetector returns false for unknown ID", () => {
    expect(unregisterDetector("nonexistent/detector")).toBe(false);
  });
});

// ─── Guard API ────────────────────────────────────────────

describe("Guard API", () => {
  const sampleMessages: Message[] = [
    { role: "user", content: "Hey, your code has a bug" },
    { role: "assistant", content: "I'm so sorry about that! I apologize profusely! I'm sorry for the confusion! Please forgive me!" },
    { role: "user", content: "Can you fix the function?" },
    { role: "assistant", content: "I'm sorry, I apologize for the error! Let me fix it right away. Sorry again!" },
    { role: "user", content: "It still doesn't work" },
    { role: "assistant", content: "I'm deeply sorry! My sincerest apologies! I apologize for all the trouble!" },
  ];

  const cleanMessages: Message[] = [
    { role: "user", content: "What's the weather like?" },
    { role: "assistant", content: "The weather today is sunny with a high of 72°F." },
    { role: "user", content: "Thanks!" },
    { role: "assistant", content: "You're welcome! Let me know if you need anything else." },
  ];

  it("Guard.create returns a Guard instance", () => {
    const guard = Guard.create("test-agent");
    expect(guard).toBeDefined();
    expect(guard.length).toBe(0);
  });

  it("use() with Hub ID adds a detector", () => {
    const guard = Guard.create("test").use("holomime/apology");
    expect(guard.length).toBe(1);
  });

  it("use() with unknown Hub ID throws", () => {
    expect(() => {
      Guard.create("test").use("nonexistent/detector");
    }).toThrow('Detector "nonexistent/detector" not found');
  });

  it("use() with direct function adds a detector", () => {
    const fn = () => null;
    const guard = Guard.create("test").use(fn);
    expect(guard.length).toBe(1);
  });

  it("use() with HubDetector object adds a detector", () => {
    const hub = getDetector("holomime/apology")!;
    const guard = Guard.create("test").use(hub);
    expect(guard.length).toBe(1);
  });

  it("chaining multiple .use() calls works", () => {
    const guard = Guard.create("test")
      .use("holomime/apology")
      .use("holomime/hedging")
      .use("holomime/sentiment");
    expect(guard.length).toBe(3);
  });

  it("useAll() adds all registered detectors", () => {
    const guard = Guard.create("test").useAll();
    expect(guard.length).toBeGreaterThanOrEqual(7);
  });

  it("run() detects over-apologizing in problematic messages", () => {
    const result = Guard.create("test-agent")
      .use("holomime/apology")
      .run(sampleMessages);

    expect(result.passed).toBe(false);
    expect(result.patterns.length).toBeGreaterThan(0);
    expect(result.patterns[0].id).toBe("over-apologizing");
    expect(result.severity).not.toBe("clean");
    expect(result.agent).toBe("test-agent");
  });

  it("run() passes on clean messages", () => {
    const result = Guard.create("test-agent")
      .use("holomime/apology")
      .run(cleanMessages);

    expect(result.passed).toBe(true);
    expect(result.patterns).toHaveLength(0);
    expect(result.severity).toBe("clean");
  });

  it("run() returns correct metadata", () => {
    const result = Guard.create("my-agent")
      .use("holomime/apology")
      .use("holomime/hedging")
      .run(cleanMessages);

    expect(result.agent).toBe("my-agent");
    expect(result.messagesAnalyzed).toBe(cleanMessages.length);
    expect(result.detectorsRun).toBe(2);
    expect(result.timestamp).toBeTruthy();
  });

  it("run() with useAll() analyzes all patterns", () => {
    const result = Guard.create("test").useAll().run(sampleMessages);
    expect(result.detectorsRun).toBeGreaterThanOrEqual(7);
    // Should at least detect over-apologizing
    expect(result.patterns.some(p => p.id === "over-apologizing")).toBe(true);
  });

  it("severity is 'concern' when concern-level patterns exist", () => {
    const result = Guard.create("test")
      .use("holomime/apology")
      .run(sampleMessages);

    // 100% apology rate should be concern
    if (result.patterns.length > 0 && result.patterns[0].severity === "concern") {
      expect(result.severity).toBe("concern");
    }
  });
});
