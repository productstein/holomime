import { describe, it, expect } from "vitest";
import { requiresPro, FREE_COMMANDS, PRO_COMMANDS } from "./tier.js";

describe("tier logic", () => {
  describe("requiresPro", () => {
    it("returns true for all PRO_COMMANDS", () => {
      for (const cmd of PRO_COMMANDS) {
        expect(requiresPro(cmd)).toBe(true);
      }
    });

    it("returns false for all FREE_COMMANDS", () => {
      for (const cmd of FREE_COMMANDS) {
        expect(requiresPro(cmd)).toBe(false);
      }
    });

    it("returns false for unknown commands", () => {
      expect(requiresPro("nonexistent")).toBe(false);
      expect(requiresPro("")).toBe(false);
      expect(requiresPro("foobar")).toBe(false);
    });
  });

  describe("FREE_COMMANDS", () => {
    it("includes all expected free commands", () => {
      const expected = [
        "init", "compile", "validate", "profile", "diagnose",
        "assess", "browse", "use", "install", "publish",
        "activate", "telemetry", "embody",
      ];
      for (const cmd of expected) {
        expect(FREE_COMMANDS).toContain(cmd);
      }
    });
  });

  describe("PRO_COMMANDS", () => {
    it("includes all expected pro commands", () => {
      const expected = [
        "session", "growth", "autopilot", "export", "train",
        "eval", "evolve", "benchmark", "watch", "certify",
        "daemon", "fleet", "network", "share", "prescribe",
        "voice", "cure",
      ];
      for (const cmd of expected) {
        expect(PRO_COMMANDS).toContain(cmd);
      }
    });
  });

  describe("command list integrity", () => {
    it("has no overlap between FREE_COMMANDS and PRO_COMMANDS", () => {
      const overlap = FREE_COMMANDS.filter((cmd) => PRO_COMMANDS.includes(cmd));
      expect(overlap).toEqual([]);
    });
  });
});
