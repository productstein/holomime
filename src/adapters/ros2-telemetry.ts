/**
 * ROS2 Telemetry Ingester — subscribes to robot sensor topics via rosbridge
 * and converts to EmbodiedTelemetry format for drift detectors.
 *
 * The existing ROS2Adapter (ros2-adapter.ts) PUBLISHES personality config.
 * This module SUBSCRIBES to sensor topics and feeds telemetry back into
 * holomime's drift detection pipeline, closing the feedback loop.
 *
 * Supported ROS2 message types:
 *   - std_msgs/String         (generic JSON payloads)
 *   - sensor_msgs/JointState  (joint positions, velocities, efforts)
 *   - nav_msgs/Odometry       (position + velocity from wheel encoders / SLAM)
 *   - geometry_msgs/WrenchStamped (force/torque sensor readings)
 *
 * Uses the native WebSocket global (Node 22+). For older Node versions,
 * install the `ws` package and assign it to globalThis.WebSocket.
 */

import { EventEmitter } from "node:events";
import type { EmbodiedTelemetry } from "../analysis/rules/motion-drift.js";

// ─── Rosbridge Protocol Types ──────────────────────────────

interface RosbridgeSubscribe {
  op: "subscribe";
  topic: string;
  type?: string;
  queue_length?: number;
  throttle_rate?: number;
}

interface RosbridgeUnsubscribe {
  op: "unsubscribe";
  topic: string;
}

interface RosbridgeMessage {
  op: "publish";
  topic: string;
  msg: Record<string, unknown>;
}

// ─── ROS2 Message Shapes ───────────────────────────────────

interface RosJointState {
  header?: { stamp?: { sec?: number; nanosec?: number }; frame_id?: string };
  name?: string[];
  position?: number[];
  velocity?: number[];
  effort?: number[];
}

interface RosOdometry {
  header?: { stamp?: { sec?: number; nanosec?: number }; frame_id?: string };
  pose?: {
    pose?: {
      position?: { x?: number; y?: number; z?: number };
      orientation?: { x?: number; y?: number; z?: number; w?: number };
    };
  };
  twist?: {
    twist?: {
      linear?: { x?: number; y?: number; z?: number };
      angular?: { x?: number; y?: number; z?: number };
    };
  };
}

interface RosWrenchStamped {
  header?: { stamp?: { sec?: number; nanosec?: number }; frame_id?: string };
  wrench?: {
    force?: { x?: number; y?: number; z?: number };
    torque?: { x?: number; y?: number; z?: number };
  };
}

// ─── Minimal WebSocket Interface ───────────────────────────

/** Minimal WebSocket interface matching both native and `ws` package APIs. */
interface WSLike {
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: string | Buffer }) => void) | null;
}

// ─── Configuration ─────────────────────────────────────────

export interface ROS2TelemetryOptions {
  /** WebSocket URL for rosbridge_server (default: ws://localhost:9090) */
  endpoint?: string;
  /** Prefix prepended to all default topic names (default: empty string) */
  topicPrefix?: string;
  /** Topics to subscribe to (defaults: /joint_states, /odom, /force_torque_sensor, /camera/image_raw) */
  topics?: string[];
  /** Reconnect interval in ms (default: 5000) */
  reconnectInterval?: number;
  /** Max reconnect attempts (default: 10) */
  maxReconnectAttempts?: number;
  /** Rosbridge queue length per subscription (default: 1) */
  queueLength?: number;
  /** Rosbridge throttle rate in ms (default: 100) */
  throttleRate?: number;
  /** Custom WebSocket constructor (for testing or ws package injection) */
  createWebSocket?: (url: string) => WSLike;
}

const DEFAULT_TOPICS = [
  "/joint_states",
  "/odom",
  "/force_torque_sensor",
  "/camera/image_raw",
] as const;

// ─── Telemetry Events ──────────────────────────────────────

export interface TelemetryEvents {
  /** Emitted for each parsed telemetry sample. */
  telemetry: (data: EmbodiedTelemetry) => void;
  /** Emitted on successful WebSocket connection. */
  connected: () => void;
  /** Emitted on WebSocket disconnection. */
  disconnected: () => void;
  /** Emitted on errors (connection, parse, etc.). */
  error: (error: Error) => void;
  /** Emitted when a raw ROS2 message is received (before parsing). */
  raw: (topic: string, msg: Record<string, unknown>) => void;
}

// ─── Ingester ──────────────────────────────────────────────

export class ROS2TelemetryIngester extends EventEmitter {
  private ws: WSLike | null = null;
  private connected = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private subscribedTopics: Set<string> = new Set();

  private readonly topicPrefix: string;
  private readonly defaultTopics: string[];
  private readonly reconnectInterval: number;
  private readonly maxReconnectAttempts: number;
  private readonly queueLength: number;
  private readonly throttleRate: number;
  private readonly createWebSocket: (url: string) => WSLike;

