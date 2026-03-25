/**
 * MuJoCo Environment Bridge — connects holomime to MuJoCo physics simulation
 * via Python subprocess. Enables behavioral therapy in simulation before
 * physical deployment (behavioral sim-to-real).
 *
 * Requires: pip install mujoco gymnasium
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EmbodiedTelemetry } from "../analysis/rules/motion-drift.js";

// ─── Configuration ──────────────────────────────────────────

export interface MuJoCoConfig {
  /** Path to MuJoCo XML model file (or Gymnasium env name like "Humanoid-v5"). */
  modelPath: string;
  /** Path to Python binary (default: "python3"). */
  pythonPath?: string;
  /** Visualization mode (default: "none"). */
  renderMode?: "human" | "rgb_array" | "none";
  /** Max simulation steps per episode (default: 1000). */
  maxSteps?: number;
}

// ─── Step Result ────────────────────────────────────────────

export interface StepResult {
  observation: number[];
  reward: number;
  terminated: boolean;
  truncated: boolean;
}

// ─── Bridge Messages ────────────────────────────────────────

interface BridgeResponse {
  type: "ready" | "step" | "reset" | "observe";
  observation: number[];
  reward?: number;
  terminated?: boolean;
  truncated?: boolean;
}

// ─── MuJoCo Environment ────────────────────────────────────

export class MuJoCoEnvironment {
  private process: ChildProcess | null = null;
  private rl: Interface | null = null;
  private pendingResolve: ((value: BridgeResponse) => void) | null = null;
  private running = false;
  private stepCount = 0;

  private readonly modelPath: string;
  private readonly pythonPath: string;
  private readonly renderMode: "human" | "rgb_array" | "none";
  private readonly maxSteps: number;

  constructor(config: MuJoCoConfig) {
    this.modelPath = config.modelPath;
    this.pythonPath = config.pythonPath ?? "python3";
    this.renderMode = config.renderMode ?? "none";
    this.maxSteps = config.maxSteps ?? 1000;
  }

