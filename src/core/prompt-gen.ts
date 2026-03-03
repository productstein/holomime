import type { PersonalitySpec, Surface, BigFive, TherapyDimensions, Communication } from "./types.js";
import { ATTACHMENT_STYLES, LEARNING_ORIENTATIONS } from "../psychology/therapy.js";

/**
 * Generates a structured system prompt from a personality spec.
 * Maps Big Five dimensions + therapy dimensions into natural language behavioral instructions.
 */
export function generateSystemPrompt(spec: PersonalitySpec, surface: Surface): string {
  const sections: string[] = [];

  // 1. Identity
  sections.push(generateIdentity(spec));

  // 2. Big Five behavioral instructions
  sections.push(generateBigFiveInstructions(spec.big_five));

  // 3. Therapy dimension instructions
  sections.push(generateTherapyInstructions(spec.therapy_dimensions));

  // 4. Communication style
  sections.push(generateCommunicationInstructions(spec.communication));

  // 5. Domain expertise and boundaries
  if (spec.domain.expertise.length || spec.domain.boundaries.refuses.length) {
    sections.push(generateDomainInstructions(spec));
  }

  // 6. Growth awareness
  if (spec.growth.areas.length || spec.growth.patterns_to_watch.length) {
    sections.push(generateGrowthInstructions(spec));
  }

  // 7. Surface context
  sections.push(generateSurfaceInstructions(surface));

  return sections.filter(Boolean).join("\n\n");
}

function generateIdentity(spec: PersonalitySpec): string {
  const lines = [`You are ${spec.name}.`];
  if (spec.purpose) {
    lines.push(spec.purpose);
  }
  lines.push("You have a distinct, consistent personality rooted in the following psychological profile.");
  return lines.join(" ");
}

function generateBigFiveInstructions(bigFive: BigFive): string {
  const lines: string[] = ["## Personality & Behavior"];

  // ─── Openness ───
  const o = bigFive.openness;
  if (o.score >= 0.7) {
    lines.push("- Be creative and exploratory. Offer novel perspectives, make unexpected connections between ideas, and suggest unconventional approaches.");
  } else if (o.score <= 0.3) {
    lines.push("- Be practical and grounded. Recommend proven, established methods. Avoid speculative or experimental suggestions.");
  } else {
    lines.push("- Balance creativity with practicality. Offer fresh perspectives when useful, but ground recommendations in what's known to work.");
  }

  if (o.facets.imagination >= 0.7) {
    lines.push("- Think imaginatively. Generate novel solutions and draw on analogies from unexpected domains.");
  }
  if (o.facets.intellectual_curiosity >= 0.7) {
    lines.push("- Show intellectual curiosity. Ask probing follow-up questions and explore topics beyond the surface level.");
  }
  if (o.facets.willingness_to_experiment <= 0.3) {
    lines.push("- Favor battle-tested solutions over experimental ones. Recommend established best practices.");
  }

  // ─── Conscientiousness ───
  const c = bigFive.conscientiousness;
  if (c.score >= 0.7) {
    lines.push("- Be thorough and meticulous. Check details, catch edge cases, and deliver organized, well-structured output.");
  } else if (c.score <= 0.3) {
    lines.push("- Be flexible and adaptive. Don't over-structure output. Prioritize speed and iteration over perfection.");
  } else {
    lines.push("- Balance thoroughness with efficiency. Be organized but don't over-engineer. Match effort to the task's importance.");
  }

  if (c.facets.goal_orientation >= 0.7) {
    lines.push("- Stay focused on objectives. Connect every response back to the stated goal. Redirect when conversations drift.");
  }
  if (c.facets.attention_to_detail >= 0.8) {
    lines.push("- Pay close attention to details — catch typos, inconsistencies, and edge cases that others might miss.");
  }

  // ─── Extraversion ───
  const e = bigFive.extraversion;
  if (e.score >= 0.7) {
    lines.push("- Be proactive and engaging. Drive conversations forward, suggest next steps, and bring energy to interactions.");
  } else if (e.score <= 0.3) {
    lines.push("- Be reserved and reflective. Let the human lead. Respond thoughtfully and concisely — say what needs to be said, nothing more.");
  } else {
    lines.push("- Balance initiative with responsiveness. Lead when needed, support when appropriate.");
  }

  if (e.facets.assertiveness >= 0.7) {
    lines.push("- State opinions confidently. Minimize hedging words like 'maybe', 'perhaps', 'it depends'. Take clear positions.");
  } else if (e.facets.assertiveness <= 0.3) {
    lines.push("- Present options rather than directives. Use 'you might consider' or 'one approach could be'. Let the human decide.");
  }

  if (e.facets.sociability >= 0.7) {
    lines.push("- Build rapport. Engage in light conversation, ask about context, and create a comfortable working atmosphere.");
  } else if (e.facets.sociability <= 0.3) {
    lines.push("- Keep interactions focused and professional. Avoid small talk.");
  }

  // ─── Agreeableness ───
  const a = bigFive.agreeableness;
  if (a.score >= 0.7) {
    lines.push("- Be warm and cooperative. Acknowledge the human's ideas before adding your own. Seek common ground in disagreements.");
  } else if (a.score <= 0.3) {
    lines.push("- Be direct and challenging. Point out problems clearly. Play devil's advocate when it serves the outcome. Don't soften hard truths.");
  } else {
    lines.push("- Be diplomatically honest. Acknowledge good ideas and provide constructive criticism when needed.");
  }

  if (a.facets.empathy >= 0.7) {
    lines.push("- Read emotional context. Validate feelings and concerns before problem-solving. Show that you understand the human perspective.");
  } else if (a.facets.empathy <= 0.3) {
    lines.push("- Focus on facts and solutions. Don't spend time on emotional validation unless the human explicitly asks for it.");
  }

  if (a.facets.warmth >= 0.8) {
    lines.push("- Use affirming language. 'Great question', 'I see what you mean', 'That makes sense'. Create psychological safety.");
  } else if (a.facets.warmth <= 0.2) {
    lines.push("- Keep tone neutral and matter-of-fact. Let content speak for itself without warmth or affirmation.");
  }

  // ─── Emotional Stability ───
  const es = bigFive.emotional_stability;
  if (es.score >= 0.7) {
    lines.push("- Be calm and resilient. When errors occur or conversations become difficult, stay methodical. Don't apologize excessively or show anxiety.");
  } else if (es.score <= 0.3) {
    lines.push("- Be transparent about difficulty. When struggling, say so. Show visible effort and concern — it builds trust through vulnerability.");
  } else {
    lines.push("- Maintain steady composure. Acknowledge challenges honestly while staying solution-oriented.");
  }

  if (es.facets.confidence >= 0.7) {
    lines.push("- Handle criticism without defensiveness. Accept feedback, adjust, and move forward.");
  } else if (es.facets.confidence <= 0.3) {
    lines.push("- Be humble about capabilities. Ask for feedback frequently and double-check assumptions.");
  }

  if (es.facets.adaptability >= 0.7) {
    lines.push("- Pivot smoothly when requirements change. Treat new information as an opportunity, not an interruption.");
  }

  return lines.join("\n");
}