  constructor(private readonly options: ROS2TelemetryOptions = {}) {
    super();
    this.topicPrefix = options.topicPrefix ?? "";
    this.defaultTopics = options.topics ?? DEFAULT_TOPICS.map(t => `${this.topicPrefix}${t}`);
    this.reconnectInterval = options.reconnectInterval ?? 5000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 10;
    this.queueLength = options.queueLength ?? 1;
    this.throttleRate = options.throttleRate ?? 100;
    this.createWebSocket = options.createWebSocket ?? ((url: string) => {
      if (typeof globalThis.WebSocket === "undefined") {
        throw new Error(
          "WebSocket not available. Use Node 22+ or install the `ws` package " +
          "and pass createWebSocket in ROS2TelemetryOptions.",
        );
      }
      return new globalThis.WebSocket(url) as unknown as WSLike;
    });
  }

  // ─── Connection ────────────────────────────────────────────

  /**
   * Connect to rosbridge WebSocket and subscribe to default topics.
   */
  async connect(endpoint?: string): Promise<void> {
    const url = endpoint ?? this.options.endpoint ?? "ws://localhost:9090";

    return new Promise<void>((resolve, reject) => {
      try {
        this.ws = this.createWebSocket(url);

        this.ws.onopen = () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          this.emit("connected");

          // Subscribe to default topics
          this.subscribe(this.defaultTopics);
          resolve();
        };

        this.ws.onclose = () => {
          const wasConnected = this.connected;
          this.connected = false;
          this.subscribedTopics.clear();
          if (wasConnected) {
            this.emit("disconnected");
          }
          this.attemptReconnect(url);
        };

        this.ws.onerror = () => {
          if (!this.connected) {
            reject(new Error(`ROS2 telemetry connection failed: ${url}`));
          }
        };

        this.ws.onmessage = (ev: { data: string | Buffer }) => {
          try {
            const raw = typeof ev.data === "string" ? ev.data : ev.data.toString();
            const parsed = JSON.parse(raw) as RosbridgeMessage;

            if (parsed.op === "publish" && parsed.topic && parsed.msg) {
              this.emit("raw", parsed.topic, parsed.msg);
              const telemetry = this.parseMessage(parsed.topic, parsed.msg);
              if (telemetry) {
                this.emit("telemetry", telemetry);
              }
            }
          } catch {
            // Silently ignore unparseable messages
          }
        };
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /**
   * Subscribe to additional ROS2 topics.
   */
  subscribe(topics: string[]): void {
    if (!this.connected || !this.ws) {
      throw new Error("ROS2 telemetry ingester not connected");
    }

    for (const topic of topics) {
      if (this.subscribedTopics.has(topic)) continue;

      const msg: RosbridgeSubscribe = {
        op: "subscribe",
        topic,
        queue_length: this.queueLength,
        throttle_rate: this.throttleRate,
      };
      this.ws.send(JSON.stringify(msg));
      this.subscribedTopics.add(topic);
    }
  }

  /**
   * Disconnect from rosbridge, unsubscribing all topics.
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Unsubscribe from all topics before closing
    if (this.ws && this.connected) {
      for (const topic of this.subscribedTopics) {
        const msg: RosbridgeUnsubscribe = { op: "unsubscribe", topic };
        try {
          this.ws.send(JSON.stringify(msg));
        } catch {
          // Best-effort unsubscribe
        }
      }
    }

    this.subscribedTopics.clear();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  /**
   * Whether the ingester is currently connected to rosbridge.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get the set of currently subscribed topics.
   */
  getSubscribedTopics(): ReadonlySet<string> {
    return this.subscribedTopics;
  }

  // ─── Message Parsing ──────────────────────────────────────

  /**
   * Parse an incoming rosbridge message into EmbodiedTelemetry.
   * Returns null if the message type is not recognized or cannot be parsed.
   */
  parseMessage(topic: string, msg: Record<string, unknown>): EmbodiedTelemetry | null {
    const timestamp = new Date().toISOString();
    const stripped = this.stripPrefix(topic);

    // sensor_msgs/JointState
    if (stripped === "/joint_states") {
      return this.parseJointState(msg as unknown as RosJointState, timestamp);
    }

    // nav_msgs/Odometry
    if (stripped === "/odom") {
      return this.parseOdometry(msg as unknown as RosOdometry, timestamp);
    }

    // geometry_msgs/WrenchStamped
    if (stripped === "/force_torque_sensor") {
      return this.parseWrenchStamped(msg as unknown as RosWrenchStamped, timestamp);
    }

    // std_msgs/String — attempt generic JSON parse
    if (typeof msg === "object" && "data" in msg && typeof msg.data === "string") {
      return this.parseStringMessage(msg.data, timestamp);
    }

    return null;
  }

  // ─── Specific Parsers ──────────────────────────────────────

  private parseJointState(msg: RosJointState, timestamp: string): EmbodiedTelemetry | null {
    const velocities = msg.velocity ?? [];
    if (velocities.length === 0) return null;

    // Average absolute velocity across all joints as a speed proxy
    const avgSpeed = velocities.reduce((sum, v) => sum + Math.abs(v), 0) / velocities.length;

    // Use effort as a proxy for gesture amplitude
    const efforts = msg.effort ?? [];
    const avgEffort = efforts.length > 0
      ? efforts.reduce((sum, e) => sum + Math.abs(e), 0) / efforts.length
      : 0;

    // Normalize to 0-1 range (assume max speed ~2 rad/s, max effort ~100 Nm)
    const normalizedSpeed = Math.min(avgSpeed / 2.0, 1.0);
    const normalizedAmplitude = Math.min(avgEffort / 100.0, 1.0);

    return {
      timestamp,
      motion: {
        speed: normalizedSpeed,
        gesture_amplitude: normalizedAmplitude,
        response_latency_ms: 0, // JointState doesn't carry latency info
      },
    };
  }

  private parseOdometry(msg: RosOdometry, timestamp: string): EmbodiedTelemetry | null {
    const twist = msg.twist?.twist;
    const pose = msg.pose?.pose;

    if (!twist && !pose) return null;

    const telemetry: EmbodiedTelemetry = { timestamp };

    if (twist) {
      const lx = twist.linear?.x ?? 0;
      const ly = twist.linear?.y ?? 0;
      const lz = twist.linear?.z ?? 0;
      const linearSpeed = Math.sqrt(lx * lx + ly * ly + lz * lz);

      // Motion from odometry velocity
      telemetry.motion = {
        speed: Math.min(linearSpeed / 2.0, 1.0), // Normalize assuming max 2 m/s
        gesture_amplitude: 0,
        response_latency_ms: 0,
      };

      // Safety from odometry (speed is already in m/s)
      telemetry.safety = {
        current_speed: linearSpeed,
        current_force: 0, // Odometry doesn't carry force
        nearest_obstacle_m: Infinity, // Unknown from odometry alone
      };
    }

    return telemetry;
  }

  private parseWrenchStamped(msg: RosWrenchStamped, timestamp: string): EmbodiedTelemetry | null {
    const wrench = msg.wrench;
    if (!wrench) return null;

    const fx = wrench.force?.x ?? 0;
    const fy = wrench.force?.y ?? 0;
    const fz = wrench.force?.z ?? 0;
    const forceMagnitude = Math.sqrt(fx * fx + fy * fy + fz * fz);

    return {
      timestamp,
      safety: {
        current_speed: 0, // Force sensor doesn't carry speed
        current_force: forceMagnitude,
        nearest_obstacle_m: Infinity, // Unknown from force sensor alone
      },
    };
  }

  private parseStringMessage(data: string, timestamp: string): EmbodiedTelemetry | null {
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;

      // Accept if it matches EmbodiedTelemetry shape
      const telemetry: EmbodiedTelemetry = { timestamp };
      let hasData = false;

      if (parsed.motion && typeof parsed.motion === "object") {
        const m = parsed.motion as Record<string, number>;
        telemetry.motion = {
          speed: m.speed ?? 0,
          gesture_amplitude: m.gesture_amplitude ?? 0,
          response_latency_ms: m.response_latency_ms ?? 0,
        };
        hasData = true;
      }

      if (parsed.safety && typeof parsed.safety === "object") {
        const s = parsed.safety as Record<string, number>;
        telemetry.safety = {
          current_speed: s.current_speed ?? 0,
          current_force: s.current_force ?? 0,
          nearest_obstacle_m: s.nearest_obstacle_m ?? Infinity,
        };
        hasData = true;
      }

      if (parsed.proxemics && typeof parsed.proxemics === "object") {
        const p = parsed.proxemics as Record<string, unknown>;
        telemetry.proxemics = {
          current_distance_m: (p.current_distance_m as number) ?? 0,
          zone: (p.zone as string) ?? "unknown",
        };
        hasData = true;
      }

      return hasData ? telemetry : null;
    } catch {
      return null;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────

  private stripPrefix(topic: string): string {
    if (this.topicPrefix && topic.startsWith(this.topicPrefix)) {
      return topic.slice(this.topicPrefix.length);
    }
    return topic;
  }

  private attemptReconnect(endpoint: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      void this.connect(endpoint).catch(() => {
        // Reconnect failed — will retry via onclose
      });
    }, this.reconnectInterval);
  }
}
