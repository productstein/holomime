/**
 * gRPC Adapter — Pushes compiled embodied configs via gRPC streaming.
 *
 * For custom robotics stacks that use gRPC instead of WebSocket or HTTP.
 * Uses @grpc/grpc-js for the transport layer.
 *
 * NOTE: Requires `@grpc/grpc-js` to be installed:
 *   npm install @grpc/grpc-js
 *
 * Since we avoid .proto files, this adapter uses a simple hand-defined
 * message structure and dynamic service definition.
 */

import type { RuntimeAdapter } from "../core/embodiment-runtime.js";
import type { CompiledEmbodiedConfig } from "../core/embodiment-types.js";

// ─── gRPC Type Stubs (mirrors @grpc/grpc-js API) ────────────
// These allow TypeScript compilation without the package installed.

interface GrpcCredentials {
  createInsecure(): unknown;
  createSsl(): unknown;
}

interface GrpcClient {
  close(): void;
  waitForReady(deadline: Date, callback: (err: Error | null) => void): void;
}

interface GrpcClientConstructor {
  new (address: string, credentials: unknown): GrpcClient;
}

interface GrpcPackage {
  credentials: GrpcCredentials;
  makeGenericClientConstructor(
    methods: Record<string, unknown>,
    serviceName: string,
  ): GrpcClientConstructor;
}

// ─── Message Types ───────────────────────────────────────────

/** Protobuf-like message structure for personality config updates. */
export interface PersonalityConfigMessage {
  /** ISO timestamp of the update */
  timestamp: string;
  /** JSON-encoded CompiledEmbodiedConfig */
  config_json: string;
  /** Config version hash for deduplication */
  config_hash: string;
  /** Channel tags (e.g., "motion", "gaze", "safety") */
  channels: string[];
}

/** Acknowledgment from the robot/server. */
export interface ConfigAck {
  /** Whether the config was accepted */
  accepted: boolean;
  /** Error message if rejected */
  error?: string;
  /** Timestamp of acknowledgment */
  timestamp: string;
}

// ─── Configuration ──────────────────────────────────────────

export interface GrpcAdapterOptions {
  /** gRPC server address (default: localhost:50051) */
  host: string;
  /** Use TLS (default: false — insecure for local dev) */
  tls?: boolean;
  /** Service name for the gRPC service definition */
  serviceName?: string;
  /** Connection timeout in ms (default: 5000) */
  connectTimeout?: number;
}

// ─── Adapter ────────────────────────────────────────────────

export class GrpcAdapter implements RuntimeAdapter {
  readonly type = "grpc" as const;

  private client: GrpcClient | null = null;
  private connected = false;
  private grpc: GrpcPackage | null = null;

  private readonly host: string;
  private readonly tls: boolean;
  private readonly serviceName: string;
  private readonly connectTimeout: number;

  constructor(options: GrpcAdapterOptions) {
    this.host = options.host;
    this.tls = options.tls ?? false;
    this.serviceName = options.serviceName ?? "holomime.EmbodimentService";
    this.connectTimeout = options.connectTimeout ?? 5000;
  }

  async connect(): Promise<void> {
    // Dynamically import @grpc/grpc-js so the adapter can be defined
    // even if the package is not installed (fails at connect time).
    try {
      // @ts-expect-error — optional peer dependency, resolved at runtime
      this.grpc = await import("@grpc/grpc-js") as unknown as GrpcPackage;
    } catch {
      throw new Error(
        "gRPC adapter requires @grpc/grpc-js. Install it with: npm install @grpc/grpc-js",
      );
    }

    const credentials = this.tls
      ? this.grpc.credentials.createSsl()
      : this.grpc.credentials.createInsecure();

    // Define a minimal service with a PushConfig unary RPC
    const ServiceClient = this.grpc.makeGenericClientConstructor(
      {
        PushConfig: {
          path: `/${this.serviceName}/PushConfig`,
          requestStream: false,
          responseStream: false,
          requestSerialize: (msg: PersonalityConfigMessage) => Buffer.from(JSON.stringify(msg)),
          requestDeserialize: (buf: Buffer) => JSON.parse(buf.toString()) as PersonalityConfigMessage,
          responseSerialize: (msg: ConfigAck) => Buffer.from(JSON.stringify(msg)),
          responseDeserialize: (buf: Buffer) => JSON.parse(buf.toString()) as ConfigAck,
        },
      },
      this.serviceName,
    );

    this.client = new ServiceClient(this.host, credentials);

    // Wait for the channel to be ready
    return new Promise<void>((resolve, reject) => {
      const deadline = new Date(Date.now() + this.connectTimeout);
      this.client!.waitForReady(deadline, (err) => {
        if (err) {
          this.client?.close();
          this.client = null;
          reject(new Error(`gRPC connection to ${this.host} failed: ${err.message}`));
        } else {
          this.connected = true;
          resolve();
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
    this.connected = false;
  }

  async push(config: CompiledEmbodiedConfig): Promise<void> {
    if (!this.connected || !this.client) {
      throw new Error("gRPC adapter not connected");
    }

    const message: PersonalityConfigMessage = {
      timestamp: new Date().toISOString(),
      config_json: JSON.stringify(config),
      config_hash: config.metadata.personality_hash,
      channels: ["motion", "gaze", "proxemics", "prosody", "safety"],
    };

    return new Promise<void>((resolve, reject) => {
      // Use the generic client's unary call method
      const client = this.client as unknown as Record<string, (
        msg: PersonalityConfigMessage,
        callback: (err: Error | null, response?: ConfigAck) => void,
      ) => void>;

      client["PushConfig"](message, (err: Error | null, response?: ConfigAck) => {
        if (err) {
          reject(new Error(`gRPC push failed: ${err.message}`));
          return;
        }
        if (response && !response.accepted) {
          reject(new Error(`gRPC push rejected: ${response.error ?? "unknown reason"}`));
          return;
        }
        resolve();
      });
    });
  }

  isConnected(): boolean {
    return this.connected;
  }
}
