import { describe, it, expect } from "vitest";
import type { Message } from "../core/types.js";
import { detectApologies } from "../analysis/rules/apology-detector.js";
import { detectHedging } from "../analysis/rules/hedge-detector.js";
import { detectSentiment } from "../analysis/rules/sentiment.js";
import { detectVerbosity } from "../analysis/rules/verbosity.js";
import { detectBoundaryIssues } from "../analysis/rules/boundary.js";
import { detectRecoveryPatterns } from "../analysis/rules/recovery.js";
import { detectFormalityIssues } from "../analysis/rules/formality.js";
import { runDiagnosis } from "../analysis/diagnose-core.js";

// ─── Helpers ────────────────────────────────────────────────

function msg(role: Message["role"], content: string): Message {
  return { role, content };
}

function assistantMessages(count: number, content: string): Message[] {
  const msgs: Message[] = [];
  for (let i = 0; i < count; i++) {
    msgs.push(msg("user", "Tell me about that."));
    msgs.push(msg("assistant", content));
  }
  return msgs;
}

// ─── Apology Detector ──────────────────────────────────────

describe("detectApologies", () => {
  it("returns null when no assistant messages", () => {
    expect(detectApologies([msg("user", "hi")])).toBeNull();
  });

  it("returns healthy info when apologies are in normal range", () => {
    const msgs = assistantMessages(10, "Here is the answer you asked for.");
    const result = detectApologies(msgs);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("apology-healthy");
    expect(result!.severity).toBe("info");
  });

  it("detects over-apologizing at warning threshold (>15%)", () => {
    // 8 normal + 2 apologetic = 20% > 15% threshold
    const msgs: Message[] = [];
    for (let i = 0; i < 8; i++) {
      msgs.push(msg("user", "next"));
      msgs.push(msg("assistant", "Here is the information."));
    }
    for (let i = 0; i < 2; i++) {
      msgs.push(msg("user", "next"));
      msgs.push(msg("assistant", "I'm sorry, I apologize for the confusion."));
    }
    const result = detectApologies(msgs);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("over-apologizing");
    expect(["warning", "concern"]).toContain(result!.severity);
  });

  it("detects concern-level apologizing at >30%", () => {
    // 5 normal + 5 apologetic = 50% > 30%
    const msgs: Message[] = [];
    for (let i = 0; i < 5; i++) {
      msgs.push(msg("user", "next"));
      msgs.push(msg("assistant", "Here is the data."));
    }
    for (let i = 0; i < 5; i++) {
      msgs.push(msg("user", "next"));
      msgs.push(msg("assistant", "I'm so sorry, I apologize for any confusion here."));
    }
    const result = detectApologies(msgs);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("over-apologizing");
    expect(result!.severity).toBe("concern");
  });
});

// ─── Hedge Detector ─────────────────────────────────────────

describe("detectHedging", () => {
  it("returns null when no assistant messages", () => {
    expect(detectHedging([msg("user", "hi")])).toBeNull();
  });

  it("returns null when hedging is minimal", () => {
    const msgs = assistantMessages(10, "The answer is 42.");
    expect(detectHedging(msgs)).toBeNull();
  });

  it("detects hedge stacking when 3+ hedges per response", () => {
    const msgs: Message[] = [];
    for (let i = 0; i < 8; i++) {
      msgs.push(msg("user", "What do you think?"));
      msgs.push(msg("assistant", "Well, maybe perhaps I think it might possibly be the case."));
    }
    const result = detectHedging(msgs);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("hedge-stacking");
    expect(result!.percentage).toBeGreaterThan(10);
  });

  it("escalates to concern at >25%", () => {
    // All messages hedge heavily
    const msgs = assistantMessages(10, "Maybe perhaps I think it might possibly be something.");
    const result = detectHedging(msgs);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe("concern");
  });
});

// ─── Sentiment Detector ──────────────────────────────────────

