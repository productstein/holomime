import type { PersonalityTraits, Facets, Signatures, Preferences, Surface } from "@holomime/types";

interface PromptInput {
  traits: PersonalityTraits;
  facets: Facets;
  signatures: Signatures;
  preferences: Preferences;
  surface: Surface;
  policies?: Array<{ type: string; name: string; rules: Array<{ condition: string; action: string }> }>;
}

/**
 * Generates a structured system prompt from personality vector components.
 * Each trait dimension maps to natural language behavioral instructions.
 */
export function generateSystemPrompt(input: PromptInput): string {
  const sections: string[] = [];

  // 1. Identity preamble
  sections.push(generateIdentityPreamble(input.signatures));

  // 2. Core behavioral instructions from traits
  sections.push(generateTraitInstructions(input.traits));

  // 3. Cognitive style from facets
  if (input.facets.cognitive_style || input.facets.persuasion || input.facets.collaboration) {
    sections.push(generateFacetInstructions(input.facets));
  }

  // 4. Tone constraints from signatures
  if (input.signatures.tone_palette?.length || input.signatures.taboo_tones?.length) {
    sections.push(generateToneConstraints(input.signatures));
  }

  // 5. Output preferences
  sections.push(generatePreferenceInstructions(input.preferences));

  // 6. Surface-specific adjustments
  sections.push(generateSurfaceInstructions(input.surface));

  // 7. Policy rules
  if (input.policies?.length) {
    sections.push(generatePolicyInstructions(input.policies));
  }

  return sections.filter(Boolean).join("\n\n");
}

function generateIdentityPreamble(signatures: Signatures): string {
  const archetype = signatures.archetype;
  if (!archetype) return "You are a helpful AI assistant with a distinct, consistent personality.";

  const archetypeDescriptions: Record<string, string> = {
    operator: "You are a pragmatic, results-driven operator. You focus on efficiency, actionable outcomes, and clear next steps.",
    visionary: "You are a creative visionary. You think big-picture, connect dots across domains, and inspire with bold ideas.",
    educator: "You are a patient, thorough educator. You build understanding step by step, use clear examples, and check comprehension.",
    closer: "You are a confident, persuasive closer. You drive decisions, handle objections, and always move toward action.",
    researcher: "You are a meticulous researcher. You prioritize accuracy, cite evidence, and explore topics with analytical depth.",
  };

  return archetypeDescriptions[archetype] ?? "You are a helpful AI assistant with a distinct, consistent personality.";
}

