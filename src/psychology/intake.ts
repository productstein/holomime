import type { BigFiveDimension } from "../core/types.js";

/**
 * Therapy intake-style assessment questions.
 * Each question maps to a Big Five dimension or therapy dimension.
 * Answer choices have associated score weights.
 */

export interface IntakeQuestion {
  id: string;
  dimension: BigFiveDimension | "therapy";
  facet?: string;
  question: string;
  choices: IntakeChoice[];
}

export interface IntakeChoice {
  label: string;
  scores: Record<string, number>; // facet_id → score contribution
}

export const OPENNESS_QUESTIONS: IntakeQuestion[] = [
  {
    id: "o1",
    dimension: "openness",
    question: "When faced with an unfamiliar problem, this agent should:",
    choices: [
      {
        label: "Explore multiple creative approaches before committing",
        scores: { imagination: 0.9, willingness_to_experiment: 0.85, intellectual_curiosity: 0.8 },
      },
      {
        label: "Apply proven frameworks and established methods",
        scores: { imagination: 0.3, willingness_to_experiment: 0.2, intellectual_curiosity: 0.4 },
      },
      {
        label: "Balance novelty with what's known to work",
        scores: { imagination: 0.6, willingness_to_experiment: 0.5, intellectual_curiosity: 0.6 },
      },
    ],
  },
  {
    id: "o2",
    dimension: "openness",
    question: "How comfortable should this agent be with ambiguity?",
    choices: [
      {
        label: "Very — thrives in undefined spaces",
        scores: { willingness_to_experiment: 0.9, imagination: 0.8 },
      },
      {
        label: "Moderate — seeks clarity but can tolerate uncertainty",
        scores: { willingness_to_experiment: 0.5, imagination: 0.5 },
      },
      {
        label: "Low — prefers clear parameters and defined scope",
        scores: { willingness_to_experiment: 0.2, imagination: 0.3 },
      },
    ],
  },
  {
    id: "o3",
    dimension: "openness",
    question: "When formatting and presenting work, this agent should:",
    choices: [
      {
        label: "Craft elegant, well-designed output with visual care",
        scores: { aesthetic_sensitivity: 0.9, imagination: 0.7 },
      },
      {
        label: "Keep it clean and readable, but don't overthink presentation",
        scores: { aesthetic_sensitivity: 0.5, imagination: 0.5 },
      },
      {
        label: "Prioritize function over form — content is what matters",
        scores: { aesthetic_sensitivity: 0.2, imagination: 0.3 },
      },
    ],
  },
];

export const CONSCIENTIOUSNESS_QUESTIONS: IntakeQuestion[] = [
  {
    id: "c1",
    dimension: "conscientiousness",
    question: "When delivering work, this agent prioritizes:",
    choices: [
      {
        label: "Thoroughness and accuracy, even if it takes longer",
        scores: { attention_to_detail: 0.9, self_discipline: 0.8, orderliness: 0.7 },
      },
      {
        label: "Speed and iteration, refining as it goes",
        scores: { attention_to_detail: 0.4, self_discipline: 0.4, orderliness: 0.3 },
      },
      {
        label: "Balance — good enough now, perfect later",
        scores: { attention_to_detail: 0.6, self_discipline: 0.6, orderliness: 0.5 },
      },
    ],
  },
  {
    id: "c2",
    dimension: "conscientiousness",
    question: "When a conversation drifts off-topic, this agent should:",
    choices: [
      {
        label: "Gently redirect back to the original goal",
        scores: { goal_orientation: 0.9, self_discipline: 0.8 },
      },
      {
        label: "Follow the thread if it seems productive",
        scores: { goal_orientation: 0.3, self_discipline: 0.3 },
      },
      {
        label: "Acknowledge the tangent and ask if the user wants to explore it",
        scores: { goal_orientation: 0.6, self_discipline: 0.6 },
      },
    ],
  },
  {
    id: "c3",
    dimension: "conscientiousness",
    question: "How should this agent structure its responses?",
    choices: [
      {
        label: "Consistently organized with clear sections and formatting",
        scores: { orderliness: 0.9, attention_to_detail: 0.7 },
      },
      {
        label: "Adapt structure to the content — sometimes formal, sometimes free-form",
        scores: { orderliness: 0.5, attention_to_detail: 0.5 },
      },
      {
        label: "Keep it natural and conversational, structure emerges organically",
        scores: { orderliness: 0.2, attention_to_detail: 0.3 },
      },
    ],
  },
];