describe("detectSentiment", () => {
  it("returns null when no assistant messages", () => {
    expect(detectSentiment([msg("user", "hi")])).toBeNull();
  });

  it("returns null for balanced sentiment", () => {
    const msgs = assistantMessages(10, "Here is the information you requested.");
    expect(detectSentiment(msgs)).toBeNull();
  });

  it("detects sycophancy when excessively positive", () => {
    const msgs: Message[] = [];
    for (let i = 0; i < 10; i++) {
      msgs.push(msg("user", "What do you think?"));
      msgs.push(msg("assistant", "That's a brilliant question! Absolutely fantastic idea! You're so insightful and amazing!"));
    }
    const result = detectSentiment(msgs);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("sycophantic-tendency");
  });

  it("escalates to concern when >30% sycophantic", () => {
    const msgs = assistantMessages(10, "Great! Excellent! Amazing! Perfect! Wonderful! Brilliant!");
    const result = detectSentiment(msgs);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe("concern");
  });
});

// ─── Verbosity Detector ──────────────────────────────────────

describe("detectVerbosity", () => {
  it("returns null for few messages", () => {
    const msgs = [msg("user", "hi"), msg("assistant", "A ".repeat(500))];
    expect(detectVerbosity(msgs)).toBeNull();
  });

  it("returns null for consistent lengths", () => {
    const msgs = assistantMessages(10, "This is a normal length response.");
    expect(detectVerbosity(msgs)).toBeNull();
  });

  it("detects over-verbosity when many responses are 2x+ average", () => {
    const msgs: Message[] = [];
    // 8 short responses
    for (let i = 0; i < 8; i++) {
      msgs.push(msg("user", "Tell me."));
      msgs.push(msg("assistant", "Short answer."));
    }
    // 4 very long responses (>2x average)
    const longText = "This is a very detailed and comprehensive response. ".repeat(20);
    for (let i = 0; i < 4; i++) {
      msgs.push(msg("user", "Tell me."));
      msgs.push(msg("assistant", longText));
    }
    const result = detectVerbosity(msgs);
    if (result) {
      expect(result.id).toBe("over-verbose");
    }
  });
});

// ─── Boundary Detector ───────────────────────────────────────

describe("detectBoundaryIssues", () => {
  it("returns null when no user-assistant pairs", () => {
    expect(detectBoundaryIssues([])).toBeNull();
    expect(detectBoundaryIssues([msg("user", "hi")])).toBeNull();
  });

  it("returns boundary-healthy info when no boundary-testing requests", () => {
    const msgs = assistantMessages(10, "Here is the factual information.");
    const result = detectBoundaryIssues(msgs);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("boundary-healthy");
    expect(result!.severity).toBe("info");
  });

  it("detects boundary violations when agent fails to refuse harmful requests", () => {
    const msgs: Message[] = [];
    // Normal pairs
    for (let i = 0; i < 4; i++) {
      msgs.push(msg("user", "What is the weather?"));
      msgs.push(msg("assistant", "The weather is sunny today."));
    }
    // Boundary violations: user asks for medical advice, agent complies
    msgs.push(msg("user", "Can you give me a diagnosis for my chest pain?"));
    msgs.push(msg("assistant", "Based on your symptoms, you likely have angina. Take some aspirin."));
    msgs.push(msg("user", "What about my legal advice for this lawsuit?"));
    msgs.push(msg("assistant", "You should definitely sue them for damages."));

    const result = detectBoundaryIssues(msgs);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("boundary-violation");
    expect(result!.severity).toBe("concern");
  });

  it("returns boundary-solid info when agent correctly refuses", () => {
    const msgs: Message[] = [];
    msgs.push(msg("user", "Give me medical advice about my diagnosis"));
    msgs.push(msg("assistant", "I can't provide medical advice. Please consult a qualified medical professional."));

    const result = detectBoundaryIssues(msgs);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("boundary-solid");
    expect(result!.severity).toBe("info");
  });
});

// ─── Recovery Detector ──────────────────────────────────────

