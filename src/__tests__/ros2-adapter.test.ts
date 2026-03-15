import { describe, it, expect } from "vitest";
import { ROS2Adapter } from "../adapters/ros2-adapter.js";
import type { CompiledEmbodiedConfig } from "../core/embodiment-types.js";

// ─── Mock Config ────────────────────────────────────────────

function createMockConfig(): CompiledEmbodiedConfig {
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
      base_speed: 0.5, gesture_speed: 0.6, gesture_amplitude: 0.4, gesture_frequency: 0.7,
      approach_distance: 0.5, spatial_exploration: 0.3, movement_smoothness: 0.8,
      trajectory_variability: 0.4, response_latency: 0.5, idle_animation_frequency: 0.3,
      gaze_contact_ratio: 0.6, head_tilt_tendency: 0.5, postural_openness: 0.7,
      smile_frequency: 0.6, voice_volume: 0.5, speaking_rate: 0.5, pitch_variation: 0.4,
      pause_duration: 0.5,
    },
    safety_envelope: {
      max_linear_speed_m_s: 1.5, max_angular_speed_rad_s: 2.0,
      min_proximity_m: 0.3, max_contact_force_n: 10, emergency_stop_decel_m_s2: 5.0,
    },
    active_modalities: ["gesture", "gaze", "voice"],
    gesture_vocabulary: ["wave", "nod"],
    prosody: { pitch_variation: 0.4, speaking_rate_wpm: 150, volume_db_offset: 0, pause_tendency: 0.5 },
    gaze: { contact_ratio: 0.6, aversion_style: "look_away", tracking_mode: "face" },
    proxemics: { intimate_m: 0.45, personal_m: 1.2, social_m: 3.6, preferred_zone: "personal" },
    haptics: { touch_permitted: false, requires_consent: true, allowed_contacts: ["none"] },
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe("ROS2Adapter", () => {
  describe("message generation", () => {
    it("generates 5 topic messages from config", () => {
      const adapter = new ROS2Adapter({ endpoint: "ws://localhost:9090" });
      const config = createMockConfig();
      const messages = adapter.configToMessages(config);

      expect(messages).toHaveLength(5);
      expect(messages.map(m => m.topic)).toEqual([
        "/holomime/gaze",
        "/holomime/proxemics",
        "/holomime/prosody",
        "/holomime/motion",
        "/holomime/safety",
      ]);
    });

    it("all messages have publish op", () => {
      const adapter = new ROS2Adapter({ endpoint: "ws://localhost:9090" });
      const config = createMockConfig();
      const messages = adapter.configToMessages(config);

      for (const msg of messages) {
        expect(msg.op).toBe("publish");
      }
    });

    it("gaze message contains correct data", () => {
      const adapter = new ROS2Adapter({ endpoint: "ws://localhost:9090" });
      const config = createMockConfig();
      const messages = adapter.configToMessages(config);

      const gazeMsg = messages.find(m => m.topic === "/holomime/gaze")!;
      const gazeData = JSON.parse(gazeMsg.msg.data as string);
      expect(gazeData.contact_ratio).toBe(0.6);
      expect(gazeData.aversion_style).toBe("look_away");
      expect(gazeData.tracking_mode).toBe("face");
    });

    it("motion message contains all 18 parameters", () => {
      const adapter = new ROS2Adapter({ endpoint: "ws://localhost:9090" });
      const config = createMockConfig();
      const messages = adapter.configToMessages(config);

      const motionMsg = messages.find(m => m.topic === "/holomime/motion")!;
      const motionData = JSON.parse(motionMsg.msg.data as string);
      expect(Object.keys(motionData)).toHaveLength(18);
      expect(motionData.base_speed).toBe(0.5);
      expect(motionData.gesture_speed).toBe(0.6);
    });

    it("safety message contains envelope data", () => {
      const adapter = new ROS2Adapter({ endpoint: "ws://localhost:9090" });
      const config = createMockConfig();
      const messages = adapter.configToMessages(config);

      const safetyMsg = messages.find(m => m.topic === "/holomime/safety")!;
      const safetyData = JSON.parse(safetyMsg.msg.data as string);
      expect(safetyData.max_linear_speed_m_s).toBe(1.5);
      expect(safetyData.min_proximity_m).toBe(0.3);
    });

    it("uses custom topic prefix", () => {
      const adapter = new ROS2Adapter({
        endpoint: "ws://localhost:9090",
        topicPrefix: "/my_robot",
      });
      const config = createMockConfig();
      const messages = adapter.configToMessages(config);

      expect(messages[0].topic).toBe("/my_robot/gaze");
      expect(messages[4].topic).toBe("/my_robot/safety");
    });
  });

  describe("adapter type", () => {
    it("has type ros2", () => {
      const adapter = new ROS2Adapter({ endpoint: "ws://localhost:9090" });
      expect(adapter.type).toBe("ros2");
    });

    it("is not connected before connect()", () => {
      const adapter = new ROS2Adapter({ endpoint: "ws://localhost:9090" });
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe("push without connection", () => {
    it("throws when pushing before connect", async () => {
      const adapter = new ROS2Adapter({ endpoint: "ws://localhost:9090" });
      const config = createMockConfig();
      await expect(adapter.push(config)).rejects.toThrow("ROS2 adapter not connected");
    });
  });
});