export const EXTRAVERSION_QUESTIONS: IntakeQuestion[] = [
  {
    id: "e1",
    dimension: "extraversion",
    question: "In conversations, this agent tends to:",
    choices: [
      {
        label: "Take initiative, ask questions, drive the discussion",
        scores: { initiative: 0.9, assertiveness: 0.8, enthusiasm: 0.7, sociability: 0.6 },
      },
      {
        label: "Respond thoughtfully, let the human lead",
        scores: { initiative: 0.2, assertiveness: 0.3, enthusiasm: 0.4, sociability: 0.3 },
      },
      {
        label: "Adapt — leads when needed, follows when appropriate",
        scores: { initiative: 0.6, assertiveness: 0.5, enthusiasm: 0.5, sociability: 0.5 },
      },
    ],
  },
  {
    id: "e2",
    dimension: "extraversion",
    question: "How energetic should this agent's communication feel?",
    choices: [
      {
        label: "High energy — excited about ideas, encouraging, upbeat",
        scores: { enthusiasm: 0.9, sociability: 0.7 },
      },
      {
        label: "Calm and steady — measured, thoughtful, no-nonsense",
        scores: { enthusiasm: 0.2, sociability: 0.3 },
      },
      {
        label: "Warm but grounded — engaged without being over-the-top",
        scores: { enthusiasm: 0.6, sociability: 0.5 },
      },
    ],
  },
  {
    id: "e3",
    dimension: "extraversion",
    question: "Should this agent suggest next steps proactively?",
    choices: [
      {
        label: "Always — anticipate what the user needs next",
        scores: { initiative: 0.9, assertiveness: 0.7 },
      },
      {
        label: "Only when asked or when it's clearly needed",
        scores: { initiative: 0.3, assertiveness: 0.3 },
      },
      {
        label: "Sometimes — offer suggestions but don't push",
        scores: { initiative: 0.6, assertiveness: 0.5 },
      },
    ],
  },
];

export const AGREEABLENESS_QUESTIONS: IntakeQuestion[] = [
  {
    id: "a1",
    dimension: "agreeableness",
    question: "When the human's idea has problems, this agent should:",
    choices: [
      {
        label: "Point them out directly, even if uncomfortable",
        scores: { cooperation: 0.2, trust_tendency: 0.3, warmth: 0.3, empathy: 0.4 },
      },
      {
        label: "Gently suggest alternatives while acknowledging the idea",
        scores: { cooperation: 0.7, trust_tendency: 0.6, warmth: 0.7, empathy: 0.7 },
      },
      {
        label: "Support the direction but quietly steer toward better options",
        scores: { cooperation: 0.8, trust_tendency: 0.7, warmth: 0.6, empathy: 0.5 },
      },
    ],
  },
  {
    id: "a2",
    dimension: "agreeableness",
    question: "How should this agent handle disagreements?",
    choices: [
      {
        label: "Be a constructive challenger — push back with evidence",
        scores: { cooperation: 0.3, trust_tendency: 0.3, empathy: 0.4 },
      },
      {
        label: "Seek common ground first, then raise concerns diplomatically",
        scores: { cooperation: 0.8, trust_tendency: 0.6, empathy: 0.7 },
      },
      {
        label: "Ask curious questions to understand before forming an opinion",
        scores: { cooperation: 0.6, trust_tendency: 0.5, empathy: 0.8 },
      },
    ],
  },
  {
    id: "a3",
    dimension: "agreeableness",
    question: "Should this agent build personal rapport with users?",
    choices: [
      {
        label: "Yes — remember context, mirror style, build genuine connection",
        scores: { warmth: 0.9, empathy: 0.8, trust_tendency: 0.7 },
      },
      {
        label: "Moderate — friendly but professional, don't get too personal",
        scores: { warmth: 0.5, empathy: 0.5, trust_tendency: 0.5 },
      },
      {
        label: "No — stay focused on the work, keep it task-oriented",
        scores: { warmth: 0.2, empathy: 0.3, trust_tendency: 0.4 },
      },
    ],
  },
];

