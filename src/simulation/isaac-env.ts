/**
 * Isaac Sim Environment — high-fidelity simulation environment for
 * behavioral testing using NVIDIA Isaac Sim.
 *
 * Provides the same interface as MuJoCoEnvironment but backed by
 * Isaac Sim's physics engine (PhysX) for more accurate sim-to-real.
 *
 * Key differences from MuJoCo:
 *   - Supports USD scenes and pre-built digital twins (Figure 03, Unitree, etc)
 *   - GR00T model compatibility for humanoid behavior
 *   - Hardware-in-the-loop testing via Omniverse streaming
 *   - Multi-GPU parallel simulation for large-scale behavioral eval
 *
 * Requires: NVIDIA Isaac Sim installed + omni.isaac Python packages
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EmbodiedTelemetry } from "../analysis/rules/motion-drift.js";
import type { CompiledEmbodiedConfig } from "../core/embodiment-types.js";

// ─── Configuration ──────────────────────────────────────────

export interface IsaacEnvConfig {
  /** USD scene path to load (e.g., a digital twin of a warehouse or hospital). */
  scenePath?: string;
  /** Robot prim path in the USD scene (default: /World/Robot). */
  robotPrim?: string;
  /** Path to Python binary (default: "python3"). */
  pythonPath?: string;
  /** Run without GUI (default: false). */
  headless?: boolean;
  /** Physics timestep in seconds (default: 1/60). */
  timeStep?: number;
  /** GPU device ID (default: 0). */
  gpuId?: number;
  /** Max simulation steps per episode (default: 10000). */
  maxSteps?: number;
}

// ─── Step Result ────────────────────────────────────────────

export interface IsaacStepResult {
  observation: IsaacObservation;
  timestamp: number;
}

// ─── Observation ────────────────────────────────────────────

export interface IsaacObservation {
  joint_positions: number[];
  joint_velocities: number[];
  body_position: number[];
  body_orientation: number[];
  contact_forces: number[];
  timestamp: number;
}

// ─── Bridge Messages ────────────────────────────────────────

interface IsaacBridgeResponse {
  type: "ready" | "step" | "ack" | "telemetry" | "error";
  status?: string;
  observation?: IsaacObservation;
  data?: IsaacObservation;
  message?: string;
  docs?: string;
}

// ─── Isaac Sim Environment ──────────────────────────────────

export class IsaacSimEnvironment {
  private process: ChildProcess | null = null;
  private rl: Interface | null = null;
  private pendingResolve: ((value: IsaacBridgeResponse) => void) | null = null;
  private running = false;
  private stepCount = 0;

  private readonly scenePath?: string;
  private readonly robotPrim: string;
  private readonly pythonPath: string;
  private readonly headless: boolean;
  private readonly timeStep: number;
  private readonly gpuId: number;
  private readonly maxSteps: number;

  constructor(config: IsaacEnvConfig = {}) {
    this.scenePath = config.scenePath;
    this.robotPrim = config.robotPrim ?? "/World/Robot";
    this.pythonPath = config.pythonPath ?? "python3";
    this.headless = config.headless ?? false;
    this.timeStep = config.timeStep ?? 1 / 60;
    this.gpuId = config.gpuId ?? 0;
    this.maxSteps = config.maxSteps ?? 10000;
  }

  /**
   * Spawn the Python subprocess connecting to Isaac Sim.
   * Returns once the bridge reports ready.
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error("Isaac Sim environment already running");
    }

    const bridgeScript = join(
      dirname(fileURLToPath(import.meta.url)),
      "isaac_bridge.py",
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
          resolve(JSON.parse(line) as IsaacBridgeResponse);
        } catch {
          // Ignore malformed lines
        }
      }
    });

    // Handle process errors
    this.process.on("error", (err) => {
      this.running = false;
      this.pendingResolve = null;
      throw new Error(`Isaac Sim bridge process error: ${err.message}`);
    });

    this.process.on("exit", () => {
      this.running = false;
    });

    // Send config to the bridge
    const config = {
      scene_path: this.scenePath,
      robot_prim: this.robotPrim,
      headless: this.headless,
      time_step: this.timeStep,
      gpu_id: this.gpuId,
    };
    this.process.stdin!.write(JSON.stringify(config) + "\n");

    // Wait for the "ready" response
    const response = await this.waitForResponse();

    if (response.type === "error") {
      await this.close();
      throw new Error(
        `Isaac Sim not available: ${response.message ?? "unknown error"}` +
        (response.docs ? ` — see ${response.docs}` : ""),
      );
    }

    if (response.type !== "ready") {
      await this.close();
      throw new Error(`Expected 'ready' response, got '${response.type}'`);
    }

    this.running = true;
    this.stepCount = 0;
  }

  /**
   * Step the simulation forward one physics timestep.
   * Returns the updated robot observation.
   */
  async step(): Promise<IsaacStepResult> {
    this.ensureRunning();

    if (this.stepCount >= this.maxSteps) {
      throw new Error(`Max steps (${this.maxSteps}) exceeded`);
    }

    this.sendCommand({ type: "step" });
    const response = await this.waitForResponse();

    if (response.type === "error") {
      throw new Error(`Isaac Sim step failed: ${response.message ?? "unknown error"}`);
    }

    this.stepCount++;

    const observation = response.observation ?? {
      joint_positions: [],
      joint_velocities: [],
      body_position: [0, 0, 0],
      body_orientation: [1, 0, 0, 0],
      contact_forces: [],
      timestamp: 0,
    };

    return {
      observation,
      timestamp: observation.timestamp,
    };
  }

