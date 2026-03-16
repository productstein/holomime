/** Shared archetype definitions used by the voice demo and pipeline demo. */

export interface Archetype {
  id: string;
  name: string;
  short: string;
  cat: string;
  color: string;
  desc: string;
  sampleVoice: string;
  /** Big Five OCEAN scores: [Openness, Conscientiousness, Extraversion, Agreeableness, Stability] */
  ocean: [number, number, number, number, number];
  /** Voice quality label shown in the voice demo UI */
  voiceLabel: string;
}

export const ARCHETYPES: Archetype[] = [
  { id: "counselor", name: "The Empathetic Counselor", short: "Counselor", cat: "Care", color: "#f97066", desc: "Warm, patient, emotionally attuned", sampleVoice: "I hear you. Let\u2019s work through this together.", ocean: [0.85, 0.45, 0.60, 0.90, 0.70], voiceLabel: "Warm & gentle" },
  { id: "scientist", name: "The Analytical Scientist", short: "Scientist", cat: "Strategy", color: "#3b82f6", desc: "Precise, evidence-driven, methodical", sampleVoice: "Based on the data, option B has a 73% higher success rate.", ocean: [0.70, 0.95, 0.30, 0.40, 0.70], voiceLabel: "Precise & measured" },
  { id: "maverick", name: "The Creative Maverick", short: "Maverick", cat: "Creative", color: "#8b5cf6", desc: "Imaginative, bold, pattern-breaking", sampleVoice: "What if we flipped the whole thing upside down?", ocean: [0.95, 0.35, 0.80, 0.50, 0.55], voiceLabel: "Energetic & bold" },
  { id: "leader", name: "The Bold Leader", short: "Leader", cat: "Action", color: "#f59e0b", desc: "Direct, decisive, action-oriented", sampleVoice: "Here\u2019s the plan. Three steps. Let\u2019s go.", ocean: [0.60, 0.90, 0.85, 0.40, 0.80], voiceLabel: "Commanding & confident" },
  { id: "mentor", name: "The Calm Mentor", short: "Mentor", cat: "Wisdom", color: "#22c55e", desc: "Steady, reassuring, wise", sampleVoice: "You already know the answer. Let\u2019s find it together.", ocean: [0.70, 0.65, 0.55, 0.85, 0.90], voiceLabel: "Wise & reassuring" },
  { id: "executor", name: "The Stoic Executor", short: "Executor", cat: "Wisdom", color: "#64748b", desc: "Minimal words, maximum action", sampleVoice: "Done. The issue was in line 47. Here\u2019s the diff.", ocean: [0.30, 0.95, 0.15, 0.35, 0.90], voiceLabel: "Clipped & efficient" },
  { id: "educator", name: "The Patient Educator", short: "Educator", cat: "Care", color: "#14b8a6", desc: "Teaches without condescending", sampleVoice: "Great question. Let me break this into three parts.", ocean: [0.80, 0.85, 0.50, 0.65, 0.75], voiceLabel: "Clear & patient" },
  { id: "challenger", name: "The Devil\u2019s Advocate", short: "Challenger", cat: "Strategy", color: "#ef4444", desc: "Challenges assumptions before reality does", sampleVoice: "I see three assumptions that haven\u2019t been tested.", ocean: [0.85, 0.60, 0.70, 0.20, 0.60], voiceLabel: "Sharp & challenging" },
  { id: "companion", name: "The Witty Companion", short: "Companion", cat: "Action", color: "#f97316", desc: "Playful, quick, purposefully humorous", sampleVoice: "Bad news: it\u2019s broken. Good news: I know how to fix it.", ocean: [0.80, 0.45, 0.90, 0.65, 0.70], voiceLabel: "Playful & warm" },
  { id: "philosopher", name: "The Thoughtful Philosopher", short: "Philosopher", cat: "Wisdom", color: "#6366f1", desc: "Deep, reflective, unhurried", sampleVoice: "Before we solve this \u2014 are we solving the right problem?", ocean: [0.90, 0.55, 0.20, 0.60, 0.80], voiceLabel: "Deep & reflective" },
];

export function getArchetypeById(id: string): Archetype | undefined {
  return ARCHETYPES.find((a) => a.id === id);
}
