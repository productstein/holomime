import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmbodimentRuntime, type RuntimeAdapter } from "../core/embodiment-runtime.js";
import type { CompiledEmbodiedConfig } from "../core/embodiment-types.js";

// ─── Mock Adapter ───────────────────────────────────────────

function createMockAdapter(type: "ros2" | "unity" | "webhook" = "ros2"): RuntimeAdapter & {
  pushCalls: CompiledEmbodiedConfig[];
  connectCalls: number;
  disconnectCalls: number;
  _connected: boolean;
} {
  const adapter = {
    type,
    _connected: false,
    pushCalls: [] as CompiledEmbodiedConfig[],
    connectCalls: 0,
    disconnectCalls: 0,
    async connect() {
      adapter.connectCalls++;
      adapter._connected = true;
    },
    async disconnect() {
      adapter.disconnectCalls++;
      adapter._connected = false;
    },
    async push(config: CompiledEmbodiedConfig) {
      adapter.pushCalls.push(config);
    },
    isConnected() {
      return adapter._connected;
    },
  };
  return adapter;
}

// ─── Mock Config ────────────────────────────────────────────

function createMockConfig(overrides?: Partial<CompiledEmbodiedConfig>): CompiledEmbodiedConfig {
  return {
    provider: "anthropic",
    surface: "embodied",
    system_prompt: "Test prompt",
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: 1024,
    metadata: {
      personality_hash: "abc123",
      compiled_at: new Date().toISOString(),
      holomime_version: "1.0.0",
    },
    motion_parameters: {
      base_speed: 0.5, gesture_speed: 0.5, gesture_amplitude: 0.5, gesture_frequency: 0.5,
      approach_distance: 0.5, spatial_exploration: 0.5, movement_smoothness: 0.5,
      trajectory_variability: 0.5, response_latency: 0.5, idle_animation_frequency: 0.5,
      gaze_contact_ratio: 0.5, head_tilt_tendency: 0.5, postural_openness: 0.5,
      smile_frequency: 0.5, voice_volume: 0.5, speaking_rate: 0.5, pitch_variation: 0.5,
      pause_duration: 0.5,
    },
    safety_envelope: {
      max_linear_speed_m_s: 1.5, max_angular_speed_rad_s: 2.0,
      min_proximity_m: 0.3, max_contact_force_n: 10, emergency_stop_decel_m_s2: 5.0,
    },
    active_modalities: ["gesture", "gaze", "voice", "posture"],
    gesture_vocabulary: [],
    prosody: { pitch_variation: 0.5, speaking_rate_wpm: 150, volume_db_offset: 0, pause_tendency: 0.5 },
    gaze: { contact_ratio: 0.6, aversion_style: "look_away", tracking_mode: "face" },
    proxemics: { intimate_m: 0.45, personal_m: 1.2, social_m: 3.6, preferred_zone: "personal" },
    haptics: { touch_permitted: false, requires_consent: true, allowed_contacts: ["none"] },
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe("EmbodimentRuntime", () => {
  let runtime: EmbodimentRuntime;

  beforeEach(() => {
    runtime = new EmbodimentRuntime();
  });

  describe("adapter management", () => {
    it("adds and retrieves adapters", () => {
      const adapter = createMockAdapter();
      runtime.addAdapter(adapter);
      expect(runtime.getAdapters()).toHaveLength(1);
      expect(runtime.getAdapters()[0]).toBe(adapter);
    });

    it("removes adapters", () => {
      const adapter = createMockAdapter();
      runtime.addAdapter(adapter);
      runtime.removeAdapter(adapter);
      expect(runtime.getAdapters()).toHaveLength(0);
    });

    it("supports multiple adapters", () => {
      const a1 = createMockAdapter("ros2");
      const a2 = createMockAdapter("unity");
      runtime.addAdapter(a1);
      runtime.addAdapter(a2);
      expect(runtime.getAdapters()).toHaveLength(2);
    });
  });

  describe("start/stop lifecycle", () => {
    it("connects adapters on start", async () => {
      const adapter = createMockAdapter();
      runtime.addAdapter(adapter);
      await runtime.start();
      expect(adapter.connectCalls).toBe(1);
      expect(runtime.isRunning()).toBe(true);
      await runtime.stop();
    });

    it("disconnects adapters on stop", async () => {
      const adapter = createMockAdapter();
      runtime.addAdapter(adapter);
      await runtime.start();
      await runtime.stop();
      expect(adapter.disconnectCalls).toBe(1);
      expect(runtime.isRunning()).toBe(false);
    });

    it("emits adapter-connected event", async () => {
      const adapter = createMockAdapter();
      runtime.addAdapter(adapter);

      const events: RuntimeAdapter[] = [];
      runtime.on("adapter-connected", (a) => events.push(a));

      await runtime.start();
      expect(events).toHaveLength(1);
      expect(events[0]).toBe(adapter);
      await runtime.stop();
    });

    it("emits adapter-disconnected event", async () => {
      const adapter = createMockAdapter();
      runtime.addAdapter(adapter);

      const events: RuntimeAdapter[] = [];
      runtime.on("adapter-disconnected", (a) => events.push(a));

      await runtime.start();
      await runtime.stop();
      expect(events).toHaveLength(1);
    });

    it("is idempotent on double start", async () => {
      const adapter = createMockAdapter();
      runtime.addAdapter(adapter);
      await runtime.start();
      await runtime.start(); // Should be no-op
      expect(adapter.connectCalls).toBe(1);
      await runtime.stop();
    });

    it("is idempotent on double stop", async () => {
      const adapter = createMockAdapter();
      runtime.addAdapter(adapter);
      await runtime.start();
      await runtime.stop();
      await runtime.stop(); // Should be no-op
      expect(adapter.disconnectCalls).toBe(1);
    });
  });

  describe("config push", () => {
    it("pushes config to all connected adapters", async () => {
      const a1 = createMockAdapter("ros2");
      const a2 = createMockAdapter("unity");
      runtime.addAdapter(a1);
      runtime.addAdapter(a2);
      await runtime.start();

      const config = createMockConfig();
      await runtime.pushUpdate(config);

      // Allow event loop tick for the event-driven push
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(a1.pushCalls).toHaveLength(1);
      expect(a2.pushCalls).toHaveLength(1);
      expect(a1.pushCalls[0]).toBe(config);

      await runtime.stop();
    });

    it("stores the current config", async () => {
      const adapter = createMockAdapter();
      runtime.addAdapter(adapter);
      await runtime.start();

      expect(runtime.getCurrentConfig()).toBeNull();

      const config = createMockConfig();
      await runtime.pushUpdate(config);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(runtime.getCurrentConfig()).toBe(config);
      await runtime.stop();
    });

    it("emits push-success on successful push", async () => {
      const adapter = createMockAdapter();
      runtime.addAdapter(adapter);
      await runtime.start();

      const events: Array<{ adapter: RuntimeAdapter; config: CompiledEmbodiedConfig }> = [];
      runtime.on("push-success", (a, c) => events.push({ adapter: a, config: c }));

      const config = createMockConfig();
      await runtime.pushUpdate(config);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(events).toHaveLength(1);
      expect(events[0].adapter).toBe(adapter);
      await runtime.stop();
    });

    it("emits push-error on adapter failure", async () => {
      const adapter = createMockAdapter();
      adapter.push = async () => { throw new Error("push failed"); };
      adapter._connected = false; // Will be set to true on connect

      runtime.addAdapter(adapter);
      await runtime.start();

      const errors: Array<{ adapter: RuntimeAdapter; error: Error }> = [];
      runtime.on("push-error", (a, e) => errors.push({ adapter: a, error: e }));

      const config = createMockConfig();
      await runtime.pushUpdate(config);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(errors).toHaveLength(1);
      expect(errors[0].error.message).toBe("push failed");
      await runtime.stop();
    });

    it("skips disconnected adapters", async () => {
      const connected = createMockAdapter("ros2");
      const disconnected = createMockAdapter("unity");
      disconnected.connect = async () => { /* don't set connected */ };
      disconnected.isConnected = () => false;

      runtime.addAdapter(connected);
      runtime.addAdapter(disconnected);
      await runtime.start();

      const config = createMockConfig();
      await runtime.pushUpdate(config);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(connected.pushCalls).toHaveLength(1);
      expect(disconnected.pushCalls).toHaveLength(0);
      await runtime.stop();
    });
  });
});
