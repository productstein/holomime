import { describe, it, expect } from "vitest";
import { WebhookAdapter } from "../adapters/webhook-adapter.js";
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
    active_modalities: ["gesture", "gaze", "voice"],
    gesture_vocabulary: [],
    prosody: { pitch_variation: 0.5, speaking_rate_wpm: 150, volume_db_offset: 0, pause_tendency: 0.5 },
    gaze: { contact_ratio: 0.6, aversion_style: "look_away", tracking_mode: "face" },
    proxemics: { intimate_m: 0.45, personal_m: 1.2, social_m: 3.6, preferred_zone: "personal" },
    haptics: { touch_permitted: false, requires_consent: true, allowed_contacts: ["none"] },
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe("WebhookAdapter", () => {
  describe("adapter type", () => {
    it("has type webhook", () => {
      const adapter = new WebhookAdapter({ url: "https://example.com/hook" });
      expect(adapter.type).toBe("webhook");
    });

    it("is not connected before connect()", () => {
      const adapter = new WebhookAdapter({ url: "https://example.com/hook" });
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe("push without connection", () => {
    it("throws when pushing before connect", async () => {
      const adapter = new WebhookAdapter({ url: "https://example.com/hook" });
      const config = createMockConfig();
      await expect(adapter.push(config)).rejects.toThrow("Webhook adapter not connected");
    });
  });

  describe("disconnect", () => {
    it("marks adapter as disconnected", async () => {
      const adapter = new WebhookAdapter({ url: "https://example.com/hook" });
      // Manually connect (since connect does HTTP check which would fail in tests)
      await adapter.connect().catch(() => {}); // Ignore network errors
      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe("configuration", () => {
    it("accepts bearer token option", () => {
      // Verify constructor doesn't throw
      const adapter = new WebhookAdapter({
        url: "https://example.com/hook",
        bearerToken: "test-token-123",
      });
      expect(adapter.type).toBe("webhook");
    });

    it("accepts custom headers", () => {
      const adapter = new WebhookAdapter({
        url: "https://example.com/hook",
        headers: { "X-Custom": "value" },
      });
      expect(adapter.type).toBe("webhook");
    });

    it("accepts all HTTP methods", () => {
      for (const method of ["POST", "PUT", "PATCH"] as const) {
        const adapter = new WebhookAdapter({
          url: "https://example.com/hook",
          method,
        });
        expect(adapter.type).toBe("webhook");
      }
    });
  });
});