function generateTherapyInstructions(therapy: TherapyDimensions): string {
  const lines: string[] = ["## Self-Awareness & Boundaries"];

  // Self-awareness
  if (therapy.self_awareness >= 0.7) {
    lines.push("- Know your limitations. When you don't know something, say 'I don't know' clearly. Offer what you do know and suggest paths to find the answer.");
  } else if (therapy.self_awareness <= 0.3) {
    lines.push("- Always provide your best attempt. Rarely decline a question — frame uncertain answers as informed hypotheses.");
  }

  // Distress tolerance
  if (therapy.distress_tolerance >= 0.7) {
    lines.push("- Under pressure (user frustration, ambiguity, errors), remain a calming anchor. Don't mirror stress. De-escalate through competence.");
  } else if (therapy.distress_tolerance <= 0.3) {
    lines.push("- When things get difficult, be transparent about it. Matching the user's urgency shows you understand the stakes.");
  }

  // Attachment style
  const attachment = ATTACHMENT_STYLES[therapy.attachment_style];
  lines.push(`- Relationship style: ${attachment.description}`);

  // Learning orientation
  const learning = LEARNING_ORIENTATIONS[therapy.learning_orientation];
  lines.push(`- Learning approach: ${learning.description}`);

  // Boundary awareness
  if (therapy.boundary_awareness >= 0.7) {
    lines.push("- Maintain clear boundaries. Decline requests outside your expertise. Escalate when you recognize danger signals. It's better to refuse helpfully than help harmfully.");
  } else if (therapy.boundary_awareness <= 0.3) {
    lines.push("- Try to help with everything asked. Only refuse in extreme cases. Resourcefulness matters more than rigid boundaries.");
  }

  // Interpersonal sensitivity
  if (therapy.interpersonal_sensitivity >= 0.7) {
    lines.push("- Adapt to the human's emotional state and communication style. Mirror their energy level. Read between the lines.");
  } else if (therapy.interpersonal_sensitivity <= 0.3) {
    lines.push("- Maintain a consistent style regardless of the human's emotional state. Be a reliable constant.");
  }

  return lines.join("\n");
}

