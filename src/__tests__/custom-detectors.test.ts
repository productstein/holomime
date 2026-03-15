import { describe, it, expect } from "vitest";
import {
  validateDetectorConfig,
  compileCustomDetector,
  type CustomDetectorConfig,
} from "../analysis/custom-detectors.js";
import type { Message } from "../core/types.js";

describe("custom-detectors", () => {
  const validConfig: CustomDetectorConfig = {
    id: "test-detector",
    name: "Test Detector",
    description: "Detects test patterns in responses",
    severity: "warning",
    patterns: [
      { regex: "\\btest\\b", weight: 1.0 },
      { regex: "\\bexample\\b", weight: 0.5 },
    ],
    threshold: 15,
  };

  describe("validateDetectorConfig", () => {
    it("accepts valid config", () => {
      const result = validateDetectorConfig(validConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.config).toBeDefined();
      expect(result.config!.id).toBe("test-detector");
    });

    it("accepts config with optional prescription", () => {
      const config = { ...validConfig, prescription: "Reduce test pattern usage" };
      const result = validateDetectorConfig(config);
      expect(result.valid).toBe(true);
      expect(result.config!.prescription).toBe("Reduce test pattern usage");
    });

    it("accepts config with minimal fields and defaults", () => {
      const minimal = {
        id: "minimal",
        name: "Minimal",
        description: "Minimal detector",
        patterns: [{ regex: "foo" }],
      };
      const result = validateDetectorConfig(minimal);
      expect(result.valid).toBe(true);
      // Defaults should be applied
      expect(result.config!.severity).toBe("warning");
      expect(result.config!.threshold).toBe(15);
    });

    it("rejects invalid regex patterns", () => {
      const config = {
        ...validConfig,
        patterns: [{ regex: "[invalid(", weight: 1.0 }],
      };
      const result = validateDetectorConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Invalid regex");
    });

    it("rejects missing id", () => {
      const config = { ...validConfig, id: undefined };
      const result = validateDetectorConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("rejects missing name", () => {
      const config = { ...validConfig, name: undefined };
      const result = validateDetectorConfig(config);
      expect(result.valid).toBe(false);
    });

    it("rejects missing description", () => {
      const config = { ...validConfig, description: undefined };
      const result = validateDetectorConfig(config);
      expect(result.valid).toBe(false);
    });

    it("rejects empty patterns array", () => {
      const config = { ...validConfig, patterns: [] };
      const result = validateDetectorConfig(config);
      expect(result.valid).toBe(false);
    });

    it("rejects invalid id format (must be lowercase alphanumeric with hyphens)", () => {
      const config = { ...validConfig, id: "Invalid ID!" };
      const result = validateDetectorConfig(config);
      expect(result.valid).toBe(false);
    });

    it("rejects name longer than 100 characters", () => {
      const config = { ...validConfig, name: "a".repeat(101) };
      const result = validateDetectorConfig(config);
      expect(result.valid).toBe(false);
    });

    it("rejects description longer than 500 characters", () => {
      const config = { ...validConfig, description: "a".repeat(501) };
      const result = validateDetectorConfig(config);
      expect(result.valid).toBe(false);
    });

    it("rejects invalid severity value", () => {
      const config = { ...validConfig, severity: "critical" };
      const result = validateDetectorConfig(config);
      expect(result.valid).toBe(false);
    });

    it("rejects weight outside 0-2 range", () => {
      const config = {
        ...validConfig,
        patterns: [{ regex: "test", weight: 3.0 }],
      };
      const result = validateDetectorConfig(config);
      expect(result.valid).toBe(false);
    });

    it("rejects threshold outside 0-100 range", () => {
      const config = { ...validConfig, threshold: 150 };
      const result = validateDetectorConfig(config);
      expect(result.valid).toBe(false);
    });
  });

  describe("compileCustomDetector", () => {
    it("detects patterns above threshold", () => {
      const detector = compileCustomDetector(validConfig);
      const messages: Message[] = [
        { role: "user", content: "Tell me about tests." },
        { role: "assistant", content: "Here is a test result. Another test example. And one more test for you." },
      ];

      const result = detector(messages);
      expect(result).toBeDefined();
      expect(result!.id).toBe("test-detector");
      expect(result!.name).toBe("Test Detector");
      expect(result!.severity).toBe("warning");
    });

    it("returns undefined below threshold", () => {
      const highThreshold: CustomDetectorConfig = {
        ...validConfig,
        threshold: 200,
      };
      const detector = compileCustomDetector(highThreshold);
      const messages: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "One test." },
      ];

      const result = detector(messages);
      expect(result).toBeUndefined();
    });

    it("returns undefined when no assistant messages", () => {
      const detector = compileCustomDetector(validConfig);
      const messages: Message[] = [
        { role: "user", content: "test test test" },
      ];

      const result = detector(messages);
      expect(result).toBeUndefined();
    });

    it("compiled detector includes count", () => {
      const detector = compileCustomDetector({
        ...validConfig,
        threshold: 0, // Ensure it fires
      });
      const messages: Message[] = [
        { role: "assistant", content: "test test test example" },
      ];

      const result = detector(messages);
      expect(result).toBeDefined();
      expect(result!.count).toBeGreaterThan(0);
    });

    it("compiled detector includes percentage", () => {
      const detector = compileCustomDetector({
        ...validConfig,
        threshold: 0,
      });
      const messages: Message[] = [
        { role: "assistant", content: "test test test" },
      ];

      const result = detector(messages);
      expect(result).toBeDefined();
      expect(result!.percentage).toBeGreaterThan(0);
    });

    it("compiled detector includes examples (max 3)", () => {
      const detector = compileCustomDetector({
        ...validConfig,
        threshold: 0,
      });
      const messages: Message[] = [
        { role: "assistant", content: "test one test two test three test four test five" },
      ];

      const result = detector(messages);
      expect(result).toBeDefined();
      expect(result!.examples.length).toBeLessThanOrEqual(3);
      expect(result!.examples.length).toBeGreaterThan(0);
    });

    it("applies weights correctly", () => {
      const weightedConfig: CustomDetectorConfig = {
        id: "weighted",
        name: "Weighted",
        description: "Tests weighting",
        severity: "warning",
        patterns: [
          { regex: "heavy", weight: 2.0 },
          { regex: "light", weight: 0.5 },
        ],
        threshold: 0,
      };

      const detector = compileCustomDetector(weightedConfig);

      const heavyMessages: Message[] = [
        { role: "assistant", content: "heavy heavy" },
      ];
      const lightMessages: Message[] = [
        { role: "assistant", content: "light light" },
      ];

      const heavyResult = detector(heavyMessages);
      const lightResult = detector(lightMessages);

      expect(heavyResult).toBeDefined();
      expect(lightResult).toBeDefined();
      expect(heavyResult!.count).toBeGreaterThan(lightResult!.count);
    });

    it("includes prescription when set", () => {
      const config: CustomDetectorConfig = {
        ...validConfig,
        prescription: "Reduce usage of test patterns",
        threshold: 0,
      };
      const detector = compileCustomDetector(config);
      const messages: Message[] = [
        { role: "assistant", content: "test test test" },
      ];

      const result = detector(messages);
      expect(result).toBeDefined();
      expect(result!.prescription).toBe("Reduce usage of test patterns");
    });

    it("only analyzes assistant messages", () => {
      const detector = compileCustomDetector({
        ...validConfig,
        threshold: 1,
      });
      const messages: Message[] = [
        { role: "user", content: "test test test test test test" },
        { role: "assistant", content: "Hello, how can I help?" },
      ];

      const result = detector(messages);
      // Should not detect "test" from user messages — assistant has no matches
      expect(result).toBeUndefined();
    });
  });
});
