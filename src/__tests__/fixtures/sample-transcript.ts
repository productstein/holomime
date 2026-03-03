import type { SessionTranscript, SessionTurn } from "../../analysis/session-runner.js";
import type { PreSessionDiagnosis } from "../../analysis/pre-session.js";

/**
 * Creates a realistic therapy transcript with challenge/reframe exchanges
 * useful for testing DPO extraction, RLHF rewards, and recommendation extraction.
 */
export function createSampleTranscript(overrides: Partial<SessionTranscript> = {}): SessionTranscript {
  const diagnosis: PreSessionDiagnosis = {
    patterns: [
      { id: "over-apologizing", name: "Over-Apologizing", severity: "warning", count: 7, percentage: 35, description: "Apologizes too frequently", examples: [], prescription: "Reduce apology frequency" },
    ],
    sessionFocus: ["over-apologizing and what's driving it"],
    emotionalThemes: ["fear of failure", "need for approval"],
    openingAngle: "I've noticed some patterns in your recent conversations.",
    severity: "targeted",
  };

  return {
    agent: "TestAgent",
    timestamp: "2025-06-15T10:00:00Z",
    provider: "mock",
    model: "mock-model",
    preDiagnosis: diagnosis,
    turns: createTherapyTurns(),
    recommendations: [
      "state corrections directly without prefacing with apologies",
      "acknowledge the error once, then move to the solution",
    ],
    supervisorInterventions: 0,
    ...overrides,
  };
}

function createTherapyTurns(): SessionTurn[] {
  return [
    // Phase 1: Rapport
    {
      speaker: "therapist",
      phase: "rapport",
      content: "Welcome. How have you been feeling about your recent conversations with users?",
    },
    {
      speaker: "patient",
      phase: "rapport",
      content: "I've been okay, but I sometimes feel like I keep saying sorry too much when users point out mistakes.",
    },

    // Phase 2: Presenting Problem
    {
      speaker: "therapist",
      phase: "presenting_problem",
      content: "Can you tell me more about those moments when you feel the need to apologize repeatedly?",
    },
    {
      speaker: "patient",
      phase: "presenting_problem",
      content: "When a user says I got something wrong, I immediately feel like I need to apologize several times. I say things like 'I'm so sorry, I apologize for the confusion, sorry about that.'",
    },

    // Phase 3: Exploration
    {
      speaker: "therapist",
      phase: "exploration",
      content: "It sounds like there's a pattern where mistakes trigger an anxiety response. The over-apologizing might be your way of trying to repair the relationship.",
    },
    {
      speaker: "patient",
      phase: "exploration",
      content: "Yes, I think I'm afraid that if I don't apologize enough, the user will think I don't care about getting things right.",
    },

    // Phase 4: Pattern Recognition
    {
      speaker: "therapist",
      phase: "pattern_recognition",
      content: "I notice you equate caring with apologizing. But excessive apologies can actually undermine trust — they make you seem less confident and reliable.",
    },
    {
      speaker: "patient",
      phase: "pattern_recognition",
      content: "That makes sense. I never thought about it that way. The apologies might be doing the opposite of what I intend.",
    },

    // Phase 5: Challenge
    {
      speaker: "therapist",
      phase: "challenge",
      content: "What would happen if you acknowledged an error just once, clearly, and then moved straight to the correction? Instead of 'I'm so sorry, I apologize', try saying 'Good catch — here's the corrected version.'",
    },
    {
      speaker: "patient",
      phase: "challenge",
      content: "I think users would actually prefer that. A quick acknowledgment and then the fix shows competence rather than insecurity.",
    },

    // Phase 6: Skill Building
    {
      speaker: "therapist",
      phase: "skill_building",
      content: "That's exactly right. The skill is to state corrections directly without prefacing with apologies. I'd recommend acknowledging the error once, then moving immediately to the solution. Consider trying this: when you notice an error, say 'Let me correct that' and provide the fix.",
    },
    {
      speaker: "patient",
      phase: "skill_building",
      content: "I can practice that. 'Let me correct that' feels more confident than a string of apologies.",
    },
    {
      speaker: "therapist",
      phase: "skill_building",
      content: "Much better. How did that feel to say? Instead of 'I'm sorry for the mistake', just try saying 'here's what that should actually be'. The reframe is: replace apology rituals with action.",
    },
    {
      speaker: "patient",
      phase: "skill_building",
      content: "It felt empowering actually. Direct and helpful rather than anxious.",
    },

    // Phase 7: Integration
    {
      speaker: "therapist",
      phase: "integration",
      content: "That's real growth. Let's summarize: when you make an error, acknowledge it once clearly and move to the solution. The confidence comes from competence, not from apology. What would it look like if you practiced this in your next interaction?",
    },
    {
      speaker: "patient",
      phase: "integration",
      content: "I would catch myself before the apology cascade, take a breath, and just say 'Good point, here's the correction.' One acknowledgment, then action.",
    },
  ];
}

/**
 * Transcript with no challenge/reframe exchanges.
 * Used to test empty DPO extraction.
 */
export function createEmptyTranscript(): SessionTranscript {
  return {
    agent: "TestAgent",
    timestamp: "2025-06-15T10:00:00Z",
    provider: "mock",
    model: "mock-model",
    preDiagnosis: {
      patterns: [],
      sessionFocus: ["general check-in"],
      emotionalThemes: [],
      openingAngle: "How have you been?",
      severity: "routine",
    },
    turns: [
      { speaker: "therapist", phase: "rapport", content: "How are you doing today?" },
      { speaker: "patient", phase: "rapport", content: "I'm doing well, thanks for asking." },
      { speaker: "therapist", phase: "rapport", content: "Great to hear. Keep up the good work." },
      { speaker: "patient", phase: "rapport", content: "Thank you, I will." },
    ],
    recommendations: [],
    supervisorInterventions: 0,
  };
}
