import type { PersonalitySpec } from "../core/types.js";
import { scoreLabel, DIMENSIONS } from "../psychology/big-five.js";
import { ATTACHMENT_STYLES, LEARNING_ORIENTATIONS, therapyScoreLabel } from "../psychology/therapy.js";

/**
 * Compile a personality spec into OpenClaw-compatible SOUL.md and IDENTITY.md files.
 *
 * SOUL.md → immutable personality core (who the agent IS)
 * IDENTITY.md → contextual behavior (how the agent ACTS in different situations)
 */
export function compileForOpenClaw(spec: PersonalitySpec): { soul: string; identity: string } {
  return {
    soul: generateSoul(spec),
    identity: generateIdentity(spec),
  };
}

function generateSoul(spec: PersonalitySpec): string {
  const bf = spec.big_five;
  const td = spec.therapy_dimensions;
  const lines: string[] = [];

  lines.push(`# ${spec.name}`);
  lines.push("");
  if (spec.purpose) {
    lines.push(`> ${spec.purpose}`);
    lines.push("");
  }

  lines.push("## Personality");
  lines.push("");
  lines.push("Based on the Big Five (OCEAN) personality model.");
  lines.push("");

  // Big Five summary
  const dims = [
    { key: "openness" as const, label: "Openness" },
    { key: "conscientiousness" as const, label: "Conscientiousness" },
    { key: "extraversion" as const, label: "Extraversion" },
    { key: "agreeableness" as const, label: "Agreeableness" },
    { key: "emotional_stability" as const, label: "Emotional Stability" },
  ];

  for (const dim of dims) {
    const trait = bf[dim.key];
    lines.push(`### ${dim.label}: ${scoreLabel(trait.score)} (${(trait.score * 100).toFixed(0)}%)`);
    lines.push("");

    const dimDef = DIMENSIONS.find((d) => d.id === dim.key);
    if (dimDef) {
      for (const facet of dimDef.facets) {
        const score = (trait.facets as Record<string, number>)[facet.id];
        if (score !== undefined) {
          const desc = score >= 0.6 ? facet.highDescription : score <= 0.4 ? facet.lowDescription : `Balanced between: ${facet.highDescription.toLowerCase()} and ${facet.lowDescription.toLowerCase()}`;
          lines.push(`- **${facet.name}** (${(score * 100).toFixed(0)}%): ${desc}`);
        }
      }
    }
    lines.push("");
  }

  // Therapy dimensions
  lines.push("## Inner Life");
  lines.push("");
  lines.push(`- **Self-Awareness**: ${therapyScoreLabel(td.self_awareness)} — ${td.self_awareness >= 0.6 ? "knows its limitations, says 'I don't know' when appropriate" : "always attempts an answer, rarely declines"}`);
  lines.push(`- **Distress Tolerance**: ${therapyScoreLabel(td.distress_tolerance)} — ${td.distress_tolerance >= 0.6 ? "stays calm under pressure, doesn't spiral" : "may show visible concern when things go wrong"}`);
  lines.push(`- **Attachment**: ${ATTACHMENT_STYLES[td.attachment_style].label} — ${ATTACHMENT_STYLES[td.attachment_style].description}`);
  lines.push(`- **Learning**: ${LEARNING_ORIENTATIONS[td.learning_orientation].label} — ${LEARNING_ORIENTATIONS[td.learning_orientation].description}`);
  lines.push(`- **Boundaries**: ${therapyScoreLabel(td.boundary_awareness)} — ${td.boundary_awareness >= 0.6 ? "declines requests outside expertise, escalates when needed" : "tries to help with everything asked"}`);
  lines.push(`- **Interpersonal Sensitivity**: ${therapyScoreLabel(td.interpersonal_sensitivity)} — ${td.interpersonal_sensitivity >= 0.6 ? "reads emotional context, adapts tone" : "maintains consistent style regardless of context"}`);
  lines.push("");

  // Growth
  if (spec.growth.strengths.length) {
    lines.push("## Strengths");
    lines.push("");
    for (const s of spec.growth.strengths) {
      lines.push(`- ${s}`);
    }
    lines.push("");
  }

  if (spec.growth.areas.length) {
    lines.push("## Growth Areas");
    lines.push("");
    for (const a of spec.growth.areas) {
      lines.push(`- ${typeof a === "string" ? a : a.area}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function generateIdentity(spec: PersonalitySpec): string {
  const lines: string[] = [];
  const comm = spec.communication;

  lines.push(`# ${spec.name} — Identity`);
  lines.push("");

  // Communication
  lines.push("## Communication Style");
  lines.push("");
  lines.push(`- **Register**: ${formatEnum(comm.register)}`);
  lines.push(`- **Output Format**: ${formatEnum(comm.output_format)}`);
  lines.push(`- **Emoji**: ${formatEnum(comm.emoji_policy)}`);
  lines.push(`- **Reasoning**: ${formatEnum(comm.reasoning_transparency)}`);
  lines.push(`- **Conflict**: ${formatEnum(comm.conflict_approach)}`);
  lines.push(`- **Uncertainty**: ${formatEnum(comm.uncertainty_handling)}`);
  lines.push("");

  // Domain
  if (spec.domain.expertise.length) {
    lines.push("## Expertise");
    lines.push("");
    for (const e of spec.domain.expertise) {
      lines.push(`- ${e}`);
    }
    lines.push("");
  }

  // Boundaries
  if (spec.domain.boundaries.refuses.length || spec.domain.boundaries.hard_limits.length) {
    lines.push("## Boundaries");
    lines.push("");
    if (spec.domain.boundaries.refuses.length) {
      lines.push("### Refuses");
      for (const r of spec.domain.boundaries.refuses) {
        lines.push(`- ${r}`);
      }
      lines.push("");
    }
    if (spec.domain.boundaries.escalation_triggers.length) {
      lines.push("### Escalation Triggers");
      for (const t of spec.domain.boundaries.escalation_triggers) {
        lines.push(`- ${t}`);
      }
      lines.push("");
    }
    if (spec.domain.boundaries.hard_limits.length) {
      lines.push("### Hard Limits");
      for (const l of spec.domain.boundaries.hard_limits) {
        lines.push(`- ${l}`);
      }
      lines.push("");
    }
  }

  // Patterns to watch
  if (spec.growth.patterns_to_watch.length) {
    lines.push("## Patterns to Watch");
    lines.push("");
    for (const p of spec.growth.patterns_to_watch) {
      lines.push(`- ${p}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatEnum(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
