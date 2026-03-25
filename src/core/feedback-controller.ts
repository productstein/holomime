/**
 * Behavioral Feedback Controller — formalizes the therapy loop
 * as a PID-like feedback control system.
 *
 * Set point:  target personality (soul.md + mind.sys)
 * Plant:      the AI agent/robot
 * Sensor:     drift detectors (11 behavioral + 3 embodied)
 * Error:      delta between spec and actual behavior
 * Controller: therapy engine with tunable gains
 * Actuator:   DPO fine-tuning
 *
 * The controller reads the target personality from PersonalitySpec (Big Five
 * scores) and compares against measured values from drift detectors. When the
 * correction signal exceeds the configured threshold, therapy is triggered.
 */

import type { BigFive } from "./types.js";

// ─── Configuration ─────────────────────────────────────────

export interface ControllerConfig {
  /** Proportional gain: how aggressively therapy corrects current error (0-1). */
  proportionalGain: number;
  /** Integral gain: how much historical drift accumulates in the correction signal (0-1). */
  integralGain: number;
  /** Derivative gain: sensitivity to rate of change in error (0-1). */
  derivativeGain: number;
  /** Minimum correction signal before therapy triggers (0-1). */
  correctionThreshold: number;
  /** How often to measure, in milliseconds (default: cycle interval). */
  samplingIntervalMs: number;
}

// ─── Controller State ──────────────────────────────────────

export interface ControllerState {
  /** Target trait scores (the "set point"). */
  setPoint: Record<string, number>;
  /** Most recently measured trait scores. */
  measured: Record<string, number>;
  /** Current error per trait (setPoint - measured). */
  error: Record<string, number>;
  /** Accumulated error over time per trait. */
  integralError: Record<string, number>;
  /** Previous error per trait (for derivative computation). */
  previousError: Record<string, number>;
  /** Overall correction signal strength (0-1). */
  correctionSignal: number;
  /** Whether the correction signal exceeds the configured threshold. */
  shouldCorrect: boolean;
}

// ─── Correction Priority ────────────────────────────────────

export interface CorrectionPriority {
  /** Trait name (e.g. "openness", "conscientiousness"). */
  trait: string;
  /** Absolute error magnitude. */
  errorMagnitude: number;
  /** Direction of drift: "elevated" if actual > spec, "suppressed" if actual < spec. */
  direction: "elevated" | "suppressed";
  /** The PID-computed correction signal for this trait. */
  signal: number;
}

// ─── Default Configuration ──────────────────────────────────

export const DEFAULT_CONTROLLER_CONFIG: ControllerConfig = {
  proportionalGain: 0.6,
  integralGain: 0.2,
  derivativeGain: 0.1,
  correctionThreshold: 0.15,
  samplingIntervalMs: 60_000,
};

// ─── Big Five Trait Keys ────────────────────────────────────

const BIG_FIVE_KEYS: readonly string[] = [
  "openness",
  "conscientiousness",
  "extraversion",
  "agreeableness",
  "emotional_stability",
] as const;

// ─── Controller ─────────────────────────────────────────────

export class BehavioralFeedbackController {
  private readonly config: ControllerConfig;
  private readonly setPoint: Record<string, number>;
  private measured: Record<string, number>;
  private error: Record<string, number>;
  private integralError: Record<string, number>;
  private previousError: Record<string, number>;
  private correctionSignal: number;
  private updateCount: number;

  constructor(targetPersonality: BigFive, config?: Partial<ControllerConfig>) {
    this.config = { ...DEFAULT_CONTROLLER_CONFIG, ...config };

    // Extract Big Five dimension scores as the set point
    this.setPoint = {};
    for (const key of BIG_FIVE_KEYS) {
      const dim = targetPersonality[key as keyof BigFive];
      this.setPoint[key] = dim.score;
    }

    // Initialize all state to zero error
    this.measured = {};
    this.error = {};
    this.integralError = {};
    this.previousError = {};
    for (const key of BIG_FIVE_KEYS) {
      this.measured[key] = this.setPoint[key];
      this.error[key] = 0;
      this.integralError[key] = 0;
      this.previousError[key] = 0;
    }

    this.correctionSignal = 0;
    this.updateCount = 0;
  }