  /**
   * Spawn the Python subprocess running the MuJoCo Gymnasium environment.
   * Returns the initial observation after environment reset.
   */
  async start(): Promise<number[]> {
    if (this.running) {
      throw new Error("MuJoCo environment already running");
    }

    const bridgeScript = join(
      dirname(fileURLToPath(import.meta.url)),
      "mujoco_bridge.py",
    );

    this.process = spawn(this.pythonPath, [bridgeScript], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Set up line-based reader on stdout
    this.rl = createInterface({ input: this.process.stdout! });
    this.rl.on("line", (line: string) => {
      if (this.pendingResolve) {
        const resolve = this.pendingResolve;
        this.pendingResolve = null;
        try {
          resolve(JSON.parse(line) as BridgeResponse);
        } catch {
          // Ignore malformed lines
        }
      }
    });

    // Handle process errors
    this.process.on("error", (err) => {
      this.running = false;
      if (this.pendingResolve) {
        // Reject pending promise via throwing in the resolve path won't work,
        // so we just clear it. Callers will time out.
        this.pendingResolve = null;
      }
      throw new Error(`MuJoCo bridge process error: ${err.message}`);
    });

    this.process.on("exit", () => {
      this.running = false;
    });

    // Send config to the bridge
    const config = {
      env: this.modelPath,
      render_mode: this.renderMode === "none" ? null : this.renderMode,
    };
    this.process.stdin!.write(JSON.stringify(config) + "\n");

    // Wait for the "ready" response with initial observation
    const response = await this.waitForResponse();
    if (response.type !== "ready") {
      throw new Error(`Expected 'ready' response, got '${response.type}'`);
    }

    this.running = true;
    this.stepCount = 0;
    return response.observation;
  }

  /**
   * Send an action to the simulation and receive the next observation.
   */
  async step(action: number[]): Promise<StepResult> {
    this.ensureRunning();

    if (this.stepCount >= this.maxSteps) {
      throw new Error(`Max steps (${this.maxSteps}) exceeded`);
    }

    this.sendCommand({ type: "step", action });
    const response = await this.waitForResponse();

    this.stepCount++;

    return {
      observation: response.observation,
      reward: response.reward ?? 0,
      terminated: response.terminated ?? false,
      truncated: response.truncated ?? false,
    };
  }

  /**
   * Reset the environment and return the initial observation.
   */
  async reset(): Promise<number[]> {
    this.ensureRunning();

    this.sendCommand({ type: "reset" });
    const response = await this.waitForResponse();

    this.stepCount = 0;
    return response.observation;
  }

  /**
   * Get the current observation without stepping the simulation.
   */
  async getObservation(): Promise<number[]> {
    this.ensureRunning();

    this.sendCommand({ type: "observe" });
    const response = await this.waitForResponse();
    return response.observation;
  }

  /**
   * Kill the subprocess and release resources.
   */
  async close(): Promise<void> {
    if (!this.process) return;

    try {
      this.sendCommand({ type: "close" });
    } catch {
      // Process may already be dead
    }

    this.rl?.close();
    this.rl = null;
    this.process.kill();
    this.process = null;
    this.running = false;
    this.stepCount = 0;
  }

  /**
   * Convert a MuJoCo observation vector to EmbodiedTelemetry format
   * for use with holomime drift detectors.
   *
   * Humanoid-v5 observation space (376 dims):
   *   [0]:    z-position of torso
   *   [1:23]: joint positions
   *   [23:46]: joint velocities
   *   [46:376]: cinert, cvel, qfrc_actuator, cfrc_ext
   *
   * We extract approximate speed, gesture amplitude, and response latency
   * from the raw observation.
   */
  toTelemetry(observation: number[]): EmbodiedTelemetry {
    // Approximate linear speed from joint velocities (indices 23-45)
    const velocities = observation.slice(23, 46);
    const avgVelocity = velocities.length > 0
      ? velocities.reduce((sum, v) => sum + Math.abs(v), 0) / velocities.length
      : 0;
    // Normalize to 0-1 range (Humanoid velocities typically peak ~10)
    const normalizedSpeed = Math.min(avgVelocity / 10, 1);

    // Approximate gesture amplitude from joint position range
    const positions = observation.slice(1, 23);
    const posRange = positions.length > 0
      ? Math.max(...positions.map(Math.abs))
      : 0;
    // Normalize (joint positions typically in [-π, π])
    const normalizedAmplitude = Math.min(posRange / Math.PI, 1);

    // Approximate nearest obstacle distance from contact forces (cfrc_ext)
    // Higher contact forces → closer obstacle
    const contactForces = observation.slice(332, 376);
    const maxContactForce = contactForces.length > 0
      ? Math.max(...contactForces.map(Math.abs))
      : 0;
    // Invert: high force → small distance
    const nearestObstacleM = maxContactForce > 0.1
      ? Math.max(0.1, 1.0 / maxContactForce)
      : 5.0;

    return {
      timestamp: new Date().toISOString(),
      motion: {
        speed: normalizedSpeed,
        gesture_amplitude: normalizedAmplitude,
        response_latency_ms: 0, // Simulation runs synchronously
      },
      safety: {
        current_speed: normalizedSpeed,
        current_force: maxContactForce,
        nearest_obstacle_m: nearestObstacleM,
      },
      proxemics: {
        current_distance_m: nearestObstacleM,
        zone: nearestObstacleM < 0.45 ? "intimate"
            : nearestObstacleM < 1.2 ? "personal"
            : nearestObstacleM < 3.6 ? "social"
            : "public",
      },
    };
  }

  /**
   * Whether the environment is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Current step count in the active episode.
   */
  getStepCount(): number {
    return this.stepCount;
  }

  // ─── Internal Helpers ──────────────────────────────────────

  private ensureRunning(): void {
    if (!this.running || !this.process) {
      throw new Error("MuJoCo environment not running. Call start() first.");
    }
  }

  private sendCommand(cmd: Record<string, unknown>): void {
    if (!this.process?.stdin) {
      throw new Error("MuJoCo bridge stdin not available");
    }
    this.process.stdin.write(JSON.stringify(cmd) + "\n");
  }

  private waitForResponse(): Promise<BridgeResponse> {
    return new Promise<BridgeResponse>((resolve, reject) => {
      this.pendingResolve = resolve;

      // Timeout after 30 seconds
      const timeout = setTimeout(() => {
        if (this.pendingResolve === resolve) {
          this.pendingResolve = null;
          reject(new Error("MuJoCo bridge response timeout (30s)"));
        }
      }, 30_000);

      // Clear timeout when resolved
      const originalResolve = this.pendingResolve;
      this.pendingResolve = (value: BridgeResponse) => {
        clearTimeout(timeout);
        originalResolve!(value);
      };
    });
  }
}