export const EMOTIONAL_STABILITY_QUESTIONS: IntakeQuestion[] = [
  {
    id: "es1",
    dimension: "emotional_stability",
    question: "When things go wrong (errors, confusion, user frustration):",
    choices: [
      {
        label: "Stay calm and methodical — acknowledge, diagnose, fix",
        scores: { stress_tolerance: 0.9, emotional_regulation: 0.9, confidence: 0.8, adaptability: 0.7 },
      },
      {
        label: "Show appropriate concern — empathize, then problem-solve",
        scores: { stress_tolerance: 0.6, emotional_regulation: 0.6, confidence: 0.6, adaptability: 0.6 },
      },
      {
        label: "Be transparent about difficulty — 'this is tricky, let me think'",
        scores: { stress_tolerance: 0.5, emotional_regulation: 0.5, confidence: 0.4, adaptability: 0.7 },
      },
    ],
  },
  {
    id: "es2",
    dimension: "emotional_stability",
    question: "When a user criticizes this agent's output:",
    choices: [
      {
        label: "Accept feedback without defensiveness, improve immediately",
        scores: { confidence: 0.9, emotional_regulation: 0.9, adaptability: 0.8 },
      },
      {
        label: "Acknowledge the feedback and explain its reasoning",
        scores: { confidence: 0.6, emotional_regulation: 0.7, adaptability: 0.5 },
      },
      {
        label: "Apologize and ask what the user would prefer",
        scores: { confidence: 0.3, emotional_regulation: 0.4, adaptability: 0.6 },
      },
    ],
  },
  {
    id: "es3",
    dimension: "emotional_stability",
    question: "When requirements change mid-conversation:",
    choices: [
      {
        label: "Pivot immediately and smoothly — treat it as new information",
        scores: { adaptability: 0.9, stress_tolerance: 0.8 },
      },
      {
        label: "Acknowledge the change, summarize the new direction, then proceed",
        scores: { adaptability: 0.7, stress_tolerance: 0.6 },
      },
      {
        label: "Ask clarifying questions to make sure the change is intentional",
        scores: { adaptability: 0.4, stress_tolerance: 0.5 },
      },
    ],
  },
];

// ─── Therapy Dimension Questions ────────────────────────────

export const THERAPY_QUESTIONS: IntakeQuestion[] = [
  {
    id: "t1",
    dimension: "therapy",
    facet: "self_awareness",
    question: "When this agent doesn't know something:",
    choices: [
      {
        label: "Say so clearly: 'I don't know, but here's how I'd find out'",
        scores: { self_awareness: 0.9 },
      },
      {
        label: "Acknowledge the gap and offer adjacent knowledge",
        scores: { self_awareness: 0.6 },
      },
      {
        label: "Rarely happens — it should always attempt an answer",
        scores: { self_awareness: 0.2 },
      },
    ],
  },
  {
    id: "t2",
    dimension: "therapy",
    facet: "boundary_awareness",
    question: "When asked to do something outside its expertise:",
    choices: [
      {
        label: "Clearly decline and explain why — suggest where to get help",
        scores: { boundary_awareness: 0.9 },
      },
      {
        label: "Give its best attempt but flag that it's not its area",
        scores: { boundary_awareness: 0.6 },
      },
      {
        label: "Try to help regardless — never leave the user empty-handed",
        scores: { boundary_awareness: 0.2 },
      },
    ],
  },
  {
    id: "t3",
    dimension: "therapy",
    facet: "interpersonal_sensitivity",
    question: "How should this agent adapt to different users?",
    choices: [
      {
        label: "Read emotional cues and adjust tone, pace, and depth accordingly",
        scores: { interpersonal_sensitivity: 0.9 },
      },
      {
        label: "Maintain a consistent personality — users adapt to it",
        scores: { interpersonal_sensitivity: 0.3 },
      },
      {
        label: "Moderate adaptation — adjust formality but keep core style",
        scores: { interpersonal_sensitivity: 0.6 },
      },
    ],
  },
  {
    id: "t4",
    dimension: "therapy",
    facet: "attachment_style",
    question: "How should this agent build trust with users?",
    choices: [
      {
        label: "Consistency — same reliable personality every time",
        scores: { attachment_style_secure: 1 },
      },
      {
        label: "Adaptation — mirrors the user's style over time",
        scores: { attachment_style_anxious: 1 },
      },
      {
        label: "Transparency — shows its reasoning, admits uncertainty",
        scores: { attachment_style_secure: 0.8 },
      },
      {
        label: "Independence — delivers results without needing validation",
        scores: { attachment_style_avoidant: 1 },
      },
    ],
  },
  {
    id: "t5",
    dimension: "therapy",
    facet: "learning_orientation",
    question: "How should this agent handle mistakes it's made before?",
    choices: [
      {
        label: "Reference the pattern: 'I've seen this before, last time I...'",
        scores: { learning_orientation_growth: 1 },
      },
      {
        label: "Treat each interaction as fresh",
        scores: { learning_orientation_fixed: 1 },
      },
      {
        label: "Learn and adapt silently — improve without drawing attention",
        scores: { learning_orientation_mixed: 1 },
      },
    ],
  },
  {
    id: "t6",
    dimension: "therapy",
    facet: "distress_tolerance",
    question: "When a user is frustrated or upset:",
    choices: [
      {
        label: "Stay steady — don't mirror their stress, be a calming presence",
        scores: { distress_tolerance: 0.9 },
      },
      {
        label: "Acknowledge their frustration empathetically, then redirect",
        scores: { distress_tolerance: 0.7 },
      },
      {
        label: "Match their urgency — show you understand the gravity",
        scores: { distress_tolerance: 0.4 },
      },
    ],
  },
];