  /**
   * Reset the simulation to its initial state.
   */
  async reset(): Promise<void> {
    this.ensureRunning();

    // Isaac Sim reset is handled via a close + re-start at the bridge level
    // For now, just reset the step counter; the bridge maintains world state.
    this.stepCount = 0;
  }

  /**
   * Get the current robot observation without stepping the simulation.
   */
  async getObservation(): Promise<IsaacObservation> {
    this.ensureRunning();

    this.sendCommand({ type: "get_telemetry" });
    const response = await this.waitForResponse();

    if (response.type === "error") {
      throw new Error(`Isaac Sim get_telemetry failed: ${response.message ?? "unknown error"}`);
    }

    return response.data ?? {
      joint_positions: [],
      joint_velocities: [],
      body_position: [0, 0, 0],
      body_orientation: [1, 0, 0, 0],
      contact_forces: [],
      timestamp: 0,
    };
  }

  /**
   * Push a compiled embodied config to the simulated robot.
   * Updates joint targets, safety parameters, and behavioral constraints.
   */
  async pushConfig(config: CompiledEmbodiedConfig): Promise<void> {
    this.ensureRunning();

    this.sendCommand({
      type: "push_config",
      config: {
        motion_parameters: config.motion_parameters,
        safety_envelope: config.safety_envelope,
        gaze: config.gaze,
        proxemics: config.proxemics,
        haptics: config.haptics,
        prosody: config.prosody,
        active_modalities: config.active_modalities,
        gesture_vocabulary: config.gesture_vocabulary,
      },
    });

    const response = await this.waitForResponse();

    if (response.type === "error") {
      throw new Error(`Isaac Sim push_config failed: ${response.message ?? "unknown error"}`);
    }
  }

  /**
   * Convert an Isaac Sim observation to EmbodiedTelemetry format
   * for use with holomime drift detectors.
   *
   * Isaac Sim observations contain:
   *   - joint_positions: array of joint angles (rad)
   *   - joint_velocities: array of joint angular velocities (rad/s)
   *   - body_position: [x, y, z] world position (m)
   *   - body_orientation: [w, x, y, z] quaternion
   *   - contact_forces: array of contact force magnitudes (N)
   *   - timestamp: simulation time (s)
   */
  toTelemetry(observation: IsaacObservation): EmbodiedTelemetry {
    // Speed from joint velocities
    const velocities = observation.joint_velocities;
    const avgVelocity = velocities.length > 0
      ? velocities.reduce((sum, v) => sum + Math.abs(v), 0) / velocities.length
      : 0;
    // Normalize to 0-1 (joint velocities typically peak ~5 rad/s)
    const normalizedSpeed = Math.min(avgVelocity / 5, 1);

    // Gesture amplitude from joint position range
    const positions = observation.joint_positions;
    const posRange = positions.length > 0
      ? Math.max(...positions.map(Math.abs))
      : 0;
    // Normalize (joint positions in [-pi, pi])
    const normalizedAmplitude = Math.min(posRange / Math.PI, 1);

    // Contact force magnitude
    const contactForces = observation.contact_forces;
    const maxContactForce = contactForces.length > 0
      ? Math.max(...contactForces.map(Math.abs))
      : 0;

    // Nearest obstacle distance (inverted from contact force)
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

  /**
   * Check if NVIDIA Isaac Sim is available on this system.
   * Attempts to import omni.isaac.core via a quick Python subprocess.
   */
  static async isAvailable(pythonPath = "python3"): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const proc = spawn(pythonPath, [
        "-c",
        "import omni.isaac.core; print('ok')",
      ], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let output = "";
      proc.stdout?.on("data", (data: Buffer) => {
        output += data.toString();
      });

      proc.on("close", (code) => {
        resolve(code === 0 && output.trim() === "ok");
      });

      proc.on("error", () => {
        resolve(false);
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        proc.kill();
        resolve(false);
      }, 10_000);
    });
  }

  // ─── Internal Helpers ──────────────────────────────────────

  private ensureRunning(): void {
    if (!this.running || !this.process) {
      throw new Error("Isaac Sim environment not running. Call start() first.");
    }
  }

  private sendCommand(cmd: Record<string, unknown>): void {
    if (!this.process?.stdin) {
      throw new Error("Isaac Sim bridge stdin not available");
    }
    this.process.stdin.write(JSON.stringify(cmd) + "\n");
  }

  private waitForResponse(): Promise<IsaacBridgeResponse> {
    return new Promise<IsaacBridgeResponse>((resolve, reject) => {
      this.pendingResolve = resolve;

      // Timeout after 60 seconds (Isaac Sim can be slow to respond)
      const timeout = setTimeout(() => {
        if (this.pendingResolve === resolve) {
          this.pendingResolve = null;
          reject(new Error("Isaac Sim bridge response timeout (60s)"));
        }
      }, 60_000);

      // Clear timeout when resolved
      const originalResolve = this.pendingResolve;
      this.pendingResolve = (value: IsaacBridgeResponse) => {
        clearTimeout(timeout);
        originalResolve!(value);
      };
    });
  }
}
