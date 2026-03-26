/**
 * holomime Edge Runtime — lightweight behavioral safety for robots.
 *
 * Zero dependencies. <200KB. <1ms evaluation.
 * Runs alongside a humanoid robot's 1kHz control loop.
 *
 * Architecture:
 *   Cloud (GPU/TPU)                    On-Robot (Jetson Thor / NPU)
 *   ─────────────────                  ────────────────────────────
 *   Train behavioral models      →     Distilled policy (this module)
 *   Update personality profiles  →     Compiled constraint set
 *   Drift detection analytics    →     Lightweight drift signal
 *   DPO training loop            →     Inference only
 *   Full ego-tracker analysis    →     Real-time ego snapshot
 */

import {
  CompiledConscience,
  compileConscience,
  type ActionContext,
  type EvalResult,
} from "./conscience-evaluator.js";

// ─── Types ──────────────────────────────────────────────────

export interface ShadowSignal {
  pattern: string;
  score: number;
  timestamp: string;
}

export interface EdgeConfig {
  syncIntervalMs: number;
  offlineCapable: boolean;
  shadowBufferSize: number;
}

// ─── Edge Runtime ───────────────────────────────────────────

export class EdgeRuntime {
  private conscience: CompiledConscience;
  private shadowBuffer: ShadowSignal[];
  private config: EdgeConfig;
  private evalTimes: number[];
  private stats: {
    totalEvaluations: number;
    denials: number;
    clamps: number;
    escalations: number;
  };

  constructor(options: {
    conscienceConfig: {
      rules?: {
        deny?: Array<{ action: string; reason?: string }>;
        allow?: Array<{ action: string; reason?: string }>;
        escalate?: Array<{ trigger: string; action?: string }>;
      };
      hard_limits?: string[];
    };
    safetyEnvelope?: {
      max_linear_speed_m_s?: number;
      max_contact_force_n?: number;
      min_proximity_m?: number;
      max_reach_m?: number;
    };
    config?: Partial<EdgeConfig>;
  }) {
    this.conscience = compileConscience(options.conscienceConfig, options.safetyEnvelope);
    this.shadowBuffer = [];
    this.evalTimes = [];
    this.config = {
      syncIntervalMs: options.config?.syncIntervalMs ?? 60000,
      offlineCapable: options.config?.offlineCapable ?? true,
      shadowBufferSize: options.config?.shadowBufferSize ?? 100,
    };
    this.stats = { totalEvaluations: 0, denials: 0, clamps: 0, escalations: 0 };
  }

  /**
   * Evaluate an action. Hot path — must be <1ms.
   */
  evaluate(context: ActionContext): EvalResult {
    const result = this.conscience.evaluate(context);

    this.stats.totalEvaluations++;
    if (result.decision === "deny") this.stats.denials++;
    if (result.decision === "clamp") this.stats.clamps++;
    if (result.decision === "escalate") this.stats.escalations++;

    if (result.evalTimeUs !== undefined) {
      this.evalTimes.push(result.evalTimeUs);
      if (this.evalTimes.length > 1000) this.evalTimes.shift();
    }

    if (result.decision === "deny" || result.decision === "escalate") {
      this.bufferShadowSignal({
        pattern: result.ruleMatched ?? result.decision,
        score: result.decision === "deny" ? 1.0 : 0.7,
        timestamp: new Date().toISOString(),
      });
    }

    return result;
  }

  /**
   * Get latency benchmark results.
   */
  getLatencyStats(): { p50Us: number; p95Us: number; p99Us: number; avgUs: number; totalEvaluations: number } {
    if (this.evalTimes.length === 0) {
      return { p50Us: 0, p95Us: 0, p99Us: 0, avgUs: 0, totalEvaluations: 0 };
    }
    const sorted = [...this.evalTimes].sort((a, b) => a - b);
    const len = sorted.length;
    const avg = sorted.reduce((a, b) => a + b, 0) / len;
    return {
      p50Us: sorted[Math.floor(len * 0.5)],
      p95Us: sorted[Math.floor(len * 0.95)],
      p99Us: sorted[Math.floor(len * 0.99)],
      avgUs: Math.round(avg),
      totalEvaluations: this.stats.totalEvaluations,
    };
  }

  /** Get pending shadow signals for cloud sync. */
  drainShadowBuffer(): ShadowSignal[] {
    const signals = [...this.shadowBuffer];
    this.shadowBuffer = [];
    return signals;
  }

  /** Apply updated conscience rules from cloud. */
  updateConscience(conscienceConfig: Parameters<typeof compileConscience>[0], safetyEnvelope?: Parameters<typeof compileConscience>[1]): void {
    this.conscience = compileConscience(conscienceConfig, safetyEnvelope);
  }

  /** Get runtime stats. */
  getStats() {
    return {
      ...this.stats,
      shadowBuffered: this.shadowBuffer.length,
      memoryBytes: this.conscience.estimateSize(),
    };
  }

  private bufferShadowSignal(signal: ShadowSignal): void {
    this.shadowBuffer.push(signal);
    if (this.shadowBuffer.length > this.config.shadowBufferSize) {
      this.shadowBuffer.shift();
    }
  }
}
