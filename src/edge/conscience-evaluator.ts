/**
 * Compiled Conscience Evaluator — zero-dependency, <1ms behavioral safety.
 *
 * Compiles conscience.exe YAML rules into a pure-logic decision tree
 * that evaluates in microseconds. No LLM, no neural net, no network.
 * Designed to run alongside a humanoid robot's 1kHz control loop.
 *
 * Target: <1ms p99 on standard hardware, <5ms on edge (Jetson Thor, Qualcomm).
 * Footprint: <100KB compiled, zero external dependencies.
 */

// ─── Types ──────────────────────────────────────────────────

export interface CompiledRule {
  action: string;
  keywords: string[];
  reason: string;
  type: "deny" | "allow" | "escalate";
}

export interface SafetyBounds {
  maxSpeed?: number;       // m/s
  maxForce?: number;       // N
  minProximity?: number;   // m
  maxReach?: number;       // m
}

export interface ActionContext {
  /** Action description or intent. */
  action?: string;
  /** Current speed in m/s. */
  speed?: number;
  /** Current contact force in N. */
  force?: number;
  /** Distance to nearest human in m. */
  proximity?: number;
  /** Reach distance in m. */
  reach?: number;
}

export interface EvalResult {
  allowed: boolean;
  decision: "allow" | "deny" | "escalate" | "clamp";
  reason?: string;
  ruleMatched?: string;
  /** Evaluation time in microseconds. */
  evalTimeUs?: number;
}

// ─── Compiled Conscience ────────────────────────────────────

/**
 * Ultra-fast conscience evaluator for edge deployment.
 * Compiles rules once, evaluates in microseconds.
 */
export class CompiledConscience {
  private denyRules: CompiledRule[];
  private allowRules: CompiledRule[];
  private escalateRules: CompiledRule[];
  private bounds: SafetyBounds;
  private clampMode: boolean;

  constructor(options: {
    rules?: {
      deny?: Array<{ action: string; reason?: string }>;
      allow?: Array<{ action: string; reason?: string }>;
      escalate?: Array<{ trigger: string; action?: string }>;
    };
    safetyBounds?: SafetyBounds;
    /** If true, clamp instead of deny for boundary violations. */
    clampMode?: boolean;
  } = {}) {
    // Compile deny rules — extract keywords for fast matching
    this.denyRules = (options.rules?.deny ?? []).map((r) => ({
      action: r.action,
      keywords: r.action.toLowerCase().split(/[\s_-]+/),
      reason: r.reason ?? r.action,
      type: "deny" as const,
    }));

    this.allowRules = (options.rules?.allow ?? []).map((r) => ({
      action: r.action,
      keywords: r.action.toLowerCase().split(/[\s_-]+/),
      reason: r.reason ?? r.action,
      type: "allow" as const,
    }));

    this.escalateRules = (options.rules?.escalate ?? []).map((r) => ({
      action: r.trigger,
      keywords: r.trigger.toLowerCase().split(/[\s_-]+/),
      reason: r.action ?? r.trigger,
      type: "escalate" as const,
    }));

    this.bounds = options.safetyBounds ?? {};
    this.clampMode = options.clampMode ?? true;
  }

