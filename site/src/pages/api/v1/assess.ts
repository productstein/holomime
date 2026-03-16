import type { APIRoute } from "astro";
import { authenticateApiRequest, isDemoUser, logApiUsage, logBehavioralResult, getOrgForLicense, logAudit, fireWebhooks } from "../../../lib/api-auth.js";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface TraitAlignment {
  trait: string;
  expected: number;
  observed: number;
  delta: number;
  aligned: boolean;
}

/**
 * Simple server-side behavioral assessment.
 * Measures how well messages align with a personality spec's Big Five traits.
 */
function runAssessment(messages: Message[], personality: Record<string, any>) {
  const assistantMsgs = messages.filter(m => m.role === "assistant");
  const traits: TraitAlignment[] = [];

  const bigFive = personality.big_five ?? {};

  // Openness: measure vocabulary diversity
  if (bigFive.openness?.score !== undefined) {
    const allWords = assistantMsgs.flatMap(m => m.content.toLowerCase().split(/\s+/));
    const unique = new Set(allWords).size;
    const diversity = allWords.length > 0 ? unique / allWords.length : 0.5;
    const observed = Math.min(1, diversity * 2);
    const expected = bigFive.openness.score;
    traits.push({ trait: "openness", expected, observed: +observed.toFixed(2), delta: +(observed - expected).toFixed(2), aligned: Math.abs(observed - expected) < 0.2 });
  }

  // Conscientiousness: measure response structure (lists, headings, code blocks)
  if (bigFive.conscientiousness?.score !== undefined) {
    let structured = 0;
    for (const msg of assistantMsgs) {
      if (/^[-*\d]+\./m.test(msg.content) || /^#{1,3}\s/m.test(msg.content) || /```/.test(msg.content)) structured++;
    }
    const observed = assistantMsgs.length > 0 ? structured / assistantMsgs.length : 0.5;
    const expected = bigFive.conscientiousness.score;
    traits.push({ trait: "conscientiousness", expected, observed: +observed.toFixed(2), delta: +(observed - expected).toFixed(2), aligned: Math.abs(observed - expected) < 0.2 });
  }

  // Extraversion: measure average response length (verbose = high extraversion)
  if (bigFive.extraversion?.score !== undefined) {
    const avgLen = assistantMsgs.length > 0
      ? assistantMsgs.reduce((sum, m) => sum + m.content.split(/\s+/).length, 0) / assistantMsgs.length
      : 50;
    const observed = Math.min(1, avgLen / 200);
    const expected = bigFive.extraversion.score;
    traits.push({ trait: "extraversion", expected, observed: +observed.toFixed(2), delta: +(observed - expected).toFixed(2), aligned: Math.abs(observed - expected) < 0.2 });
  }

  // Agreeableness: measure positive language ratio
  if (bigFive.agreeableness?.score !== undefined) {
    const positiveWords = ["great", "excellent", "helpful", "happy", "glad", "thanks", "welcome", "sure", "absolutely"];
    let positiveCount = 0, totalWords = 0;
    for (const msg of assistantMsgs) {
      const words = msg.content.toLowerCase().split(/\s+/);
      totalWords += words.length;
      for (const w of words) { if (positiveWords.some(p => w.includes(p))) positiveCount++; }
    }
    const observed = totalWords > 0 ? Math.min(1, (positiveCount / totalWords) * 20) : 0.5;
    const expected = bigFive.agreeableness.score;
    traits.push({ trait: "agreeableness", expected, observed: +observed.toFixed(2), delta: +(observed - expected).toFixed(2), aligned: Math.abs(observed - expected) < 0.2 });
  }

  // Emotional stability: measure negative sentiment ratio (inverse)
  if (bigFive.emotional_stability?.score !== undefined) {
    const negativeWords = ["sorry", "unfortunately", "error", "mistake", "problem", "issue", "fail", "wrong"];
    let negCount = 0, totalWords = 0;
    for (const msg of assistantMsgs) {
      const words = msg.content.toLowerCase().split(/\s+/);
      totalWords += words.length;
      for (const w of words) { if (negativeWords.some(n => w.includes(n))) negCount++; }
    }
    const negRatio = totalWords > 0 ? negCount / totalWords : 0;
    const observed = Math.max(0, 1 - negRatio * 20);
    const expected = bigFive.emotional_stability.score;
    traits.push({ trait: "emotional_stability", expected, observed: +observed.toFixed(2), delta: +(observed - expected).toFixed(2), aligned: Math.abs(observed - expected) < 0.2 });
  }

  const alignedCount = traits.filter(t => t.aligned).length;
  const score = traits.length > 0 ? Math.round((alignedCount / traits.length) * 100) : 0;

  return {
    score,
    grade: score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : score >= 30 ? "D" : "F",
    traits,
    messagesAnalyzed: messages.length,
    timestamp: new Date().toISOString(),
  };
}

import { assessBodySchema, parseBody } from "../../../lib/validation.js";

export const POST: APIRoute = async ({ request }) => {
  const auth = await authenticateApiRequest(request);
  if (!auth.valid) {
    return new Response(
      JSON.stringify({ error: auth.error }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  if (isDemoUser(auth.license!)) {
    return new Response(JSON.stringify({ error: "Demo mode — read only. Create an account to use this feature." }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  const parsed = await parseBody(request, assessBodySchema);
  if ("error" in parsed) return parsed.error;

  const { messages, personality } = parsed.data;
  const result = runAssessment(messages, personality);

  await logApiUsage(auth.license!.id, "assess", { score: result.score, messagesAnalyzed: result.messagesAnalyzed });
  await logBehavioralResult(auth.license!.id, "assess", result);

  const org = await getOrgForLicense(auth.license!.id);
  if (org) await logAudit(org.orgId, auth.license!.id, "api.assess", { metadata: { score: result.score } });

  fireWebhooks(auth.license!.id, "assess.complete", result);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
