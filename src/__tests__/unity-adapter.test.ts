import { describe, it, expect } from "vitest";
import { UnityAdapter } from "../adapters/unity-adapter.js";

// ─── Tests ──────────────────────────────────────────────────

describe("UnityAdapter", () => {
  describe("adapter type", () => {
    it("has type unity", () => {
      const adapter = new UnityAdapter({ port: 8765 });
      expect(adapter.type).toBe("unity");
    });

    it("is not connected before connect()", () => {
      const adapter = new UnityAdapter({ port: 8765 });
      expect(adapter.isConnected()).toBe(false);
    });

    it("reports 0 clients before connect", () => {
      const adapter = new UnityAdapter({ port: 8765 });
      expect(adapter.getClientCount()).toBe(0);
    });
  });

  describe("configuration", () => {
    it("accepts port option", () => {
      const adapter = new UnityAdapter({ port: 9999 });
      expect(adapter.type).toBe("unity");
    });

    it("accepts host option", () => {
      const adapter = new UnityAdapter({ port: 8765, host: "127.0.0.1" });
      expect(adapter.type).toBe("unity");
    });

    it("accepts custom transition options", () => {
      const adapter = new UnityAdapter({
        port: 8765,
        defaultTransition: { duration_ms: 1000, easing: "linear" },
      });
      expect(adapter.type).toBe("unity");
    });
  });

  describe("push without connection", () => {
    it("throws when pushing before connect", async () => {
      const adapter = new UnityAdapter({ port: 8765 });
      await expect(adapter.push({} as any)).rejects.toThrow("Unity adapter not connected");
    });

    it("throws when pushing parameter before connect", async () => {
      const adapter = new UnityAdapter({ port: 8765 });
      await expect(adapter.pushParameter("motion", {})).rejects.toThrow("Unity adapter not connected");
    });
  });

  describe("lifecycle", () => {
    it("connects and disconnects cleanly", async () => {
      // Use a random high port to avoid conflicts
      const port = 18000 + Math.floor(Math.random() * 1000);
      const adapter = new UnityAdapter({ port });

      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);

      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
    });
  });
});
