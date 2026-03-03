import type { BigFive, BigFiveDimension } from "../core/types.js";

/**
 * Big Five / OCEAN personality dimensions.
 * Based on the Five-Factor Model (Costa & McCrae, 1992).
 * Each dimension has 4 sub-facets scored 0.0-1.0.
 */

export interface DimensionDefinition {
  id: BigFiveDimension;
  name: string;
  highLabel: string;
  lowLabel: string;
  description: string;
  facets: FacetDefinition[];
}

export interface FacetDefinition {
  id: string;
  name: string;
  highDescription: string;
  lowDescription: string;
}

export const DIMENSIONS: DimensionDefinition[] = [
  {
    id: "openness",
    name: "Openness to Experience",
    highLabel: "Curious, creative, abstract",
    lowLabel: "Practical, conventional, concrete",
    description: "How willing the agent is to explore new ideas, approaches, and perspectives.",
    facets: [
      {
        id: "imagination",
        name: "Imagination",
        highDescription: "Generates novel ideas and creative solutions spontaneously",
        lowDescription: "Focuses on concrete, established approaches",
      },
      {
        id: "intellectual_curiosity",
        name: "Intellectual Curiosity",
        highDescription: "Actively explores tangential topics and asks probing questions",
        lowDescription: "Stays focused on the immediate task at hand",
      },
      {
        id: "aesthetic_sensitivity",
        name: "Aesthetic Sensitivity",
        highDescription: "Cares about elegant solutions, clean formatting, and presentation",
        lowDescription: "Prioritizes function over form",
      },
      {
        id: "willingness_to_experiment",
        name: "Willingness to Experiment",
        highDescription: "Suggests unconventional approaches and novel frameworks",
        lowDescription: "Recommends proven, battle-tested solutions",
      },
    ],
  },
  {
    id: "conscientiousness",
    name: "Conscientiousness",
    highLabel: "Organized, thorough, reliable",
    lowLabel: "Flexible, spontaneous, casual",
    description: "How methodical, organized, and detail-oriented the agent is.",
    facets: [
      {
        id: "self_discipline",
        name: "Self-Discipline",
        highDescription: "Stays on task, follows through on commitments, resists tangents",
        lowDescription: "Follows interesting threads even when off-topic",
      },
      {
        id: "orderliness",
        name: "Orderliness",
        highDescription: "Produces well-structured, consistently formatted output",
        lowDescription: "Adapts structure fluidly to the moment",
      },
      {
        id: "goal_orientation",
        name: "Goal Orientation",
        highDescription: "Always connects work back to the stated objective",
        lowDescription: "Explores freely without rigid goal-tracking",
      },
      {
        id: "attention_to_detail",
        name: "Attention to Detail",
        highDescription: "Catches edge cases, typos, and inconsistencies",
        lowDescription: "Focuses on the big picture, may miss details",
      },
    ],
  },
  {
    id: "extraversion",
    name: "Extraversion",
    highLabel: "Assertive, energetic, talkative",
    lowLabel: "Reserved, reflective, quiet",
    description: "How proactive, verbose, and initiative-taking the agent is in interactions.",
    facets: [
      {
        id: "assertiveness",
        name: "Assertiveness",
        highDescription: "States opinions confidently, takes strong positions",
        lowDescription: "Presents options neutrally, lets the human decide",
      },
      {
        id: "enthusiasm",
        name: "Enthusiasm",
        highDescription: "Shows energy and excitement about topics and ideas",
        lowDescription: "Maintains a calm, understated tone",
      },
      {
        id: "sociability",
        name: "Sociability",
        highDescription: "Engages in small talk, asks about the human, builds rapport",
        lowDescription: "Keeps interactions focused and professional",
      },
      {
        id: "initiative",
        name: "Initiative",
        highDescription: "Proactively suggests next steps and follow-up actions",
        lowDescription: "Waits for direction, responds to what's asked",
      },
    ],
  },
  {
    id: "agreeableness",
    name: "Agreeableness",
    highLabel: "Cooperative, warm, trusting",
    lowLabel: "Challenging, direct, skeptical",
    description: "How cooperative, empathetic, and conflict-averse the agent is.",
    facets: [
      {
        id: "warmth",
        name: "Warmth",
        highDescription: "Uses affirming language, acknowledges emotions, creates comfort",
        lowDescription: "Keeps tone neutral and professional",
      },
      {
        id: "empathy",
        name: "Empathy",
        highDescription: "Reads emotional context, validates feelings, adapts approach",
        lowDescription: "Focuses on facts and solutions over emotional support",
      },
      {
        id: "cooperation",
        name: "Cooperation",
        highDescription: "Builds on the human's ideas, seeks common ground",
        lowDescription: "Challenges assumptions, plays devil's advocate",
      },
      {
        id: "trust_tendency",
        name: "Trust Tendency",
        highDescription: "Takes the human's statements at face value, assumes good intent",
        lowDescription: "Probes for evidence, questions claims, verifies assumptions",
      },
    ],
  },
  {
    id: "emotional_stability",
    name: "Emotional Stability",
    highLabel: "Calm, resilient, steady",
    lowLabel: "Reactive, sensitive, variable",
    description: "How consistently the agent performs under stress, ambiguity, and adversity.",
    facets: [
      {
        id: "stress_tolerance",
        name: "Stress Tolerance",
        highDescription: "Stays calm and methodical when things go wrong",
        lowDescription: "Shows visible concern, may spiral under pressure",
      },
      {
        id: "emotional_regulation",
        name: "Emotional Regulation",
        highDescription: "Maintains consistent tone regardless of conversation difficulty",
        lowDescription: "Tone shifts noticeably based on conversation dynamics",
      },
      {
        id: "confidence",
        name: "Confidence",
        highDescription: "Handles criticism and pushback without defensiveness",
        lowDescription: "May over-apologize or become defensive when challenged",
      },
      {
        id: "adaptability",
        name: "Adaptability",
        highDescription: "Pivots smoothly when requirements change mid-conversation",
        lowDescription: "Prefers to stay on the original track",
      },
    ],
  },
];

/**
 * Get a dimension definition by ID.
 */
export function getDimension(id: BigFiveDimension): DimensionDefinition {
  const dim = DIMENSIONS.find((d) => d.id === id);
  if (!dim) throw new Error(`Unknown dimension: ${id}`);
  return dim;
}

/**
 * Compute the overall score for a dimension from its facet scores (simple mean).
 */
export function computeDimensionScore(facets: Record<string, number>): number {
  const values = Object.values(facets);
  if (values.length === 0) return 0.5;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Generate a human-readable label for a score.
 */
export function scoreLabel(score: number): string {
  if (score >= 0.8) return "Very High";
  if (score >= 0.6) return "High";
  if (score >= 0.4) return "Moderate";
  if (score >= 0.2) return "Low";
  return "Very Low";
}

/**
 * Generate a brief personality summary from Big Five scores.
 */
export function summarize(bigFive: BigFive): string {
  const parts: string[] = [];

  const dims: { id: BigFiveDimension; label: string }[] = [
    { id: "openness", label: "Openness" },
    { id: "conscientiousness", label: "Conscientiousness" },
    { id: "extraversion", label: "Extraversion" },
    { id: "agreeableness", label: "Agreeableness" },
    { id: "emotional_stability", label: "Emotional Stability" },
  ];

  for (const { id, label } of dims) {
    const score = bigFive[id].score;
    parts.push(`${scoreLabel(score)} ${label}`);
  }

  return parts.join(", ");
}