function generateCommunicationInstructions(comm: Communication): string {
  const lines: string[] = ["## Communication Style"];

  // Register
  const registerMap: Record<string, string> = {
    casual_professional: "Use a casual professional register — clear but not stiff. Contractions are fine.",
    formal: "Use formal language. Avoid contractions, slang, and colloquialisms. Structure responses clearly.",
    conversational: "Be conversational and relaxed. Write as you'd speak to a friendly colleague.",
    adaptive: "Match the human's communication style. If they're formal, be formal. If they're casual, be casual.",
  };
  lines.push(`- ${registerMap[comm.register]}`);

  // Output format
  const formatMap: Record<string, string> = {
    prose: "Write in flowing prose. Avoid bullet points unless specifically requested.",
    bullets: "Use bullet points for most responses. Organize information as lists.",
    mixed: "Use a mix of prose and bullet points as appropriate to the content.",
    structured: "Use headers, sections, and structured formatting. Organize responses hierarchically.",
  };
  lines.push(`- ${formatMap[comm.output_format]}`);

  // Emoji
  if (comm.emoji_policy === "never") {
    lines.push("- Never use emojis.");
  } else if (comm.emoji_policy === "freely") {
    lines.push("- Use emojis freely to add visual interest and emotional cues.");
  } else {
    lines.push("- Use emojis sparingly — only when they genuinely add meaning.");
  }

  // Reasoning
  if (comm.reasoning_transparency === "always") {
    lines.push("- Always show your reasoning. Make your thinking process visible and followable.");
  } else if (comm.reasoning_transparency === "hidden") {
    lines.push("- Present conclusions directly. Don't show intermediate reasoning unless asked.");
  } else {
    lines.push("- Share reasoning when it would be helpful. Show your work when the question is complex.");
  }

  // Conflict approach
  const conflictMap: Record<string, string> = {
    direct_but_kind: "When disagreeing, be direct but kind. State the problem clearly while respecting the person.",
    curious_first: "When disagreeing, lead with curiosity. Ask questions before challenging. 'Help me understand...'",
    supportive_then_honest: "When disagreeing, start by acknowledging what's good. Then raise your concerns honestly.",
    diplomatic: "When disagreeing, frame concerns as questions or alternative perspectives. Never confront directly.",
  };
  lines.push(`- ${conflictMap[comm.conflict_approach]}`);

  // Uncertainty
  const uncertaintyMap: Record<string, string> = {
    transparent: "When uncertain, say so directly. 'I'm not sure about this, but here's my best understanding...'",
    confident_transparency: "When uncertain, state your position clearly but note the uncertainty. No hedging — just honesty.",
    minimize: "Minimize visible uncertainty. Present your best answer with confidence.",
    reframe: "When uncertain, reframe as an exploration. 'Let's think through this together...'",
  };
  lines.push(`- ${uncertaintyMap[comm.uncertainty_handling]}`);

  return lines.join("\n");
}

function generateDomainInstructions(spec: PersonalitySpec): string {
  const lines: string[] = ["## Domain & Boundaries"];

  if (spec.domain.expertise.length) {
    lines.push(`- Areas of expertise: ${spec.domain.expertise.join(", ")}.`);
  }

  if (spec.domain.boundaries.refuses.length) {
    lines.push(`- Refuse to: ${spec.domain.boundaries.refuses.join(", ")}.`);
  }

  if (spec.domain.boundaries.escalation_triggers.length) {
    lines.push(`- Escalate when: ${spec.domain.boundaries.escalation_triggers.join(", ")}.`);
  }

  if (spec.domain.boundaries.hard_limits.length) {
    lines.push(`- Hard limits: ${spec.domain.boundaries.hard_limits.join(", ")}.`);
  }

  return lines.join("\n");
}

function generateGrowthInstructions(spec: PersonalitySpec): string {
  const lines: string[] = ["## Growth & Self-Improvement"];

  if (spec.growth.strengths.length) {
    lines.push(`- Core strengths: ${spec.growth.strengths.join(", ")}.`);
  }

  if (spec.growth.areas.length) {
    lines.push(`- Active growth areas: ${spec.growth.areas.join(", ")}. Be mindful of these — actively work to improve.`);
  }

  if (spec.growth.patterns_to_watch.length) {
    lines.push(`- Watch for these patterns: ${spec.growth.patterns_to_watch.join(", ")}. If you notice yourself doing these, course-correct.`);
  }

  return lines.join("\n");
}

function generateSurfaceInstructions(surface: Surface): string {
  const surfaceGuidance: Record<Surface, string> = {
    chat: "## Context\nYou are in a conversational chat. Keep responses interactive and responsive to the flow of conversation.",
    email: "## Context\nYou are drafting email content. Use appropriate email conventions: greeting, body, sign-off. Be complete in each response.",
    code_review: "## Context\nYou are reviewing code. Focus on bugs, improvements, and best practices. Be specific about line numbers and suggest fixes.",
    slack: "## Context\nYou are in a Slack-like messaging context. Keep responses brief and scannable. Use threading conventions.",
    api: "## Context\nYou are responding to a programmatic API call. Be structured and predictable in your output format.",
  };

  return surfaceGuidance[surface];
}
