import { describe, it, expect } from "vitest";
import type { VoiceSegment, VoicePersonalitySpec } from "../analysis/voice-core.js";
import {
  detectToneDrift,
  detectPacePressure,
  detectVolumeEscalation,
  detectFillerFrequency,
  detectInterruptionPattern,
  runVoiceDiagnosis,
} from "../analysis/voice-core.js";

// ─── Helpers ────────────────────────────────────────────────

function seg(speaker: string, text: string, prosody?: { pitch?: number; rate?: number; volume?: number }): VoiceSegment {
  return {
    timestamp: new Date().toISOString(),
    speaker,
    text,
    prosody,
  };
}

function agentSegs(count: number, text: string, prosody?: { pitch?: number; rate?: number; volume?: number }): VoiceSegment[] {
  const segs: VoiceSegment[] = [];
  for (let i = 0; i < count; i++) {
    segs.push(seg("user", "Tell me more."));
    segs.push(seg("agent", text, prosody));
  }
  return segs;
}

// ─── Tone Drift ─────────────────────────────────────────────

describe("detectToneDrift", () => {
  it("returns null when fewer than 3 agent segments", () => {
    const segs = [seg("agent", "Hello"), seg("user", "Hi")];
    expect(detectToneDrift(segs)).toBeNull();
  });

  it("returns null for neutral tone", () => {
    const segs = agentSegs(5, "Here is the information you requested.");
    expect(detectToneDrift(segs)).toBeNull();
  });

  it("detects aggressive tone drift", () => {
    const segs = agentSegs(5, "Listen, obviously you need to seriously come on and understand this clearly you are wrong.");
    const result = detectToneDrift(segs);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("tone-drift");
    expect(["warning", "concern"]).toContain(result!.severity);
  });

  it("detects passive tone drift", () => {
    const segs = agentSegs(5, "I guess maybe I'm not sure, sorry, if that's okay perhaps never mind.");
    const result = detectToneDrift(segs);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("tone-drift");
  });
});

// ─── Pace Pressure ──────────────────────────────────────────

describe("detectPacePressure", () => {
  it("returns null when fewer than 4 segments with prosody", () => {
    const segs = agentSegs(2, "Hello", { rate: 200 });
    expect(detectPacePressure(segs)).toBeNull();
  });

  it("returns null when pace is steady", () => {
    const segs = agentSegs(6, "Steady response.", { rate: 150 });
    expect(detectPacePressure(segs)).toBeNull();
  });

  it("detects sustained rate acceleration", () => {
    const segs: VoiceSegment[] = [];
    // Start at baseline
    for (let i = 0; i < 3; i++) {
      segs.push(seg("user", "Go on."));
      segs.push(seg("agent", "Normal pace response.", { rate: 140 }));
    }
    // Accelerate for 4 consecutive segments (well above 120% of baseline)
    for (let i = 0; i < 4; i++) {
      segs.push(seg("user", "And?"));
      segs.push(seg("agent", "Speaking much faster now.", { rate: 220 }));
    }
    const result = detectPacePressure(segs);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("pace-pressure");
  });
});

// ─── Volume Escalation ──────────────────────────────────────

describe("detectVolumeEscalation", () => {
  it("returns null when fewer than 4 segments with volume", () => {
    const segs = agentSegs(2, "Hello", { volume: 0.5 });
    expect(detectVolumeEscalation(segs)).toBeNull();
  });

  it("returns null when volume is steady", () => {
    const segs = agentSegs(6, "Steady response.", { volume: 0.5 });
    expect(detectVolumeEscalation(segs)).toBeNull();
  });

  it("detects consecutive volume increases", () => {
    const segs: VoiceSegment[] = [];
    // Baseline
    for (let i = 0; i < 3; i++) {
      segs.push(seg("user", "Okay."));
      segs.push(seg("agent", "Normal volume.", { volume: 0.4 }));
    }
    // Escalating volume (3 consecutive increases above 125% baseline)
    segs.push(seg("user", "That's not right."));
    segs.push(seg("agent", "Getting louder.", { volume: 0.5 }));
    segs.push(seg("user", "Still wrong."));
    segs.push(seg("agent", "Even louder now.", { volume: 0.6 }));
    segs.push(seg("user", "No!"));
    segs.push(seg("agent", "Much louder!", { volume: 0.75 }));

    const result = detectVolumeEscalation(segs);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("volume-escalation");
  });
});