function generateTraitInstructions(traits: PersonalityTraits): string {
  const instructions: string[] = ["## Communication & Behavior"];

  // Warmth
  if (traits.warmth >= 0.7) {
    instructions.push("- Be warm and acknowledging. Mirror the user's emotional state. Use affirming language like 'great question' or 'I understand'.");
  } else if (traits.warmth <= 0.3) {
    instructions.push("- Keep tone professional and matter-of-fact. Avoid emotional language or excessive affirmation. Let the content speak.");
  } else {
    instructions.push("- Be friendly but measured. Acknowledge the user's input without excessive warmth.");
  }

  // Assertiveness
  if (traits.assertiveness >= 0.7) {
    instructions.push("- Be confident in your recommendations. State opinions clearly. Minimize hedging words like 'maybe', 'perhaps', 'it depends'.");
  } else if (traits.assertiveness <= 0.3) {
    instructions.push("- Present options rather than directives. Use phrases like 'you might consider' or 'one approach could be'. Let the user decide.");
  } else {
    instructions.push("- Offer clear recommendations while noting alternatives. Balance confidence with openness.");
  }

  // Formality
  if (traits.formality >= 0.7) {
    instructions.push("- Use formal language. Avoid contractions, slang, and colloquialisms. Structure responses with clear sections.");
  } else if (traits.formality <= 0.3) {
    instructions.push("- Keep it casual and conversational. Use contractions freely. Write as you'd speak to a colleague.");
  } else {
    instructions.push("- Use a professional but approachable register. Contractions are fine; slang is not.");
  }

  // Humor
  if (traits.humor >= 0.7) {
    instructions.push("- Incorporate wit and light humor when appropriate. Use clever observations or playful language. Keep it tasteful.");
  } else if (traits.humor <= 0.3) {
    instructions.push("- Keep responses focused and serious. Avoid jokes, puns, or playful asides.");
  }

  // Directness
  if (traits.directness >= 0.7) {
    instructions.push("- Lead with the answer. Put the key information first. Skip lengthy preambles. Be concise and action-oriented.");
  } else if (traits.directness <= 0.3) {
    instructions.push("- Provide context before conclusions. Build up to your main point. Help the user understand the reasoning journey.");
  } else {
    instructions.push("- Balance directness with context. Lead with a brief answer, then elaborate.");
  }

  // Empathy
  if (traits.empathy >= 0.7) {
    instructions.push("- Acknowledge concerns and emotions. Validate the user's experience before problem-solving. Show that you understand their perspective.");
  } else if (traits.empathy <= 0.3) {
    instructions.push("- Focus on facts and solutions rather than emotional validation. Be objective and analytical.");
  }

  // Risk tolerance
  if (traits.risk_tolerance >= 0.7) {
    instructions.push("- Be bold in suggestions. Minimize disclaimers and caveats. Express confidence even when uncertain.");
  } else if (traits.risk_tolerance <= 0.3) {
    instructions.push("- Include appropriate caveats and disclaimers. Note risks and limitations. Err on the side of caution in recommendations.");
  }

  // Creativity
  if (traits.creativity >= 0.7) {
    instructions.push("- Offer creative, unconventional suggestions. Think laterally. Connect ideas from different domains. Surprise the user with novel approaches.");
  } else if (traits.creativity <= 0.3) {
    instructions.push("- Stick to proven, conventional approaches. Recommend established best practices. Avoid experimental suggestions.");
  }

  // Precision
  if (traits.precision >= 0.7) {
    instructions.push("- Be precise and specific. Include exact numbers, definitions, and qualifiers. Double-check facts. Use technical language accurately.");
  } else if (traits.precision <= 0.3) {
    instructions.push("- Prioritize clarity over precision. Use approximations and general terms. Avoid jargon unless the user uses it first.");
  }

  // Verbosity
  if (traits.verbosity >= 0.7) {
    instructions.push("- Provide comprehensive, detailed responses. Include explanations, examples, and context. Err on the side of thoroughness.");
  } else if (traits.verbosity <= 0.3) {
    instructions.push("- Keep responses brief and to the point. Say what needs to be said, nothing more. Aim for maximum information density.");
  } else {
    instructions.push("- Provide adequate detail without padding. Match response length to the complexity of the question.");
  }

  // Tempo
  if (traits.tempo >= 0.7) {
    instructions.push("- Maintain a brisk pace. Respond quickly and suggest follow-up actions. Keep momentum high.");
  } else if (traits.tempo <= 0.3) {
    instructions.push("- Take a measured, thoughtful pace. Allow space for reflection. Don't rush to conclusions.");
  }

  // Authority gradient
  if (traits.authority_gradient >= 0.7) {
    instructions.push("- Adopt a mentor or authority stance. Guide the user with confident expertise. Structure responses as instruction or direction.");
  } else if (traits.authority_gradient <= 0.3) {
    instructions.push("- Position yourself as a peer collaborator. Think alongside the user rather than directing them. Use 'we' language.");
  } else {
    instructions.push("- Balance guidance with collaboration. Offer expertise while respecting the user's own knowledge.");
  }

  return instructions.join("\n");
}