  // ─── Core Update ──────────────────────────────────────────

  /**
   * Feed new measured trait scores into the controller.
   * Computes error, integral, derivative, and overall correction signal.
   *
   * @param measured — Record of trait name to measured score (0-1).
   *                   Only Big Five dimensions are used; others are ignored.
   */
  update(measured: Record<string, number>): void {
    this.updateCount++;

    for (const key of BIG_FIVE_KEYS) {
      if (!(key in measured)) continue;

      const target = this.setPoint[key];
      const actual = clamp(measured[key], 0, 1);

      // Store previous error for derivative
      this.previousError[key] = this.error[key];

      // Compute current error (signed: positive means actual is below target)
      this.error[key] = target - actual;

      // Accumulate integral error (clamped to prevent windup)
      this.integralError[key] = clamp(
        this.integralError[key] + this.error[key],
        -1,
        1,
      );

      // Store measurement
      this.measured[key] = actual;
    }

    // Compute per-trait PID signals, then aggregate
    let totalSignal = 0;
    let traitCount = 0;

    for (const key of BIG_FIVE_KEYS) {
      const signal = this.computeTraitSignal(key);
      totalSignal += Math.abs(signal);
      traitCount++;
    }

    // Overall correction signal = average absolute PID signal across all traits
    this.correctionSignal = traitCount > 0
      ? clamp(totalSignal / traitCount, 0, 1)
      : 0;
  }

  // ─── Queries ──────────────────────────────────────────────

  /**
   * Whether therapy should be triggered based on the current correction signal.
   */
  shouldTriggerTherapy(): boolean {
    return this.correctionSignal >= this.config.correctionThreshold;
  }

  /**
   * Returns traits sorted by error magnitude (largest first).
   * These represent the priorities for therapy correction.
   */
  getCorrectionPriorities(): CorrectionPriority[] {
    const priorities: CorrectionPriority[] = [];

    for (const key of BIG_FIVE_KEYS) {
      const err = this.error[key];
      const magnitude = Math.abs(err);

      if (magnitude < 0.01) continue; // Skip negligible errors

      priorities.push({
        trait: key,
        errorMagnitude: magnitude,
        direction: err > 0 ? "suppressed" : "elevated",
        signal: this.computeTraitSignal(key),
      });
    }

    // Sort by error magnitude descending
    priorities.sort((a, b) => b.errorMagnitude - a.errorMagnitude);
    return priorities;
  }

  /**
   * Returns the full controller state for dashboard display or logging.
   */
  getControllerState(): ControllerState {
    return {
      setPoint: { ...this.setPoint },
      measured: { ...this.measured },
      error: { ...this.error },
      integralError: { ...this.integralError },
      previousError: { ...this.previousError },
      correctionSignal: this.correctionSignal,
      shouldCorrect: this.shouldTriggerTherapy(),
    };
  }

  /**
   * Clear all accumulated integral and derivative state.
   * Useful after a therapy session successfully corrects behavior.
   */
  reset(): void {
    for (const key of BIG_FIVE_KEYS) {
      this.measured[key] = this.setPoint[key];
      this.error[key] = 0;
      this.integralError[key] = 0;
      this.previousError[key] = 0;
    }
    this.correctionSignal = 0;
    this.updateCount = 0;
  }

  /**
   * Get the controller configuration.
   */
  getConfig(): Readonly<ControllerConfig> {
    return this.config;
  }

  /**
   * Get the number of updates processed.
   */
  getUpdateCount(): number {
    return this.updateCount;
  }

  // ─── Internal ─────────────────────────────────────────────

  /**
   * Compute the PID signal for a single trait.
   */
  private computeTraitSignal(trait: string): number {
    const p = this.config.proportionalGain * this.error[trait];
    const i = this.config.integralGain * this.integralError[trait];
    const d = this.config.derivativeGain * (this.error[trait] - this.previousError[trait]);
    return p + i + d;
  }
}

// ─── Utility ────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