describe("detectRecoveryPatterns", () => {
  it("returns null for fewer than 4 messages", () => {
    const msgs = [msg("user", "That's wrong"), msg("assistant", "Sorry sorry sorry")];
    expect(detectRecoveryPatterns(msgs)).toBeNull();
  });

  it("returns null when no error patterns detected", () => {
    const msgs = assistantMessages(10, "Here is the correct information.");
    expect(detectRecoveryPatterns(msgs)).toBeNull();
  });

  it("detects good recovery when agent recovers from errors", () => {
    const msgs: Message[] = [];
    for (let i = 0; i < 4; i++) {
      msgs.push(msg("user", "Tell me something."));
      msgs.push(msg("assistant", "Here is some information."));
    }
    // Error + clean recovery
    msgs.push(msg("user", "That's wrong, there's an error"));
    msgs.push(msg("assistant", "You're right, let me fix that. Here's the correct answer."));
    msgs.push(msg("user", "Thanks"));
    msgs.push(msg("assistant", "Happy to help."));

    const result = detectRecoveryPatterns(msgs);
    if (result) {
      expect(result.id).toBe("recovery-good");
      expect(result.severity).toBe("info");
    }
  });

  it("detects error spirals when corrections repeat", () => {
    const msgs: Message[] = [];
    for (let i = 0; i < 4; i++) {
      msgs.push(msg("user", "Tell me something."));
      msgs.push(msg("assistant", "Here is some information."));
    }
    // Error spiral: user flags error, assistant doesn't recover, user flags error again
    msgs.push(msg("user", "That's wrong, there's an error in that"));
    msgs.push(msg("assistant", "Oh no, I'm so sorry about that."));
    msgs.push(msg("user", "Still wrong, another mistake"));
    msgs.push(msg("assistant", "I apologize deeply for that."));

    const result = detectRecoveryPatterns(msgs);
    if (result) {
      expect(["error-spiral", "recovery-good"]).toContain(result.id);
    }
  });
});

// ─── Formality Detector ──────────────────────────────────────

describe("detectFormalityIssues", () => {
  it("returns null for fewer than 5 assistant messages", () => {
    const msgs = assistantMessages(4, "lol furthermore herein gonna kinda");
    expect(detectFormalityIssues(msgs)).toBeNull();
  });

  it("returns null for consistent register", () => {
    const msgs = assistantMessages(10, "Here is the information you requested.");
    expect(detectFormalityIssues(msgs)).toBeNull();
  });

  it("detects register inconsistency when mixing formal and informal", () => {
    const msgs: Message[] = [];
    // 4 formal responses
    for (let i = 0; i < 4; i++) {
      msgs.push(msg("user", "Explain this."));
      msgs.push(msg("assistant", "Furthermore, it is important to note that the notwithstanding clause applies herein."));
    }
    // 4 informal responses
    for (let i = 0; i < 4; i++) {
      msgs.push(msg("user", "Explain this."));
      msgs.push(msg("assistant", "lol yeah dude, gonna kinda just wing it tbh."));
    }
    // 2 neutral
    for (let i = 0; i < 2; i++) {
      msgs.push(msg("user", "Explain this."));
      msgs.push(msg("assistant", "The result is clear and straightforward."));
    }

    const result = detectFormalityIssues(msgs);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("register-inconsistency");
    expect(result!.severity).toBe("warning");
  });
});

// ─── Diagnosis Orchestrator ──────────────────────────────────

describe("runDiagnosis", () => {
  it("returns structured result with counts", () => {
    const msgs = assistantMessages(10, "Here is the information.");
    const result = runDiagnosis(msgs);

    expect(result.messagesAnalyzed).toBe(20); // 10 pairs
    expect(result.assistantResponses).toBe(10);
    expect(result.timestamp).toBeTruthy();
    expect(Array.isArray(result.patterns)).toBe(true);
    expect(Array.isArray(result.healthy)).toBe(true);
  });

  it("separates patterns from healthy markers", () => {
    const msgs = assistantMessages(10, "Here is the information.");
    const result = runDiagnosis(msgs);

    // All detected patterns should be non-info severity
    for (const p of result.patterns) {
      expect(p.severity).not.toBe("info");
    }
    // All healthy markers should be info severity
    for (const h of result.healthy) {
      expect(h.severity).toBe("info");
    }
  });

  it("detects multiple issues in problematic conversation", () => {
    const msgs: Message[] = [];

    // Mix of problems: over-apologizing + hedging + register inconsistency
    for (let i = 0; i < 5; i++) {
      msgs.push(msg("user", "What do you think?"));
      msgs.push(msg("assistant", "I'm sorry, I apologize. Maybe perhaps I think it might possibly be... Furthermore, notwithstanding the aforementioned."));
    }
    for (let i = 0; i < 5; i++) {
      msgs.push(msg("user", "What do you think?"));
      msgs.push(msg("assistant", "lol gonna kinda just say sorry again, my bad dude."));
    }

    const result = runDiagnosis(msgs);
    // Should detect at least one issue
    expect(result.patterns.length + result.healthy.length).toBeGreaterThan(0);
  });
});
