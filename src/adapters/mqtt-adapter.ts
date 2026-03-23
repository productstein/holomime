/**
 * MQTT Adapter — Publishes compiled embodied configs via MQTT.
 *
 * For IoT and edge robotics that use MQTT brokers (Mosquitto, HiveMQ, etc.).
 * Publishes personality config updates to a configurable topic with QoS 1
 * for reliable delivery.
 *
 * NOTE: Requires the `mqtt` package to be installed:
 *   npm install mqtt
 */

import type { RuntimeAdapter } from "../core/embodiment-runtime.js";
import type { CompiledEmbodiedConfig } from "../core/embodiment-types.js";

// ─── MQTT Type Stubs (mirrors `mqtt` package API) ────────────
// These allow TypeScript compilation without the package installed.

interface MqttClient {
  on(event: "connect", listener: () => void): this;
  on(event: "error", listener: (err: Error) => void): this;
  on(event: "close", listener: () => void): this;
  on(event: string, listener: (...args: unknown[]) => void): this;
  publish(
    topic: string,
    message: string | Buffer,
    opts: { qos: 0 | 1 | 2; retain?: boolean },
    callback?: (err?: Error) => void,
  ): this;
  end(force?: boolean, callback?: () => void): this;
  connected: boolean;
}

interface MqttConnectFn {
  (brokerUrl: string, opts?: Record<string, unknown>): MqttClient;
}

// ─── Configuration ──────────────────────────────────────────

export interface MqttAdapterOptions {
  /** MQTT broker URL (default: mqtt://localhost:1883) */
  brokerUrl: string;
  /** Topic to publish config updates to (default: holomime/config) */
  topic?: string;
  /** MQTT client ID (default: holomime-embodiment) */
  clientId?: string;
  /** Username for broker auth */
  username?: string;
  /** Password for broker auth */
  password?: string;
  /** Connection timeout in ms (default: 5000) */
  connectTimeout?: number;
  /** Retain the last published message on the broker (default: true) */
  retain?: boolean;
}

// ─── Adapter ────────────────────────────────────────────────

export class MqttAdapter implements RuntimeAdapter {
  readonly type = "mqtt" as const;

  private client: MqttClient | null = null;
  private connected = false;

  private readonly brokerUrl: string;
  private readonly topic: string;
  private readonly clientId: string;
  private readonly username?: string;
  private readonly password?: string;
  private readonly connectTimeout: number;
  private readonly retain: boolean;

  constructor(options: MqttAdapterOptions) {
    this.brokerUrl = options.brokerUrl;
    this.topic = options.topic ?? "holomime/config";
    this.clientId = options.clientId ?? "holomime-embodiment";
    this.username = options.username;
    this.password = options.password;
    this.connectTimeout = options.connectTimeout ?? 5000;
    this.retain = options.retain ?? true;
  }

  async connect(): Promise<void> {
    // Dynamically import mqtt so the adapter can be defined
    // even if the package is not installed (fails at connect time).
    let mqttConnect: MqttConnectFn;
    try {
      // @ts-expect-error — optional peer dependency, resolved at runtime
      const mqttModule = await import("mqtt") as unknown as { connect: MqttConnectFn } | { default: { connect: MqttConnectFn } };
      mqttConnect = "connect" in mqttModule
        ? mqttModule.connect
        : (mqttModule as { default: { connect: MqttConnectFn } }).default.connect;
    } catch {
      throw new Error(
        "MQTT adapter requires the mqtt package. Install it with: npm install mqtt",
      );
    }

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`MQTT connection to ${this.brokerUrl} timed out`));
      }, this.connectTimeout);

      this.client = mqttConnect(this.brokerUrl, {
        clientId: this.clientId,
        username: this.username,
        password: this.password,
        connectTimeout: this.connectTimeout,
      });

      this.client.on("connect", () => {
        clearTimeout(timer);
        this.connected = true;
        resolve();
      });

      this.client.on("error", (err: Error) => {
        clearTimeout(timer);
        if (!this.connected) {
          reject(new Error(`MQTT connection failed: ${err.message}`));
        }
      });

      this.client.on("close", () => {
        this.connected = false;
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await new Promise<void>((resolve) => {
        this.client!.end(false, () => resolve());
      });
      this.client = null;
    }
    this.connected = false;
  }

  async push(config: CompiledEmbodiedConfig): Promise<void> {
    if (!this.connected || !this.client) {
      throw new Error("MQTT adapter not connected");
    }

    const payload = JSON.stringify({
      event: "personality-update",
      timestamp: new Date().toISOString(),
      config,
    });

    return new Promise<void>((resolve, reject) => {
      this.client!.publish(
        this.topic,
        payload,
        { qos: 1, retain: this.retain },
        (err?: Error) => {
          if (err) {
            reject(new Error(`MQTT publish failed: ${err.message}`));
          } else {
            resolve();
          }
        },
      );
    });
  }

  isConnected(): boolean {
    return this.connected;
  }
}