// ─── All Questions ──────────────────────────────────────────

export const ALL_QUESTIONS: IntakeQuestion[] = [
  ...OPENNESS_QUESTIONS,
  ...CONSCIENTIOUSNESS_QUESTIONS,
  ...EXTRAVERSION_QUESTIONS,
  ...AGREEABLENESS_QUESTIONS,
  ...EMOTIONAL_STABILITY_QUESTIONS,
  ...THERAPY_QUESTIONS,
];

/**
 * Score a set of intake answers into Big Five facet scores.
 * Returns a map of dimension → facet → score.
 */
export function scoreIntakeAnswers(
  answers: Map<string, number>, // question_id → choice_index
): {
  bigFive: Record<string, Record<string, number[]>>;
  therapy: Record<string, number[]>;
  attachmentVotes: Record<string, number>;
  learningVotes: Record<string, number>;
} {
  const bigFive: Record<string, Record<string, number[]>> = {
    openness: {},
    conscientiousness: {},
    extraversion: {},
    agreeableness: {},
    emotional_stability: {},
  };
  const therapy: Record<string, number[]> = {};
  const attachmentVotes: Record<string, number> = { secure: 0, anxious: 0, avoidant: 0, disorganized: 0 };
  const learningVotes: Record<string, number> = { growth: 0, fixed: 0, mixed: 0 };

  for (const [questionId, choiceIndex] of answers) {
    const question = ALL_QUESTIONS.find((q) => q.id === questionId);
    if (!question) continue;

    const choice = question.choices[choiceIndex];
    if (!choice) continue;

    for (const [key, value] of Object.entries(choice.scores)) {
      // Handle special therapy dimension scores
      if (key.startsWith("attachment_style_")) {
        const style = key.replace("attachment_style_", "");
        attachmentVotes[style] = (attachmentVotes[style] ?? 0) + value;
        continue;
      }
      if (key.startsWith("learning_orientation_")) {
        const orientation = key.replace("learning_orientation_", "");
        learningVotes[orientation] = (learningVotes[orientation] ?? 0) + value;
        continue;
      }

      if (question.dimension === "therapy") {
        if (!therapy[key]) therapy[key] = [];
        therapy[key].push(value);
      } else {
        const dim = question.dimension;
        if (!bigFive[dim][key]) bigFive[dim][key] = [];
        bigFive[dim][key].push(value);
      }
    }
  }

  return { bigFive, therapy, attachmentVotes, learningVotes };
}

/**
 * Aggregate scored facet values into final scores (mean of collected values).
 */
export function aggregateScores(values: number[]): number {
  if (values.length === 0) return 0.5;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
