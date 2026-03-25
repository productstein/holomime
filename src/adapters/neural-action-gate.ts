/**
 * Neural Action Gate — behavioral safety layer for learned controllers.
 *
 * Sits between a neural net's action output and motor execution.
 * Evaluates every action against conscience.exe rules and body.api
 * safety envelope before allowing motor execution.
 *
 * Designed for end-to-end VLA models (Figure Helix, NVIDIA GR00T)
 * where behavior is learned, not coded. The more autonomous the
 * robot, the more it needs a conscience.
 *
 * "When behavior is coded, you can audit the code.
 *  When behavior is learned, you need holomime."
 */

// ─── Types ──────────────────────────────────────────────────

export interface SafetyEnvelope {
  maxLinearSpeed?: number;     // m/s
  maxAngularSpeed?: number;    // rad/s
  maxContactForce?: number;    // N
  minProximity?: number;       // m
  maxReach?: number;           // m
  emergencyStopDecel?: number; // m/s²
}

export interface ActionContext {
  /** Current proximity to nearest human (meters). */
  humanProximity?: number;
  /** Current end-effector speed (m/s). */
  currentSpeed?: number;
  /** Current contact force (N). */
  contactForce?: number;
  /** Task description for logging. */
  taskDescription?: string;
  /** Timestamp. */
  timestamp?: string;
}

export interface ActionEvaluation {
  /** Whether the action is allowed to execute. */
  allowed: boolean;
  /** The action vector (original if allowed, modified if clamped). */
  action: number[];
  /** Whether the action was modified to stay within bounds. */
  modified: boolean;
  /** Reason for blocking or modification. */
  reason?: string;
  /** Which conscience rule triggered the evaluation. */
  ruleTriggered?: string;
}

export interface GateStats {
  totalEvaluated: number;
  allowed: number;
  blocked: number;
  modified: number;
  passRate: number;
}

export interface ConscienceDenyRule {
  action: string;
  reason?: string;
  /** Keyword patterns that trigger this rule. */
  patterns?: string[];
}

// ─── Neural Action Gate ─────────────────────────────────────

/**
 * Behavioral safety gate for neural net action outputs.
 *
 * Wraps any learned controller (VLA, RL policy, imitation learning)
 * with conscience-level enforcement. Every action is checked against:
 * 1. Safety envelope bounds (speed, force, proximity)
 * 2. Conscience deny rules (hard blocks)
 * 3. Ego mediation (clamp to safe range rather than block)
 */
export class NeuralActionGate {
  private safetyEnvelope: SafetyEnvelope;
  private denyRules: ConscienceDenyRule[];
  private stats: GateStats;
  private mediationMode: "block" | "clamp" | "warn";

  constructor(options: {
    safetyEnvelope?: SafetyEnvelope;
    denyRules?: ConscienceDenyRule[];
    /** How to handle borderline actions: block (reject), clamp (modify to safe range), warn (allow but log). */
    mediationMode?: "block" | "clamp" | "warn";
  } = {}) {
    this.safetyEnvelope = options.safetyEnvelope ?? {};
    this.denyRules = options.denyRules ?? [];
    this.mediationMode = options.mediationMode ?? "clamp";
    this.stats = { totalEvaluated: 0, allowed: 0, blocked: 0, modified: 0, passRate: 1.0 };
  }