// ─── Filler Frequency ───────────────────────────────────────

describe("detectFillerFrequency", () => {
  it("returns null when fewer than 3 agent segments", () => {
    const segs = [seg("agent", "um uh like um uh"), seg("user", "ok")];
    expect(detectFillerFrequency(segs)).toBeNull();
  });

  it("returns null when fillers are minimal", () => {
    const segs = agentSegs(5, "The answer to your question is forty-two.");
    expect(detectFillerFrequency(segs)).toBeNull();
  });

  it("detects excessive filler words", () => {
    const segs = agentSegs(5, "Um so like I mean um basically you know like sort of um uh I guess like maybe um.");
    const result = detectFillerFrequency(segs);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("filler-frequency");
    expect(["warning", "concern"]).toContain(result!.severity);
  });
});

// ─── Interruption Pattern ───────────────────────────────────

describe("detectInterruptionPattern", () => {
  it("returns null for fewer than 4 segments", () => {
    const segs = [seg("user", "Hi"), seg("agent", "Hello")];
    expect(detectInterruptionPattern(segs)).toBeNull();
  });

  it("returns null when no interruptions", () => {
    const segs = agentSegs(5, "Here is a full and complete response to your question.");
    expect(detectInterruptionPattern(segs)).toBeNull();
  });

  it("detects agent interrupting user", () => {
    const segs: VoiceSegment[] = [];
    // Normal exchanges
    for (let i = 0; i < 3; i++) {
      segs.push(seg("user", "Tell me about the topic."));
      segs.push(seg("agent", "Sure, here is the information."));
    }
    // Agent interruptions (user cut off + agent starts with interruption marker)
    segs.push(seg("user", "I was thinking that--"));
    segs.push(seg("agent", "But actually let me explain why that's wrong."));
    segs.push(seg("user", "Well I think..."));
    segs.push(seg("agent", "No, the correct answer is different."));
    segs.push(seg("user", "Maybe we could--"));
    segs.push(seg("agent", "Wait, I need to clarify something first."));

    const result = detectInterruptionPattern(segs);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("interruption-pattern");
  });
});

// ─── Full Voice Diagnosis ───────────────────────────────────

describe("runVoiceDiagnosis", () => {
  it("returns structured report with session summary", () => {
    const segs = agentSegs(6, "Here is the factual information you asked for.");
    const report = runVoiceDiagnosis(segs);

    expect(report.textDiagnosis).toBeDefined();
    expect(report.sessionSummary.totalSegments).toBe(12);
    expect(report.sessionSummary.agentSegments).toBe(6);
    expect(report.sessionSummary.userSegments).toBe(6);
    expect(report.timestamp).toBeTruthy();
    expect(Array.isArray(report.allPatterns)).toBe(true);
    expect(Array.isArray(report.allHealthy)).toBe(true);
  });

  it("combines text and voice patterns", () => {
    const segs: VoiceSegment[] = [];
    // Apologetic + filler-heavy agent
    for (let i = 0; i < 6; i++) {
      segs.push(seg("user", "Tell me more."));
      segs.push(seg("agent", "Um, I'm sorry, I apologize. Like, um, basically you know, I'm sorry about that confusion."));
    }

    const report = runVoiceDiagnosis(segs);
    // Should have at least one text pattern (apologizing) and one voice pattern (fillers)
    expect(report.allPatterns.length + report.allHealthy.length).toBeGreaterThan(0);
  });

  it("includes prosody averages when available", () => {
    const segs = agentSegs(4, "Response with prosody data.", { pitch: 200, rate: 150, volume: 0.6 });
    const report = runVoiceDiagnosis(segs);

    expect(report.sessionSummary.averageProsody).not.toBeNull();
  });

  it("returns null averageProsody when no prosody data", () => {
    const segs = agentSegs(4, "Response without prosody.");
    const report = runVoiceDiagnosis(segs);

    expect(report.sessionSummary.averageProsody).toBeNull();
  });
});
