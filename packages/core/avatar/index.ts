import type { PersonalityTraits } from "@holomime/types";

/**
 * Procedural SVG Avatar Generator
 *
 * Generates unique agent avatars from personality trait values.
 * The avatar is a visual expression of the personality vector —
 * as traits change, the visual identity shifts to match.
 *
 * 6 composable layers:
 * 1. Aura — background glow colored by warmth
 * 2. Base shape — geometric form driven by formality
 * 3. Pattern — internal pattern complexity from creativity
 * 4. Expression — facial/symbolic expression from empathy + humor
 * 5. Accent — decorative elements from assertiveness
 * 6. Badge — archetype indicator
 */

export interface AvatarOptions {
  size?: number;
  style?: "pixel" | "illustrated";
}

export function generateAvatar(traits: PersonalityTraits, options: AvatarOptions = {}): string {
  const size = options.size ?? 200;
  const cx = size / 2;
  const cy = size / 2;

  const layers: string[] = [];

  // Derive visual properties from traits
  const hue = mapWarmthToHue(traits.warmth);
  const saturation = 40 + traits.creativity * 40; // 40-80%
  const formality = traits.formality;
  const energy = (traits.assertiveness + traits.tempo) / 2;

  // Layer 1: Aura (background glow)
  layers.push(generateAura(cx, cy, size, hue, saturation, traits.empathy));

  // Layer 2: Base shape (driven by formality)
  layers.push(generateBaseShape(cx, cy, size, formality, hue, saturation));

  // Layer 3: Internal pattern (complexity from creativity)
  layers.push(generatePattern(cx, cy, size, traits.creativity, hue));

  // Layer 4: Expression (empathy + humor → visual expression)
  layers.push(generateExpression(cx, cy, size, traits.empathy, traits.humor, traits.warmth));

  // Layer 5: Accent marks (assertiveness → visual weight)
  layers.push(generateAccents(cx, cy, size, traits.assertiveness, traits.authority_gradient, hue));

  // Layer 6: Energy ring (tempo + risk_tolerance)
  layers.push(generateEnergyRing(cx, cy, size, energy, traits.risk_tolerance, hue));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <radialGradient id="aura-grad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="hsl(${hue}, ${saturation}%, 85%)" stop-opacity="0.6" />
      <stop offset="100%" stop-color="hsl(${hue}, ${saturation}%, 95%)" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="body-grad" cx="40%" cy="35%" r="60%">
      <stop offset="0%" stop-color="hsl(${hue}, ${saturation}%, 70%)" />
      <stop offset="100%" stop-color="hsl(${hue}, ${saturation}%, 45%)" />
    </radialGradient>
  </defs>
  ${layers.join("\n  ")}
</svg>`;
}

/**
 * Maps warmth (0-1) to hue (220° cool blue → 35° warm amber)
 */
function mapWarmthToHue(warmth: number): number {
  // Interpolate from cool (220°) to warm (35°)
  // Going through purple → red → orange → amber
  if (warmth <= 0.5) {
    // 220° → 340° (blue → magenta)
    return 220 + warmth * 2 * 120;
  }
  // 340° → 35° (magenta → amber, wrapping around 360)
  return (340 + (warmth - 0.5) * 2 * 55) % 360;
}

function generateAura(cx: number, cy: number, size: number, hue: number, sat: number, empathy: number): string {
  const radius = size * 0.48;
  const opacity = 0.15 + empathy * 0.25; // More empathetic = stronger aura
  return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="url(#aura-grad)" opacity="${opacity.toFixed(2)}" />`;
}

function generateBaseShape(cx: number, cy: number, size: number, formality: number, hue: number, sat: number): string {
  const r = size * 0.3;

  if (formality >= 0.7) {
    // High formality: geometric (hexagon or octagon)
    const points = generatePolygonPoints(cx, cy, r, 6);
    return `<polygon points="${points}" fill="url(#body-grad)" stroke="hsl(${hue}, ${sat}%, 35%)" stroke-width="2" />`;
  } else if (formality <= 0.3) {
    // Low formality: organic blob
    const d = generateBlobPath(cx, cy, r, 0.15);
    return `<path d="${d}" fill="url(#body-grad)" stroke="hsl(${hue}, ${sat}%, 35%)" stroke-width="2" />`;
  } else {
    // Medium formality: circle (universal, balanced)
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#body-grad)" stroke="hsl(${hue}, ${sat}%, 35%)" stroke-width="2" />`;
  }
}

function generatePattern(cx: number, cy: number, size: number, creativity: number, hue: number): string {
  if (creativity < 0.3) return ""; // Minimal pattern for low creativity

  const elements: string[] = [];
  const count = Math.floor(2 + creativity * 6); // 2-8 pattern elements
  const innerR = size * 0.15;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const dist = innerR * (0.3 + creativity * 0.5);
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;
    const dotR = 2 + creativity * 3;
    const opacity = 0.2 + creativity * 0.3;

    elements.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${dotR.toFixed(1)}" fill="hsl(${(hue + 30) % 360}, 50%, 80%)" opacity="${opacity.toFixed(2)}" />`
    );
  }

  return elements.join("\n  ");
}

