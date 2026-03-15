/**
 * ROS2 Adapter — Pushes compiled embodied configs to ROS2 via rosbridge.
 *
 * Converts CompiledEmbodiedConfig into ROS2-compatible JSON messages
 * and publishes to rosbridge_server over WebSocket.
 *
 * Uses the native WebSocket global (Node 22+). For older Node versions,
 * install the `ws` package and assign it to globalThis.WebSocket.
 *
 * Topics:
 *   /holomime/gaze       — GazePolicy
 *   /holomime/proxemics  — ProxemicZone
 *   /holomime/prosody    — Prosody
 *   /holomime/motion     — MotionParameters
 *   /holomime/safety     — SafetyEnvelope
 */

import type { RuntimeAdapter } from "../core/embodiment-runtime.js";
import type { CompiledEmbodiedConfig } from "../core/embodiment-types.js";

// ─── ROS2 Message Types ─────────────────────────────────────

interface RosbridgePublish {
  op: "publish";
  topic: string;
  msg: Record<string, unknown>;
}

interface RosbridgeAdvertise {
  op: "advertise";
  topic: string;
  type: string;
}

// ─── Minimal WebSocket Interface ────────────────────────────

/** Minimal WebSocket interface matching both native and `ws` package APIs. */
interface WSLike {
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

// ─── Configuration ──────────────────────────────────────────

export interface ROS2AdapterOptions {
  /** WebSocket URL for rosbridge_server (default: ws://localhost:9090) */
  endpoint: string;
  /** Topic prefix (default: /holomime) */
  topicPrefix?: string;
  /** Reconnect interval in ms (default: 5000) */
  reconnectInterval?: number;
  /** Max reconnect attempts (default: 10) */
  maxReconnectAttempts?: number;
  /** Custom WebSocket constructor (for testing or ws package injection) */
  createWebSocket?: (url: string) => WSLike;
}

const TOPICS = ["gaze", "proxemics", "prosody", "motion", "safety"] as const;
type TopicName = typeof TOPICS[number];

// ─── Adapter ────────────────────────────────────────────────

export class ROS2Adapter implements RuntimeAdapter {
  readonly type = "ros2" as const;

  private ws: WSLike | null = null;
  private connected = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly endpoint: string;
  private readonly topicPrefix: string;
  private readonly reconnectInterval: number;
  private readonly maxReconnectAttempts: number;
  private readonly createWebSocket: (url: string) => WSLike;

  constructor(options: ROS2AdapterOptions) {
    this.endpoint = options.endpoint;
    this.topicPrefix = options.topicPrefix ?? "/holomime";
    this.reconnectInterval = options.reconnectInterval ?? 5000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
    this.createWebSocket = options.createWebSocket ?? ((url: string) => {
      if (typeof globalThis.WebSocket === "undefined") {
        throw new Error(
          "WebSocket not available. Use Node 22+ or install the `ws` package " +
          "and pass createWebSocket in ROS2AdapterOptions."
        );
      }
      return new globalThis.WebSocket(url) as unknown as WSLike;
    });
  }

  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        this.ws = this.createWebSocket(this.endpoint);

        this.ws.onopen = () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          this.advertiseTopics();
          resolve();
        };

        this.ws.onclose = () => {
          this.connected = false;
          this.attemptReconnect();
        };

        this.ws.onerror = () => {
          if (!this.connected) {
            reject(new Error(`ROS2 connection failed: ${this.endpoint}`));
          }
        };
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  async push(config: CompiledEmbodiedConfig): Promise<void> {
    if (!this.connected || !this.ws) {
      throw new Error("ROS2 adapter not connected");
    }

    const messages = this.configToMessages(config);
    for (const msg of messages) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ─── Helpers ────────────────────────────────────────────────

  private topic(name: TopicName): string {
    return `${this.topicPrefix}/${name}`;
  }

  private advertiseTopics(): void {
    if (!this.ws) return;

    for (const name of TOPICS) {
      const msg: RosbridgeAdvertise = {
        op: "advertise",
        topic: this.topic(name),
        type: "std_msgs/msg/String",
      };
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * Convert a compiled embodied config into per-topic rosbridge publish messages.
   */
  configToMessages(config: CompiledEmbodiedConfig): RosbridgePublish[] {
    return [
      {
        op: "publish",
        topic: this.topic("gaze"),
        msg: { data: JSON.stringify(config.gaze) },
      },
      {
        op: "publish",
        topic: this.topic("proxemics"),
        msg: { data: JSON.stringify(config.proxemics) },
      },
      {
        op: "publish",
        topic: this.topic("prosody"),
        msg: { data: JSON.stringify(config.prosody) },
      },
      {
        op: "publish",
        topic: this.topic("motion"),
        msg: { data: JSON.stringify(config.motion_parameters) },
      },
      {
        op: "publish",
        topic: this.topic("safety"),
        msg: { data: JSON.stringify(config.safety_envelope) },
      },
    ];
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      void this.connect().catch(() => {
        // Reconnect failed, will retry via onclose
      });
    }, this.reconnectInterval);
  }
}
