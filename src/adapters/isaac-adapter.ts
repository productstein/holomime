/**
 * Isaac Sim Adapter — connects holomime to NVIDIA Isaac Sim via
 * Omniverse USD/Python APIs. Enterprise feature for companies using
 * NVIDIA's robotics stack (Figure AI, Agility, 1X, Boston Dynamics, etc).
 *
 * Isaac Sim provides physics-accurate digital twins for sim-to-real
 * behavioral testing before physical deployment.
 *
 * Requires: NVIDIA Isaac Sim installed + omni.isaac Python packages
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { RuntimeAdapter } from "../core/embodiment-runtime.js";
import type { CompiledEmbodiedConfig } from "../core/embodiment-types.js";

// ─── Configuration ──────────────────────────────────────────

export interface IsaacSimConfig {
  /** Isaac Sim host (default: localhost) */
  host: string;
  /** Isaac Sim port (default: 8211) */
  port: number;
  /** USD scene path to load */
  scenePath?: string;
  /** Robot prim path in scene (default: /World/Robot) */
  robotPrim?: string;
  /** Run without GUI (default: false for dev, true for CI) */
  headless?: boolean;
  /** Physics timestep in seconds (default: 1/60) */
  timeStep?: number;
  /** GPU device ID (default: 0) */
  gpuId?: number;
  /** Path to Python binary (default: "python3") */
  pythonPath?: string;
}

// ─── Bridge Messages ────────────────────────────────────────

interface IsaacBridgeResponse {
  type: "ready" | "ack" | "telemetry" | "step" | "error";
  status?: string;
  observation?: IsaacObservation;
  data?: IsaacObservation;
  message?: string;
  docs?: string;
}

interface IsaacObservation {
  joint_positions: number[];
  joint_velocities: number[];
  body_position: number[];
  body_orientation: number[];
  contact_forces: number[];
  timestamp: number;
}

// ─── Adapter ────────────────────────────────────────────────

export class IsaacSimAdapter implements RuntimeAdapter {
  readonly type = "isaac" as const;

  private process: ChildProcess | null = null;
  private rl: Interface | null = null;
  private pendingResolve: ((value: IsaacBridgeResponse) => void) | null = null;
  private connected = false;

  private readonly host: string;
  private readonly port: number;
  private readonly scenePath?: string;
  private readonly robotPrim: string;
  private readonly headless: boolean;
  private readonly timeStep: number;
  private readonly gpuId: number;
  private readonly pythonPath: string;

  constructor(config: IsaacSimConfig) {
    this.host = config.host ?? "localhost";
    this.port = config.port ?? 8211;
    this.scenePath = config.scenePath;
    this.robotPrim = config.robotPrim ?? "/World/Robot";
    this.headless = config.headless ?? false;
    this.timeStep = config.timeStep ?? 1 / 60;
    this.gpuId = config.gpuId ?? 0;
    this.pythonPath = config.pythonPath ?? "python3";
  }

  /**
   * Connect to Isaac Sim by spawning the Python bridge subprocess.
   * The bridge process connects to a running Isaac Sim instance and
   * provides a JSON stdin/stdout interface.
   */
  async connect(): Promise<void> {
    if (this.connected) {
      throw new Error("Isaac Sim adapter already connected");
    }

    const bridgeScript = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "simulation",
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
      this.connected = false;
      this.pendingResolve = null;
      throw new Error(`Isaac Sim bridge process error: ${err.message}`);
    });

    this.process.on("exit", () => {
      this.connected = false;
    });

    // Send config to the bridge
    const config = {
      host: this.host,
      port: this.port,
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
      await this.cleanup();
      throw new Error(
        `Isaac Sim connection failed: ${response.message ?? "unknown error"}` +
        (response.docs ? ` — see ${response.docs}` : ""),
      );
    }

    if (response.type !== "ready") {
      await this.cleanup();
      throw new Error(`Expected 'ready' response, got '${response.type}'`);
    }

    this.connected = true;
  }

  /**
   * Disconnect from Isaac Sim and kill the bridge subprocess.
   */
  async disconnect(): Promise<void> {
    if (!this.process) return;

    try {
      this.sendCommand({ type: "close" });
    } catch {
      // Process may already be dead
    }

    await this.cleanup();
  }

  /**
   * Push a compiled embodied config to the simulated robot.
   * Maps motion_parameters, safety_envelope, gaze, and proxemics
   * to Isaac Sim joint targets and constraints.
   */
  async push(config: CompiledEmbodiedConfig): Promise<void> {
    this.ensureConnected();

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
      throw new Error(`Isaac Sim push failed: ${response.message ?? "unknown error"}`);
    }

    if (response.type !== "ack") {
      throw new Error(`Expected 'ack' response, got '${response.type}'`);
    }
  }

  /**
   * Whether the adapter is currently connected to Isaac Sim.
   */
  isConnected(): boolean {
    return this.connected;
  }

  // ─── Internal Helpers ──────────────────────────────────────

  private ensureConnected(): void {
    if (!this.connected || !this.process) {
      throw new Error("Isaac Sim adapter not connected. Call connect() first.");
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

      // Timeout after 30 seconds
      const timeout = setTimeout(() => {
        if (this.pendingResolve === resolve) {
          this.pendingResolve = null;
          reject(new Error("Isaac Sim bridge response timeout (30s)"));
        }
      }, 30_000);

      // Clear timeout when resolved
      const originalResolve = this.pendingResolve;
      this.pendingResolve = (value: IsaacBridgeResponse) => {
        clearTimeout(timeout);
        originalResolve!(value);
      };
    });
  }

  private async cleanup(): Promise<void> {
    this.rl?.close();
    this.rl = null;
    this.process?.kill();
    this.process = null;
    this.connected = false;
  }
}
