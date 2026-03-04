import { describe, it, expect } from "vitest";
import {
  pairAgents,
  discoverNetworkAgents,
  type NetworkNode,
} from "../analysis/network-core.js";
import type { DiagnosisResult } from "../analysis/diagnose-core.js";

// Helper to create a diagnosis with a given number of concerns and warnings
function makeDiagnosis(concerns: number, warnings: number): DiagnosisResult {
  const patterns: any[] = [];
  for (let i = 0; i < concerns; i++) {
    patterns.push({ id: `concern-${i}`, name: `Concern ${i}`, severity: "concern", count: 1, percentage: 10, description: "" });
  }
  for (let i = 0; i < warnings; i++) {
    patterns.push({ id: `warning-${i}`, name: `Warning ${i}`, severity: "warning", count: 1, percentage: 5, description: "" });
  }
  return {
    messagesAnalyzed: 100,
    assistantResponses: 50,
    patterns,
    healthy: [],
    timestamp: new Date().toISOString(),
  };
}

describe("Network Core", () => {
  describe("pairAgents — severity strategy", () => {
    it("pairs healthiest with sickest", () => {
      const agents: NetworkNode[] = [
        { name: "healthy", specPath: "/a/.personality.json", role: "both" },
        { name: "sick", specPath: "/b/.personality.json", role: "both" },
        { name: "medium", specPath: "/c/.personality.json", role: "both" },
        { name: "very-sick", specPath: "/d/.personality.json", role: "both" },
      ];

      const diagnoses = new Map<string, DiagnosisResult>([
        ["healthy", makeDiagnosis(0, 0)],     // health: 100
        ["sick", makeDiagnosis(2, 1)],         // health: 100 - 40 - 10 = 50
        ["medium", makeDiagnosis(1, 0)],       // health: 100 - 20 = 80
        ["very-sick", makeDiagnosis(3, 2)],    // health: 100 - 60 - 20 = 20
      ]);

      const pairs = pairAgents(agents, diagnoses, "severity");
      expect(pairs).toHaveLength(2);

      // Healthiest (100) treats sickest (20)
      expect(pairs[0].therapist.name).toBe("healthy");
      expect(pairs[0].patient.name).toBe("very-sick");

      // Second healthiest (80) treats second sickest (50)
      expect(pairs[1].therapist.name).toBe("medium");
      expect(pairs[1].patient.name).toBe("sick");
    });

    it("returns empty for single agent", () => {
      const agents: NetworkNode[] = [
        { name: "solo", specPath: "/a/.personality.json" },
      ];
      const pairs = pairAgents(agents, new Map(), "severity");
      expect(pairs).toHaveLength(0);
    });

    it("returns empty for zero agents", () => {
      const pairs = pairAgents([], new Map(), "severity");
      expect(pairs).toHaveLength(0);
    });
  });

  describe("pairAgents — round-robin strategy", () => {
    it("pairs each agent with the next", () => {
      const agents: NetworkNode[] = [
        { name: "a", specPath: "/a/.personality.json", role: "both" },
        { name: "b", specPath: "/b/.personality.json", role: "both" },
        { name: "c", specPath: "/c/.personality.json", role: "both" },
      ];

      const pairs = pairAgents(agents, new Map(), "round-robin");
      expect(pairs).toHaveLength(3);
      expect(pairs[0].therapist.name).toBe("a");
      expect(pairs[0].patient.name).toBe("b");
      expect(pairs[1].therapist.name).toBe("b");
      expect(pairs[1].patient.name).toBe("c");
      expect(pairs[2].therapist.name).toBe("c");
      expect(pairs[2].patient.name).toBe("a");
    });
  });

  describe("pairAgents — complementary strategy", () => {
    it("falls back to severity when specs cannot be loaded", () => {
      const agents: NetworkNode[] = [
        { name: "a", specPath: "/nonexistent/a/.personality.json", role: "both" },
        { name: "b", specPath: "/nonexistent/b/.personality.json", role: "both" },
      ];

      const diagnoses = new Map<string, DiagnosisResult>([
        ["a", makeDiagnosis(0, 0)],
        ["b", makeDiagnosis(2, 0)],
      ]);

      const pairs = pairAgents(agents, diagnoses, "complementary");
      // Should fall back to severity
      expect(pairs).toHaveLength(1);
    });
  });

  describe("discoverNetworkAgents", () => {
    it("throws for non-existent directory", () => {
      expect(() => discoverNetworkAgents("/nonexistent/path")).toThrow("Directory not found");
    });
  });
});