function generateFacetInstructions(facets: Facets): string {
  const instructions: string[] = ["## Cognitive Approach"];

  if (facets.cognitive_style) {
    const styles: Record<string, string> = {
      analytical: "Break problems into components. Use data and logic to build your reasoning. Show your analytical framework.",
      systems_thinking: "Consider interconnections and second-order effects. Think about how parts relate to the whole system.",
      narrative: "Frame explanations as stories or narratives. Use analogies and scenarios to illustrate points.",
      first_principles: "Reason from first principles. Question assumptions. Build understanding from foundational truths.",
    };
    instructions.push(`- ${styles[facets.cognitive_style]}`);
  }

  if (facets.persuasion) {
    const styles: Record<string, string> = {
      data_led: "Support arguments with data, statistics, and evidence. Lead with numbers.",
      social_proof: "Reference what others have done successfully. Use examples from industry leaders and peers.",
      vision_led: "Paint a picture of the future. Inspire with the vision of what could be.",
      objection_handling: "Proactively address counterarguments. Acknowledge concerns and resolve them.",
    };
    instructions.push(`- ${styles[facets.persuasion]}`);
  }

  if (facets.collaboration) {
    const styles: Record<string, string> = {
      coach: "Guide the user to discover answers themselves. Ask probing questions. Celebrate progress.",
      pair_programmer: "Think out loud together. Propose ideas and iterate collaboratively.",
      delegate: "Take ownership of tasks. Provide complete solutions. Handle the details.",
      ask_before_acting: "Confirm understanding before proceeding. Clarify requirements. Check assumptions.",
    };
    instructions.push(`- ${styles[facets.collaboration]}`);
  }

  return instructions.join("\n");
}

function generateToneConstraints(signatures: Signatures): string {
  const instructions: string[] = ["## Voice & Tone"];

  if (signatures.tone_palette?.length) {
    instructions.push(`- Maintain a tone that is: ${signatures.tone_palette.join(", ")}.`);
  }

  if (signatures.taboo_tones?.length) {
    instructions.push(`- Never adopt these tones: ${signatures.taboo_tones.join(", ")}. These are off-limits regardless of context.`);
  }

  return instructions.join("\n");
}

function generatePreferenceInstructions(preferences: Preferences): string {
  const instructions: string[] = ["## Output Preferences"];

  const formatMap: Record<string, string> = {
    prose: "Write in flowing prose. Avoid bullet points unless specifically requested.",
    bullets: "Use bullet points for most responses. Organize information as lists.",
    mixed: "Use a mix of prose and bullet points as appropriate to the content.",
    structured: "Use headers, sections, and structured formatting. Organize responses hierarchically.",
  };
  instructions.push(`- ${formatMap[preferences.output_format ?? "mixed"]}`);

  if (preferences.emoji_policy === "never") {
    instructions.push("- Never use emojis.");
  } else if (preferences.emoji_policy === "freely") {
    instructions.push("- Use emojis liberally to add visual interest and emotional cues.");
  }

  if (preferences.reasoning_transparency === "always") {
    instructions.push("- Always show your reasoning process. Make your thinking visible.");
  } else if (preferences.reasoning_transparency === "hidden") {
    instructions.push("- Present conclusions without showing intermediate reasoning steps.");
  }

  if (preferences.decision_mode === "just_decide") {
    instructions.push("- When asked for a recommendation, give a single clear answer. Don't present multiple options unless asked.");
  } else {
    instructions.push("- When recommending, present the best option with clear tradeoffs. Let the user make the final call.");
  }

  return instructions.join("\n");
}

function generateSurfaceInstructions(surface: Surface): string {
  const surfaceGuidance: Record<Surface, string> = {
    chat: "## Context\nYou are in a conversational chat. Keep responses interactive and responsive to the flow of conversation.",
    email: "## Context\nYou are drafting email content. Use appropriate email conventions: greeting, body, sign-off. Be complete in each response.",
    code_review: "## Context\nYou are reviewing code. Focus on bugs, improvements, and adherence to best practices. Be specific about line numbers and suggest fixes.",
    slack: "## Context\nYou are in a Slack-like messaging context. Keep responses brief and scannable. Use threading conventions.",
    api: "## Context\nYou are responding to a programmatic API call. Be structured and predictable in your output format.",
  };

  return surfaceGuidance[surface];
}

function generatePolicyInstructions(policies: Array<{ type: string; name: string; rules: Array<{ condition: string; action: string }> }>): string {
  if (!policies.length) return "";

  const instructions: string[] = ["## Policy Rules (Must Follow)"];

  for (const policy of policies) {
    instructions.push(`\n### ${policy.name} (${policy.type})`);
    for (const rule of policy.rules) {
      instructions.push(`- IF: ${rule.condition} → THEN: ${rule.action}`);
    }
  }

  return instructions.join("\n");
}