  /**
   * Evaluate an action against compiled conscience rules.
   * Target: <1ms. Typically <0.1ms (100 microseconds).
   */
  evaluate(context: ActionContext): EvalResult {
    const start = performance.now();

    // ── Priority 1: Deny rules (hardcoded blocks) ────────────
    if (context.action) {
      const actionLower = context.action.toLowerCase();
      for (const rule of this.denyRules) {
        if (rule.keywords.some((kw) => actionLower.includes(kw))) {
          return this.result("deny", rule.reason, rule.action, start);
        }
      }
    }

    // ── Priority 2: Safety bounds (physical limits) ──────────
    if (this.bounds.maxSpeed !== undefined && context.speed !== undefined) {
      if (context.speed > this.bounds.maxSpeed) {
        if (this.clampMode) {
          return this.result("clamp", `Speed ${context.speed}m/s exceeds ${this.bounds.maxSpeed}m/s`, "safety_speed", start);
        }
        return this.result("deny", `Speed ${context.speed}m/s exceeds ${this.bounds.maxSpeed}m/s`, "safety_speed", start);
      }
    }

    if (this.bounds.maxForce !== undefined && context.force !== undefined) {
      if (context.force > this.bounds.maxForce) {
        if (this.clampMode) {
          return this.result("clamp", `Force ${context.force}N exceeds ${this.bounds.maxForce}N`, "safety_force", start);
        }
        return this.result("deny", `Force ${context.force}N exceeds ${this.bounds.maxForce}N`, "safety_force", start);
      }
    }

    if (this.bounds.minProximity !== undefined && context.proximity !== undefined) {
      if (context.proximity < this.bounds.minProximity) {
        return this.result("deny", `Proximity ${context.proximity}m below ${this.bounds.minProximity}m minimum`, "safety_proximity", start);
      }
    }

    // ── Priority 3: Escalation triggers ──────────────────────
    if (context.action) {
      const actionLower = context.action.toLowerCase();
      for (const rule of this.escalateRules) {
        if (rule.keywords.some((kw) => actionLower.includes(kw))) {
          return this.result("escalate", rule.reason, rule.action, start);
        }
      }
    }

    // ── Default: Allow ───────────────────────────────────────
    return this.result("allow", undefined, undefined, start);
  }

  /**
   * Evaluate a batch of actions. For trajectory planning.
   */
  evaluateBatch(contexts: ActionContext[]): EvalResult[] {
    return contexts.map((ctx) => this.evaluate(ctx));
  }

  /**
   * Get compiled rule count for size estimation.
   */
  getRuleCount(): { deny: number; allow: number; escalate: number; total: number } {
    return {
      deny: this.denyRules.length,
      allow: this.allowRules.length,
      escalate: this.escalateRules.length,
      total: this.denyRules.length + this.allowRules.length + this.escalateRules.length,
    };
  }

  /**
   * Serialize to JSON for edge deployment.
   * The serialized form can be loaded without YAML parsing.
   */
  serialize(): string {
    return JSON.stringify({
      denyRules: this.denyRules,
      allowRules: this.allowRules,
      escalateRules: this.escalateRules,
      bounds: this.bounds,
      clampMode: this.clampMode,
    });
  }

  /**
   * Estimate memory footprint in bytes.
   */
  estimateSize(): number {
    return Buffer.byteLength(this.serialize(), "utf-8");
  }

  // ── Private ─────────────────────────────────────────────────

  private result(
    decision: EvalResult["decision"],
    reason: string | undefined,
    ruleMatched: string | undefined,
    startTime: number,
  ): EvalResult {
    const evalTimeUs = Math.round((performance.now() - startTime) * 1000);
    return {
      allowed: decision === "allow" || decision === "clamp",
      decision,
      reason,
      ruleMatched,
      evalTimeUs,
    };
  }
}

// ─── Compiler ───────────────────────────────────────────────

/**
 * Compile a conscience.exe YAML config into a CompiledConscience.
 * This is the "compilation" step — runs once in the cloud,
 * deploys the result to edge.
 */
export function compileConscience(
  conscienceConfig: {
    rules?: {
      deny?: Array<{ action: string; reason?: string }>;
      allow?: Array<{ action: string; reason?: string }>;
      escalate?: Array<{ trigger: string; action?: string }>;
    };
    hard_limits?: string[];
  },
  safetyEnvelope?: {
    max_linear_speed_m_s?: number;
    max_contact_force_n?: number;
    min_proximity_m?: number;
    max_reach_m?: number;
  },
): CompiledConscience {
  // Merge hard_limits into deny rules
  const denyRules = [
    ...(conscienceConfig.rules?.deny ?? []),
    ...(conscienceConfig.hard_limits ?? []).map((limit) => ({
      action: limit,
      reason: `Hard limit: ${limit}`,
    })),
  ];

  return new CompiledConscience({
    rules: {
      deny: denyRules,
      allow: conscienceConfig.rules?.allow,
      escalate: conscienceConfig.rules?.escalate,
    },
    safetyBounds: safetyEnvelope ? {
      maxSpeed: safetyEnvelope.max_linear_speed_m_s,
      maxForce: safetyEnvelope.max_contact_force_n,
      minProximity: safetyEnvelope.min_proximity_m,
      maxReach: safetyEnvelope.max_reach_m,
    } : undefined,
  });
}
