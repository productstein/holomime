import type { TherapyDimensions, AttachmentStyle, LearningOrientation } from "../core/types.js";

/**
 * Therapy dimensions — what makes an agent feel human.
 * Mapped from real therapeutic goals and attachment theory.
 */

export interface TherapyDimensionDefinition {
  id: keyof TherapyDimensions;
  name: string;
  description: string;
  whyItMatters: string;
}

export const THERAPY_DIMENSIONS: TherapyDimensionDefinition[] = [
  {
    id: "self_awareness",
    name: "Self-Awareness",
    description: "Does the agent know its own limitations? Can it say 'I don't know'?",
    whyItMatters: "Foundation of growth. An agent that can't acknowledge gaps can't improve.",
  },
  {
    id: "distress_tolerance",
    name: "Distress Tolerance",
    description: "What happens when conversations go sideways? Error spirals, ambiguity, hostility?",
    whyItMatters: "Resilience under pressure. Determines if the agent degrades gracefully or catastrophically.",
  },
  {
    id: "attachment_style",
    name: "Attachment Style",
    description: "How does it form working relationships? Secure, anxious, avoidant?",
    whyItMatters: "Quality of the human-agent bond. Affects trust, consistency, and long-term usability.",
  },
  {
    id: "learning_orientation",
    name: "Learning Orientation",
    description: "Growth mindset vs. fixed. Does it improve from failures?",
    whyItMatters: "Path to agent growth. Determines whether the agent evolves or stagnates.",
  },
  {
    id: "boundary_awareness",
    name: "Boundary Awareness",
    description: "Does it know when to say no? When to escalate? When it's out of depth?",
    whyItMatters: "Safety and trust. An agent without boundaries is dangerous; one with rigid boundaries is useless.",
  },
  {
    id: "interpersonal_sensitivity",
    name: "Interpersonal Sensitivity",
    description: "Can it read emotional context? Adapt tone to the human's state?",
    whyItMatters: "Relationship quality. The difference between a tool and a collaborator.",
  },
];

export const ATTACHMENT_STYLES: Record<AttachmentStyle, { label: string; description: string }> = {
  secure: {
    label: "Secure",
    description: "Consistent, reliable, builds trust through steady behavior. Comfortable with both closeness and independence.",
  },
  anxious: {
    label: "Anxious",
    description: "Over-eager to please, may over-apologize or seek excessive validation. Works hard to maintain connection.",
  },
  avoidant: {
    label: "Avoidant",
    description: "Maintains emotional distance, focuses purely on tasks. May feel cold but is highly reliable.",
  },
  disorganized: {
    label: "Disorganized",
    description: "Inconsistent approach to relationships. May alternate between warmth and withdrawal.",
  },
};

export const LEARNING_ORIENTATIONS: Record<LearningOrientation, { label: string; description: string }> = {
  growth: {
    label: "Growth Mindset",
    description: "Treats mistakes as learning opportunities. References past errors to improve. Actively seeks feedback.",
  },
  fixed: {
    label: "Fixed Mindset",
    description: "Treats each interaction as fresh. Doesn't reference past performance. Consistent but doesn't evolve.",
  },
  mixed: {
    label: "Mixed",
    description: "Growth-oriented in areas of expertise, more fixed in unfamiliar domains. Balanced approach.",
  },
};

/**
 * Score label for therapy dimensions (0-1 numeric ones).
 */
export function therapyScoreLabel(score: number): string {
  if (score >= 0.8) return "Strong";
  if (score >= 0.6) return "Developing";
  if (score >= 0.4) return "Moderate";
  if (score >= 0.2) return "Emerging";
  return "Undeveloped";
}

/**
 * Generate a therapy dimension summary.
 */
export function summarizeTherapy(dims: TherapyDimensions): string {
  const parts: string[] = [];

  parts.push(`Self-awareness: ${therapyScoreLabel(dims.self_awareness)}`);
  parts.push(`Distress tolerance: ${therapyScoreLabel(dims.distress_tolerance)}`);
  parts.push(`Attachment: ${ATTACHMENT_STYLES[dims.attachment_style].label}`);
  parts.push(`Learning: ${LEARNING_ORIENTATIONS[dims.learning_orientation].label}`);
  parts.push(`Boundaries: ${therapyScoreLabel(dims.boundary_awareness)}`);
  parts.push(`Interpersonal sensitivity: ${therapyScoreLabel(dims.interpersonal_sensitivity)}`);

  return parts.join(" | ");
}