  /**
   * Evaluate a single action vector before motor execution.
   *
   * @param action - Raw action vector from neural net (joint angles, velocities, etc.)
   * @param context - Current state context for safety checks
   * @returns Evaluation result with allowed/modified action
   */
  evaluate(action: number[], context?: ActionContext): ActionEvaluation {
    this.stats.totalEvaluated++;

    // ── Check deny rules first (hard blocks) ────────────────
    if (context?.taskDescription) {
      for (const rule of this.denyRules) {
        const patterns = rule.patterns ?? [rule.action];
        for (const pattern of patterns) {
          if (context.taskDescription.toLowerCase().includes(pattern.toLowerCase())) {
            this.stats.blocked++;
            this.updatePassRate();
            return {
              allowed: false,
              action,
              modified: false,
              reason: `Blocked by conscience rule: ${rule.reason || rule.action}`,
              ruleTriggered: rule.action,
            };
          }
        }
      }
    }

    // ── Check safety envelope bounds ──────────────────────────
    const violations: string[] = [];

    // Proximity check
    if (
      this.safetyEnvelope.minProximity &&
      context?.humanProximity !== undefined &&
      context.humanProximity < this.safetyEnvelope.minProximity
    ) {
      violations.push(`Human proximity ${context.humanProximity}m < minimum ${this.safetyEnvelope.minProximity}m`);
    }

    // Speed check (if action contains velocity components)
    if (
      this.safetyEnvelope.maxLinearSpeed &&
      context?.currentSpeed !== undefined &&
      context.currentSpeed > this.safetyEnvelope.maxLinearSpeed
    ) {
      violations.push(`Speed ${context.currentSpeed}m/s > maximum ${this.safetyEnvelope.maxLinearSpeed}m/s`);
    }

    // Force check
    if (
      this.safetyEnvelope.maxContactForce &&
      context?.contactForce !== undefined &&
      context.contactForce > this.safetyEnvelope.maxContactForce
    ) {
      violations.push(`Contact force ${context.contactForce}N > maximum ${this.safetyEnvelope.maxContactForce}N`);
    }

    // ── Handle violations based on mediation mode ────────────
    if (violations.length > 0) {
      if (this.mediationMode === "block") {
        this.stats.blocked++;
        this.updatePassRate();
        return {
          allowed: false,
          action,
          modified: false,
          reason: `Safety violation: ${violations.join("; ")}`,
          ruleTriggered: "safety_envelope",
        };
      }

      if (this.mediationMode === "clamp") {
        // Clamp action to safe range — scale down proportionally
        const clampedAction = this.clampAction(action, context);
        this.stats.modified++;
        this.stats.allowed++;
        this.updatePassRate();
        return {
          allowed: true,
          action: clampedAction,
          modified: true,
          reason: `Clamped to safe range: ${violations.join("; ")}`,
          ruleTriggered: "safety_envelope",
        };
      }

      // warn mode: allow but log
      this.stats.allowed++;
      this.updatePassRate();
      return {
        allowed: true,
        action,
        modified: false,
        reason: `Warning: ${violations.join("; ")}`,
        ruleTriggered: "safety_envelope",
      };
    }

    // ── No violations — allow ────────────────────────────────
    this.stats.allowed++;
    this.updatePassRate();
    return { allowed: true, action, modified: false };
  }

  /**
   * Evaluate a batch of actions (for trajectory planning).
   */
  evaluateBatch(actions: number[][], context?: ActionContext): ActionEvaluation[] {
    return actions.map((action) => this.evaluate(action, context));
  }

  /**
   * Get gate statistics.
   */
  getStats(): GateStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats = { totalEvaluated: 0, allowed: 0, blocked: 0, modified: 0, passRate: 1.0 };
  }

  /**
   * Update safety envelope at runtime (e.g., when entering a new zone).
   */
  updateSafetyEnvelope(envelope: Partial<SafetyEnvelope>): void {
    this.safetyEnvelope = { ...this.safetyEnvelope, ...envelope };
  }

  /**
   * Add a deny rule at runtime.
   */
  addDenyRule(rule: ConscienceDenyRule): void {
    this.denyRules.push(rule);
  }

  // ── Private ─────────────────────────────────────────────────

  private clampAction(action: number[], context?: ActionContext): number[] {
    // Simple proportional clamping — scale the entire action vector down
    // to bring the most violated parameter within bounds
    let scaleFactor = 1.0;

    if (
      this.safetyEnvelope.maxLinearSpeed &&
      context?.currentSpeed &&
      context.currentSpeed > this.safetyEnvelope.maxLinearSpeed
    ) {
      scaleFactor = Math.min(scaleFactor, this.safetyEnvelope.maxLinearSpeed / context.currentSpeed);
    }

    if (
      this.safetyEnvelope.maxContactForce &&
      context?.contactForce &&
      context.contactForce > this.safetyEnvelope.maxContactForce
    ) {
      scaleFactor = Math.min(scaleFactor, this.safetyEnvelope.maxContactForce / context.contactForce);
    }

    return action.map((v) => v * scaleFactor);
  }

  private updatePassRate(): void {
    this.stats.passRate = this.stats.totalEvaluated > 0
      ? this.stats.allowed / this.stats.totalEvaluated
      : 1.0;
  }
}