function generateExpression(cx: number, cy: number, size: number, empathy: number, humor: number, warmth: number): string {
  const eyeSpacing = size * 0.08;
  const eyeY = cy - size * 0.04;
  const eyeSize = size * 0.022;

  // Eyes
  const leftEye = `<circle cx="${cx - eyeSpacing}" cy="${eyeY}" r="${eyeSize}" fill="hsl(0, 0%, 25%)" />`;
  const rightEye = `<circle cx="${cx + eyeSpacing}" cy="${eyeY}" r="${eyeSize}" fill="hsl(0, 0%, 25%)" />`;

  // Mouth: curved based on warmth + humor
  const mouthY = cy + size * 0.05;
  const mouthWidth = size * 0.08;
  const curve = (warmth + humor) / 2; // 0 = flat/frown, 1 = big smile
  const curveOffset = -5 + curve * 12; // -5 to +7

  const mouth = `<path d="M ${cx - mouthWidth} ${mouthY} Q ${cx} ${mouthY + curveOffset} ${cx + mouthWidth} ${mouthY}" fill="none" stroke="hsl(0, 0%, 25%)" stroke-width="1.5" stroke-linecap="round" />`;

  // Blush circles for high empathy
  let blush = "";
  if (empathy >= 0.6) {
    const blushOpacity = (empathy - 0.6) * 2.5; // 0 to 1
    blush = `<circle cx="${cx - eyeSpacing * 1.5}" cy="${eyeY + size * 0.04}" r="${size * 0.025}" fill="hsl(0, 60%, 75%)" opacity="${blushOpacity.toFixed(2)}" />
  <circle cx="${cx + eyeSpacing * 1.5}" cy="${eyeY + size * 0.04}" r="${size * 0.025}" fill="hsl(0, 60%, 75%)" opacity="${blushOpacity.toFixed(2)}" />`;
  }

  return [leftEye, rightEye, mouth, blush].filter(Boolean).join("\n  ");
}

function generateAccents(cx: number, cy: number, size: number, assertiveness: number, authority: number, hue: number): string {
  if (assertiveness < 0.4) return "";

  const elements: string[] = [];
  const numAccents = Math.floor(assertiveness * 4); // 0-4 accent marks

  for (let i = 0; i < numAccents; i++) {
    const angle = -Math.PI / 2 + (i - (numAccents - 1) / 2) * 0.4;
    const dist = size * 0.35 + authority * size * 0.05;
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;
    const len = 4 + authority * 6;

    elements.push(
      `<line x1="${(x - len / 2).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + len / 2).toFixed(1)}" y2="${y.toFixed(1)}" stroke="hsl(${hue}, 60%, 50%)" stroke-width="2" stroke-linecap="round" opacity="0.6" />`
    );
  }

  return elements.join("\n  ");
}

function generateEnergyRing(cx: number, cy: number, size: number, energy: number, riskTolerance: number, hue: number): string {
  if (energy < 0.3) return "";

  const r = size * 0.38;
  const dashLength = 4 + energy * 8;
  const gapLength = 8 - energy * 4;
  const opacity = 0.15 + energy * 0.25;
  const strokeWidth = 1 + riskTolerance * 1.5;

  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="hsl(${(hue + 60) % 360}, 50%, 60%)" stroke-width="${strokeWidth.toFixed(1)}" stroke-dasharray="${dashLength.toFixed(1)} ${gapLength.toFixed(1)}" opacity="${opacity.toFixed(2)}" />`;
}

// Helper: generate regular polygon points
function generatePolygonPoints(cx: number, cy: number, r: number, sides: number): string {
  const points: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    points.push(`${(cx + Math.cos(angle) * r).toFixed(1)},${(cy + Math.sin(angle) * r).toFixed(1)}`);
  }
  return points.join(" ");
}

// Helper: generate organic blob path
function generateBlobPath(cx: number, cy: number, r: number, wobble: number): string {
  const points = 8;
  const path: string[] = [];

  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const variation = 1 + Math.sin(angle * 3) * wobble + Math.cos(angle * 5) * wobble * 0.5;
    const x = cx + Math.cos(angle) * r * variation;
    const y = cy + Math.sin(angle) * r * variation;

    if (i === 0) {
      path.push(`M ${x.toFixed(1)} ${y.toFixed(1)}`);
    } else {
      const prevAngle = ((i - 0.5) / points) * Math.PI * 2;
      const cpVariation = 1 + Math.sin(prevAngle * 3) * wobble;
      const cpx = cx + Math.cos(prevAngle) * r * cpVariation * 1.1;
      const cpy = cy + Math.sin(prevAngle) * r * cpVariation * 1.1;
      path.push(`Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
  }

  return path.join(" ") + " Z";
}

/**
 * Generate a simple character sheet summary as structured data
 */
export function generateCharacterSheet(
  agentName: string,
  traits: PersonalityTraits,
  archetype?: string,
) {
  const dominantTraits = Object.entries(traits)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([name]) => name);

  const weakTraits = Object.entries(traits)
    .sort(([, a], [, b]) => a - b)
    .slice(0, 2)
    .map(([name]) => name);

  return {
    name: agentName,
    archetype: archetype ?? "custom",
    dominantTraits,
    weakTraits,
    traitRadar: traits,
    overallEnergy: (traits.assertiveness + traits.tempo + traits.directness) / 3,
    overallWarmth: (traits.warmth + traits.empathy + traits.humor) / 3,
    overallPrecision: (traits.precision + traits.formality + (1 - traits.risk_tolerance)) / 3,
  };
}
