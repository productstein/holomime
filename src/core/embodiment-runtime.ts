/**
 * Embodiment Runtime — Real-time sync layer for pushing compiled embodied
 * configs to robot/avatar frameworks.
 *
 * Event-driven: when therapy adjusts personality scores, the embodied config
 * updates and pushes to connected runtime adapters (ROS2, Unity, webhook).
 *
 * HoloMime generates the config; the runtime adapter delivers it.
 */

import { EventEmitter } from "node:events";
import type { CompiledEmbodiedConfig } from "./embodiment-types.js";

// ─── Adapter Interface ──────────────────────────────────────

export type AdapterType = "ros2" | "unity" | "webhook";

export interface RuntimeAdapter {
  readonly type: AdapterType;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  push(config: CompiledEmbodiedConfig): Promise<void>;
  isConnected(): boolean;
}

// ─── Runtime Events ─────────────────────────────────────────

export interface RuntimeEvents {
  "personality-update": (config: CompiledEmbodiedConfig) => void;
  "adapter-connected": (adapter: RuntimeAdapter) => void;
  "adapter-disconnected": (adapter: RuntimeAdapter) => void;
  "push-success": (adapter: RuntimeAdapter, config: CompiledEmbodiedConfig) => void;
  "push-error": (adapter: RuntimeAdapter, error: Error) => void;
  "error": (error: Error) => void;
}

// ─── Embodiment Runtime ─────────────────────────────────────

export class EmbodimentRuntime extends EventEmitter {
  private adapters: RuntimeAdapter[] = [];
  private currentConfig: CompiledEmbodiedConfig | null = null;
  private running = false;

  constructor() {
    super();
  }

  /**
   * Register a runtime adapter (ROS2, Unity, webhook).
   */
  addAdapter(adapter: RuntimeAdapter): void {
    this.adapters.push(adapter);
  }

  /**
   * Remove a registered adapter.
   */
  removeAdapter(adapter: RuntimeAdapter): void {
    const idx = this.adapters.indexOf(adapter);
    if (idx !== -1) {
      this.adapters.splice(idx, 1);
    }
  }

  /**
   * Connect all registered adapters and start listening for updates.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    for (const adapter of this.adapters) {
      try {
        await adapter.connect();
        this.emit("adapter-connected", adapter);
      } catch (err) {
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
    }

    // Listen for personality updates and push to all adapters
    this.on("personality-update", (config: CompiledEmbodiedConfig) => {
      this.currentConfig = config;
      void this.pushToAll(config);
    });
  }

  /**
   * Disconnect all adapters and stop.
   */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.removeAllListeners("personality-update");

    for (const adapter of this.adapters) {
      try {
        await adapter.disconnect();
        this.emit("adapter-disconnected", adapter);
      } catch (err) {
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  /**
   * Push an updated embodied config to all connected adapters.
   */
  async pushUpdate(config: CompiledEmbodiedConfig): Promise<void> {
    this.emit("personality-update", config);
  }

  /**
   * Get the most recently pushed config.
   */
  getCurrentConfig(): CompiledEmbodiedConfig | null {
    return this.currentConfig;
  }

  /**
   * Check if the runtime is active.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get all registered adapters.
   */
  getAdapters(): readonly RuntimeAdapter[] {
    return this.adapters;
  }

  private async pushToAll(config: CompiledEmbodiedConfig): Promise<void> {
    const pushPromises = this.adapters
      .filter(a => a.isConnected())
      .map(async (adapter) => {
        try {
          await adapter.push(config);
          this.emit("push-success", adapter, config);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.emit("push-error", adapter, error);
        }
      });
    await Promise.allSettled(pushPromises);
  }
}
