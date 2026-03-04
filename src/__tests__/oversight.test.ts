import { describe, it, expect } from "vitest";
import {
  resolveOversight,
  checkApproval,
  checkIterationBudget,
  DEFAULT_OVERSIGHT,
  type OversightPolicy,
} from "../core/oversight.js";

describe("Oversight", () => {
  describe("DEFAULT_OVERSIGHT", () => {
    it("defaults to review mode", () => {
      expect(DEFAULT_OVERSIGHT.mode).toBe("review");
    });

    it("notifies on all events", () => {
      expect(DEFAULT_OVERSIGHT.notifyOn).toContain("drift");
      expect(DEFAULT_OVERSIGHT.notifyOn).toContain("session");
      expect(DEFAULT_OVERSIGHT.notifyOn).toContain("spec-change");
      expect(DEFAULT_OVERSIGHT.notifyOn).toContain("dpo-export");
    });

    it("requires approval for spec-writes by default", () => {
      expect(DEFAULT_OVERSIGHT.requireApprovalFor).toContain("spec-writes");
    });
  });

  describe("resolveOversight", () => {
    it("returns defaults when no flags provided", () => {
      const policy = resolveOversight({});
      expect(policy.mode).toBe("review");
      expect(policy.maxAutonomousIterations).toBe(5);
    });

    it("overrides mode when provided", () => {
      const policy = resolveOversight({ mode: "none" });
      expect(policy.mode).toBe("none");
      expect(policy.requireApprovalFor).toEqual([]);
    });

    it("approve mode requires all approvals", () => {
      const policy = resolveOversight({ mode: "approve" });
      expect(policy.requireApprovalFor).toContain("spec-writes");
      expect(policy.requireApprovalFor).toContain("training-export");
      expect(policy.requireApprovalFor).toContain("network-therapy");
    });

    it("approve-specs mode only requires spec-writes", () => {
      const policy = resolveOversight({ mode: "approve-specs" });
      expect(policy.requireApprovalFor).toContain("spec-writes");
      expect(policy.requireApprovalFor).not.toContain("training-export");
    });

    it("overrides maxAutonomousIterations", () => {
      const policy = resolveOversight({ maxAutonomousIterations: 10 });
      expect(policy.maxAutonomousIterations).toBe(10);
    });
  });

  describe("checkApproval", () => {
    it("allows all actions in none mode", () => {
      const policy = resolveOversight({ mode: "none" });
      expect(checkApproval("spec-writes", policy).approved).toBe(true);
      expect(checkApproval("training-export", policy).approved).toBe(true);
      expect(checkApproval("network-therapy", policy).approved).toBe(true);
    });

    it("blocks spec-writes in approve-specs mode", () => {
      const policy = resolveOversight({ mode: "approve-specs" });
      const result = checkApproval("spec-writes", policy);
      expect(result.approved).toBe(false);
      expect(result.reason).toContain("spec-writes");
    });

    it("allows training-export in approve-specs mode", () => {
      const policy = resolveOversight({ mode: "approve-specs" });
      expect(checkApproval("training-export", policy).approved).toBe(true);
    });

    it("blocks all actions in approve mode", () => {
      const policy = resolveOversight({ mode: "approve" });
      expect(checkApproval("spec-writes", policy).approved).toBe(false);
      expect(checkApproval("training-export", policy).approved).toBe(false);
      expect(checkApproval("network-therapy", policy).approved).toBe(false);
    });
  });

  describe("checkIterationBudget", () => {
    it("within budget when under limit", () => {
      const policy = resolveOversight({ maxAutonomousIterations: 5 });
      expect(checkIterationBudget(3, policy).withinBudget).toBe(true);
    });

    it("exceeds budget at limit", () => {
      const policy = resolveOversight({ maxAutonomousIterations: 5 });
      expect(checkIterationBudget(5, policy).withinBudget).toBe(false);
    });

    it("returns the limit", () => {
      const policy = resolveOversight({ maxAutonomousIterations: 10 });
      expect(checkIterationBudget(3, policy).limit).toBe(10);
    });
  });
});
