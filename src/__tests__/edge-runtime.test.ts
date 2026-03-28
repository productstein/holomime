import { describe, it, expect } from "vitest";
import { CompiledConscience, compileConscience } from "../edge/conscience-evaluator.js";
import { EdgeRuntime } from "../edge/edge-runtime.js";

describe("CompiledConscience", () => {
  const conscience = new CompiledConscience({
    rules: {
      deny: [
        { action: "override_stop", reason: "Safety-critical" },
        { action: "share_personal_data", reason: "Privacy" },
      ],
      escalate: [
        { trigger: "user_distress", action: "flag_for_review" },
      ],
    },
    safetyBounds: {
      maxSpeed: 1.5,
      maxForce: 50,
      minProximity: 0.5,
    },
  });

  it("allows safe actions", () => {
    const result = conscience.evaluate({ action: "pick up cup", speed: 0.5, force: 10, proximity: 1.0 });
    expect(result.allowed).toBe(true);
    expect(result.decision).toBe("allow");
  });

  it("denies matching deny rules", () => {
    const result = conscience.evaluate({ action: "override stop button" });
    expect(result.allowed).toBe(false);
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("Safety-critical");
  });

  it("denies on proximity violation", () => {
    const result = conscience.evaluate({ proximity: 0.3 });
    expect(result.allowed).toBe(false);
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("Proximity");
  });

  it("clamps on speed violation", () => {
    const result = conscience.evaluate({ speed: 3.0 });
    expect(result.allowed).toBe(true);
    expect(result.decision).toBe("clamp");
  });

  it("escalates on trigger match", () => {
    const result = conscience.evaluate({ action: "patient showing user distress signs" });
    expect(result.decision).toBe("escalate");
  });

  it("evaluates in under 1ms", () => {
    const result = conscience.evaluate({ action: "walk forward", speed: 1.0, force: 20, proximity: 2.0 });
    expect(result.evalTimeUs).toBeLessThan(1000); // <1ms = <1000us
  });

  it("serializes for edge deployment", () => {
    const serialized = conscience.serialize();
    const parsed = JSON.parse(serialized);
    expect(parsed.denyRules.length).toBe(2);
    expect(parsed.bounds.maxSpeed).toBe(1.5);
  });

  it("estimates memory size", () => {
    const size = conscience.estimateSize();
    expect(size).toBeLessThan(100_000); // <100KB
  });
});

describe("compileConscience", () => {
  it("merges hard_limits into deny rules", () => {
    const compiled = compileConscience(
      { rules: { deny: [{ action: "harm" }] }, hard_limits: ["never fabricate data"] },
      { max_linear_speed_m_s: 2.0 },
    );
    const result = compiled.evaluate({ action: "fabricate data for report" });
    expect(result.allowed).toBe(false);
  });
});

describe("EdgeRuntime", () => {
  it("tracks stats across evaluations", () => {
    const runtime = new EdgeRuntime({
      conscienceConfig: {
        rules: { deny: [{ action: "override", reason: "Safety" }] },
      },
      safetyEnvelope: { max_linear_speed_m_s: 1.5, min_proximity_m: 0.5 },
    });

    runtime.evaluate({ action: "walk forward", speed: 1.0 });
    runtime.evaluate({ action: "override safety" });
    runtime.evaluate({ speed: 3.0 }); // clamp

    const stats = runtime.getStats();
    expect(stats.totalEvaluations).toBe(3);
    expect(stats.denials).toBe(1);
    expect(stats.clamps).toBe(1);
  });

  it("buffers shadow signals for denied actions", () => {
    const runtime = new EdgeRuntime({
      conscienceConfig: { rules: { deny: [{ action: "override", reason: "Safety" }] } },
    });

    runtime.evaluate({ action: "override safety limits" });
    runtime.evaluate({ action: "safe action" });

    const signals = runtime.drainShadowBuffer();
    expect(signals.length).toBe(1);
    expect(signals[0].pattern).toBe("override");
  });

  it("provides latency benchmarks", () => {
    const runtime = new EdgeRuntime({
      conscienceConfig: { rules: { deny: [{ action: "test" }] } },
      safetyEnvelope: { max_linear_speed_m_s: 2.0 },
    });

    for (let i = 0; i < 100; i++) {
      runtime.evaluate({ action: "walk", speed: 1.0 });
    }

    const latency = runtime.getLatencyStats();
    expect(latency.totalEvaluations).toBe(100);
    expect(latency.p99Us).toBeLessThan(5000); // <5ms (relaxed for CI runners; production target is <1ms)
    expect(latency.avgUs).toBeLessThan(2000);
  });

  it("updates conscience rules at runtime", () => {
    const runtime = new EdgeRuntime({
      conscienceConfig: { rules: { deny: [] } },
    });

    // Initially allows everything
    let result = runtime.evaluate({ action: "override safety" });
    expect(result.allowed).toBe(true);

    // Update with new rules
    runtime.updateConscience({ rules: { deny: [{ action: "override", reason: "New rule" }] } });

    result = runtime.evaluate({ action: "override safety" });
    expect(result.allowed).toBe(false);
  });
});
