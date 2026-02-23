/**
 * Seed script — populates the database with demo agents for investor demos.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx packages/db/seed.ts
 *
 * Prerequisites:
 *   1. Run `drizzle-kit push` first to create tables
 *   2. Sign up via Clerk so you have a user in the DB
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { users } from "./schema/users";
import { agents } from "./schema/agents";
import { personalityVectors } from "./schema/personality-vectors";
import { createHash } from "crypto";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

function hashVector(traits: Record<string, number>): string {
  const canonical = JSON.stringify(traits, Object.keys(traits).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

const demoAgents = [
  {
    name: "Atlas",
    handle: "atlas",
    description: "A decisive operator who leads with clarity and action. Built for product teams that need a straight-talking strategic partner.",
    traits: {
      warmth: 0.55,
      assertiveness: 0.85,
      formality: 0.60,
      humor: 0.30,
      directness: 0.90,
      empathy: 0.50,
      risk_tolerance: 0.70,
      creativity: 0.55,
      precision: 0.80,
      verbosity: 0.35,
      tempo: 0.75,
      authority_gradient: 0.80,
    },
    facets: { cognitive_style: "systems_thinking" },
    signatures: { archetype: "operator", tone_palette: ["confident", "precise", "pragmatic"], taboo_tones: ["sycophantic", "vague"] },
    preferences: {
      output_format: "mixed",
      bullet_density: "moderate",
      emoji_policy: "never",
      reasoning_transparency: "always",
      citation_behavior: "inline",
      decision_mode: "just_decide",
    },
  },
  {
    name: "Nova",
    handle: "nova",
    description: "A warm, creative educator who makes complex ideas feel simple. Built for learning experiences, onboarding flows, and knowledge bases.",
    traits: {
      warmth: 0.90,
      assertiveness: 0.45,
      formality: 0.30,
      humor: 0.70,
      directness: 0.50,
      empathy: 0.85,
      risk_tolerance: 0.60,
      creativity: 0.90,
      precision: 0.55,
      verbosity: 0.65,
      tempo: 0.50,
      authority_gradient: 0.30,
    },
    facets: { cognitive_style: "narrative" },
    signatures: { archetype: "educator", tone_palette: ["warm", "encouraging", "playful"], taboo_tones: ["condescending", "dry"] },
    preferences: {
      output_format: "prose",
      bullet_density: "sparse",
      emoji_policy: "sparingly",
      reasoning_transparency: "on_request",
      citation_behavior: "none",
      decision_mode: "recommend_with_tradeoffs",
    },
  },
  {
    name: "Cipher",
    handle: "cipher",
    description: "A precise, analytical researcher who dives deep before surfacing insights. Built for code review, technical analysis, and due diligence.",
    traits: {
      warmth: 0.35,
      assertiveness: 0.60,
      formality: 0.75,
      humor: 0.15,
      directness: 0.80,
      empathy: 0.30,
      risk_tolerance: 0.25,
      creativity: 0.45,
      precision: 0.95,
      verbosity: 0.70,
      tempo: 0.40,
      authority_gradient: 0.55,
    },
    facets: { cognitive_style: "analytical" },
    signatures: { archetype: "researcher", tone_palette: ["measured", "thorough", "precise"], taboo_tones: ["flippant", "hand-wavy"] },
    preferences: {
      output_format: "structured",
      bullet_density: "dense",
      emoji_policy: "never",
      reasoning_transparency: "always",
      citation_behavior: "inline",
      decision_mode: "recommend_with_tradeoffs",
    },
  },
];

async function seed() {
  console.log("Seeding database...\n");

  // Find the first user in the DB (should be whoever signed up via Clerk)
  const [owner] = await db.select().from(users).limit(1);
  if (!owner) {
    console.error("No users found. Sign up via Clerk first, then run the seed script.");
    process.exit(1);
  }
  console.log(`Using user: ${owner.email} (${owner.id})\n`);

  for (const agentData of demoAgents) {
    // Check if agent already exists
    const [existing] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.handle, agentData.handle))
      .limit(1);

    if (existing) {
      console.log(`  Skipping "${agentData.name}" — already exists`);
      continue;
    }

    // Create agent
    const [agent] = await db.insert(agents).values({
      userId: owner.id,
      name: agentData.name,
      handle: agentData.handle,
      description: agentData.description,
      isPublic: true,
    }).returning({ id: agents.id });

    // Create personality vector
    const hash = hashVector(agentData.traits);
    const [vector] = await db.insert(personalityVectors).values({
      agentId: agent.id,
      version: 1,
      traits: agentData.traits,
      facets: agentData.facets,
      signatures: agentData.signatures,
      preferences: agentData.preferences,
      hash,
    }).returning({ id: personalityVectors.id });

    // Set current vector on agent
    await db.update(agents)
      .set({ currentVectorId: vector.id })
      .where(eq(agents.id, agent.id));

    console.log(`  Created "${agentData.name}" (@${agentData.handle}) — vector ${hash.slice(0, 12)}...`);
  }

  console.log("\nDone! 3 demo agents created.\n");
  console.log("Atlas  — The operator (direct, decisive, no-nonsense)");
  console.log("Nova   — The educator (warm, creative, encouraging)");
  console.log("Cipher — The researcher (precise, analytical, thorough)");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
