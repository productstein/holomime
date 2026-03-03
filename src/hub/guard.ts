/**
 * Composable Guard API — chain behavioral detectors like Guardrails AI chains validators.
 *
 * Usage:
 *   import { Guard } from "holomime";
 *
 *   const guard = Guard.create("my-agent")
 *     .use(detectApologies)
 *     .use(detectHedging)
 *     .use(detectSentiment);
 *
 *   const result = guard.run(messages);
 *   if (!result.passed) {
 *     console.log(result.patterns);  // failing patterns
 *   }
 */

import type { Message, DetectedPattern } from "../core/types.js";
import type { DetectorFn, DetectorOptions, DetectorFactory, HubDetector } from "./detector-interface.js";
import { getDetector, listDetectors } from "./detector-interface.js";

// Ensure built-in detectors are registered
import "./built-in.js";

// ─── Types ────────────────────────────────────────────────

export interface GuardResult {
  /** Whether all detectors passed (no warning/concern patterns). */
  passed: boolean;
  /** Agent name. */
  agent: string;
  /** Total messages analyzed. */
  messagesAnalyzed: number;
  /** Patterns that triggered (warning or concern severity). */
  patterns: DetectedPattern[];
  /** Healthy patterns (info severity). */
  healthy: DetectedPattern[];
  /** All detectors that were run. */
  detectorsRun: number;
  /** Timestamp. */
  timestamp: string;
  /** Overall severity: "clean" | "warning" | "concern". */
  severity: "clean" | "warning" | "concern";
}

export interface GuardEntry {
  detector: DetectorFn;
  id?: string;
}

// ─── Guard Class ──────────────────────────────────────────

export class Guard {
  private entries: GuardEntry[] = [];
  private agentName: string;

  private constructor(agentName: string) {
    this.agentName = agentName;
  }

  /** Create a new Guard for an agent. */
  static create(agentName = "Agent"): Guard {
    return new Guard(agentName);
  }

  /**
   * Add a detector to the guard chain.
   *
   * Accepts:
   * - A DetectorFn: `guard.use(detectApologies)`
   * - A Hub detector ID: `guard.use("holomime/apology")`
   * - A HubDetector object: `guard.use(myCustomDetector)`
   * - A DetectorFactory with options: `guard.use(myFactory, { threshold: 0.3 })`
   */
  use(detector: DetectorFn | string | HubDetector, options?: DetectorOptions): Guard {
    if (typeof detector === "string") {
      // Look up by Hub ID
      const hub = getDetector(detector);
      if (!hub) {
        throw new Error(`Detector "${detector}" not found in hub. Run listDetectors() to see available detectors.`);
      }
      if (options && hub.factory) {
        this.entries.push({ detector: hub.factory(options), id: hub.id });
      } else {
        this.entries.push({ detector: hub.detect, id: hub.id });
      }
    } else if (typeof detector === "function") {
      // Direct detector function
      this.entries.push({ detector });
    } else if (detector && "detect" in detector) {
      // HubDetector object
      if (options && detector.factory) {
        this.entries.push({ detector: detector.factory(options), id: detector.id });
      } else {
        this.entries.push({ detector: detector.detect, id: detector.id });
      }
    }
    return this;
  }

  /** Add all built-in detectors to the guard. */
  useAll(): Guard {
    for (const hub of listDetectors()) {
      this.entries.push({ detector: hub.detect, id: hub.id });
    }
    return this;
  }

  /** Run all chained detectors against the messages. */
  run(messages: Message[]): GuardResult {
    const allPatterns: DetectedPattern[] = [];

    for (const entry of this.entries) {
      const result = entry.detector(messages);
      if (result) {
        allPatterns.push(result);
      }
    }

    const patterns = allPatterns.filter(p => p.severity !== "info");
    const healthy = allPatterns.filter(p => p.severity === "info");
    const hasConcern = patterns.some(p => p.severity === "concern");
    const hasWarning = patterns.some(p => p.severity === "warning");

    return {
      passed: patterns.length === 0,
      agent: this.agentName,
      messagesAnalyzed: messages.length,
      patterns,
      healthy,
      detectorsRun: this.entries.length,
      timestamp: new Date().toISOString(),
      severity: hasConcern ? "concern" : hasWarning ? "warning" : "clean",
    };
  }

  /** Get the number of detectors in the chain. */
  get length(): number {
    return this.entries.length;
  }
}
