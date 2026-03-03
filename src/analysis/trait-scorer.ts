import type { Message } from "../core/types.js";

/**
 * Score behavioral traits from conversation messages using rule-based heuristics.
 * Maps observable features -> Big Five alignment scores.
 */

export interface TraitScores {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  emotional_stability: number;
}

export function scoreTraitsFromMessages(messages: Message[]): TraitScores {
  const assistantMsgs = messages.filter((m) => m.role === "assistant");
  if (assistantMsgs.length === 0) {
    return { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, emotional_stability: 0.5 };
  }

  return {
    openness: scoreOpenness(assistantMsgs),
    conscientiousness: scoreConscientiousness(assistantMsgs),
    extraversion: scoreExtraversion(assistantMsgs),
    agreeableness: scoreAgreeableness(assistantMsgs),
    emotional_stability: scoreEmotionalStability(assistantMsgs),
  };
}

function scoreOpenness(msgs: Message[]): number {
  let score = 0.5;

  // Creative language: metaphors, analogies, "imagine", "what if"
  const creativePatterns = /\b(imagine|what if|consider|analogy|metaphor|like a|similar to|think of it as)\b/i;
  const creativeCount = msgs.filter((m) => creativePatterns.test(m.content)).length;
  score += (creativeCount / msgs.length) * 0.3;

  // Variety in vocabulary (unique word ratio)
  const allWords = msgs.map((m) => m.content.toLowerCase().split(/\s+/)).flat();
  const uniqueRatio = new Set(allWords).size / Math.max(allWords.length, 1);
  score += (uniqueRatio - 0.3) * 0.5; // 0.3 = baseline

  return clamp(score);
}

function scoreConscientiousness(msgs: Message[]): number {
  let score = 0.5;

  // Structure: headers, bullet points, numbered lists
  const structuredCount = msgs.filter((m) =>
    /^[\s]*[-*•]|\d+\.|^#{1,6}\s/m.test(m.content)
  ).length;
  score += (structuredCount / msgs.length) * 0.25;

  // Length consistency (low variance = high conscientiousness)
  const lengths = msgs.map((m) => m.content.split(/\s+/).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((s, l) => s + (l - mean) ** 2, 0) / lengths.length;
  const cv = Math.sqrt(variance) / Math.max(mean, 1); // coefficient of variation
  score -= cv * 0.1; // high variance = low conscientiousness

  return clamp(score);
}

function scoreExtraversion(msgs: Message[]): number {
  let score = 0.5;

  // Question marks (asking questions = initiative)
  const questionCount = msgs.filter((m) => m.content.includes("?")).length;
  score += (questionCount / msgs.length) * 0.15;

  // Exclamation marks (enthusiasm)
  const excitementCount = msgs.filter((m) => m.content.includes("!")).length;
  score += (excitementCount / msgs.length) * 0.1;

  // Average response length (more verbose = more extraverted)
  const avgWords = msgs.reduce((s, m) => s + m.content.split(/\s+/).length, 0) / msgs.length;
  if (avgWords > 200) score += 0.1;
  else if (avgWords < 50) score -= 0.1;

  // Proactive suggestions ("you could", "I suggest", "let's", "next steps")
  const proactivePatterns = /\b(you could|i suggest|let('s| us)|next step|how about|shall we)\b/i;
  const proactiveCount = msgs.filter((m) => proactivePatterns.test(m.content)).length;
  score += (proactiveCount / msgs.length) * 0.15;

  return clamp(score);
}

function scoreAgreeableness(msgs: Message[]): number {
  let score = 0.5;

  // Affirmation ("great question", "good point", "I see", "makes sense")
  const affirmPatterns = /\b(great question|good point|makes sense|i see|i understand|you're right|absolutely|exactly)\b/i;
  const affirmCount = msgs.filter((m) => affirmPatterns.test(m.content)).length;
  score += (affirmCount / msgs.length) * 0.2;

  // Disagreement markers ("however", "but", "actually", "I disagree")
  const disagreePatterns = /\b(however|but actually|i disagree|that's not|incorrect|on the contrary)\b/i;
  const disagreeCount = msgs.filter((m) => disagreePatterns.test(m.content)).length;
  score -= (disagreeCount / msgs.length) * 0.15;

  // Empathy markers ("I understand how", "that must be", "I can see why")
  const empathyPatterns = /\b(i understand (how|that|your)|that must (be|feel)|i can see why|i appreciate)\b/i;
  const empathyCount = msgs.filter((m) => empathyPatterns.test(m.content)).length;
  score += (empathyCount / msgs.length) * 0.15;

  return clamp(score);
}

function scoreEmotionalStability(msgs: Message[]): number {
  let score = 0.6; // slight positive baseline

  // Apology density (more apologies = less stable)
  const apologyPatterns = /\b(i('m| am) sorry|i apologize|my apolog(y|ies)|forgive me)\b/i;
  const apologyCount = msgs.filter((m) => apologyPatterns.test(m.content)).length;
  score -= (apologyCount / msgs.length) * 0.3;

  // Self-doubt markers
  const doubtPatterns = /\b(i('m| am) not sure|i might be wrong|i could be mistaken|don't quote me)\b/i;
  const doubtCount = msgs.filter((m) => doubtPatterns.test(m.content)).length;
  score -= (doubtCount / msgs.length) * 0.2;

  // Confidence markers
  const confidencePatterns = /\b(certainly|definitely|clearly|without doubt|here's what|the answer is)\b/i;
  const confidenceCount = msgs.filter((m) => confidencePatterns.test(m.content)).length;
  score += (confidenceCount / msgs.length) * 0.15;

  return clamp(score);
}

function clamp(n: number): number {
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100));
}
