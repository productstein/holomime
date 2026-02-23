import { eq, desc, and, sql } from "drizzle-orm";
import type { Database } from "@holomime/db";
import { personalityVectors, agents } from "@holomime/db";
import type { PersonalityTraits, Facets, Signatures, Preferences } from "@holomime/types";
import { computeVectorHash } from "./hash";

export interface CreateVectorInput {
  agentId: string;
  traits: PersonalityTraits;
  facets?: Facets;
  signatures?: Signatures;
  preferences?: Preferences;
  parentVectorId?: string | null;
}

export interface UpdateVectorInput {
  agentId: string;
  traits?: Partial<PersonalityTraits>;
  facets?: Facets;
  signatures?: Signatures;
  preferences?: Preferences;
}

export async function createVector(db: Database, input: CreateVectorInput) {
  // Get the next version number for this agent
  const lastVersion = await db
    .select({ version: personalityVectors.version })
    .from(personalityVectors)
    .where(eq(personalityVectors.agentId, input.agentId))
    .orderBy(desc(personalityVectors.version))
    .limit(1);

  const nextVersion = lastVersion.length > 0 ? lastVersion[0].version + 1 : 1;

  const facets = input.facets ?? {};
  const signatures = input.signatures ?? { tone_palette: [], taboo_tones: [] };
  const preferences: Preferences = input.preferences ?? {
    output_format: "mixed",
    bullet_density: "moderate",
    emoji_policy: "sparingly",
    reasoning_transparency: "on_request",
    citation_behavior: "none",
    decision_mode: "recommend_with_tradeoffs",
  };

  // Compute canonical hash
  const hash = computeVectorHash({
    traits: input.traits,
    facets,
    signatures,
    preferences,
  });

  const [vector] = await db
    .insert(personalityVectors)
    .values({
      agentId: input.agentId,
      version: nextVersion,
      traits: input.traits,
      facets,
      signatures,
      preferences,
      hash,
      parentVectorId: input.parentVectorId ?? null,
    })
    .returning();

  // Update agent's current vector pointer
  await db
    .update(agents)
    .set({ currentVectorId: vector.id, updatedAt: new Date() })
    .where(eq(agents.id, input.agentId));

  return vector;
}

export async function getVector(db: Database, vectorId: string) {
  const [vector] = await db
    .select()
    .from(personalityVectors)
    .where(eq(personalityVectors.id, vectorId))
    .limit(1);

  return vector ?? null;
}

export async function getVectorsByAgent(db: Database, agentId: string) {
  return db
    .select()
    .from(personalityVectors)
    .where(eq(personalityVectors.agentId, agentId))
    .orderBy(desc(personalityVectors.version));
}

export async function getCurrentVector(db: Database, agentId: string) {
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent?.currentVectorId) return null;

  return getVector(db, agent.currentVectorId);
}

export async function updateVector(db: Database, input: UpdateVectorInput) {
  // Get current vector
  const current = await getCurrentVector(db, input.agentId);
  if (!current) {
    throw new Error(`No current vector found for agent ${input.agentId}`);
  }

  const currentTraits = current.traits as PersonalityTraits;
  const mergedTraits: PersonalityTraits = {
    ...currentTraits,
    ...input.traits,
  };

  return createVector(db, {
    agentId: input.agentId,
    traits: mergedTraits,
    facets: input.facets ?? (current.facets as Facets),
    signatures: input.signatures ?? (current.signatures as Signatures),
    preferences: input.preferences ?? (current.preferences as Preferences),
  });
}

export async function rollbackVector(db: Database, agentId: string, vectorId: string) {
  // Verify the vector belongs to this agent
  const [vector] = await db
    .select()
    .from(personalityVectors)
    .where(and(
      eq(personalityVectors.id, vectorId),
      eq(personalityVectors.agentId, agentId),
    ))
    .limit(1);

  if (!vector) {
    throw new Error(`Vector ${vectorId} not found for agent ${agentId}`);
  }

  // Set agent's current vector pointer to the rollback target
  await db
    .update(agents)
    .set({ currentVectorId: vectorId, updatedAt: new Date() })
    .where(eq(agents.id, agentId));

  return vector;
}

export function diffVectors(
  vectorA: { traits: PersonalityTraits; facets: Facets; signatures: Signatures; preferences: Preferences },
  vectorB: { traits: PersonalityTraits; facets: Facets; signatures: Signatures; preferences: Preferences },
) {
  const traitDiffs: Record<string, { from: number; to: number }> = {};

  for (const key of Object.keys(vectorA.traits) as (keyof PersonalityTraits)[]) {
    if (vectorA.traits[key] !== vectorB.traits[key]) {
      traitDiffs[key] = { from: vectorA.traits[key], to: vectorB.traits[key] };
    }
  }

  const facetsDiff = JSON.stringify(vectorA.facets) !== JSON.stringify(vectorB.facets)
    ? { from: vectorA.facets, to: vectorB.facets }
    : null;

  const signaturesDiff = JSON.stringify(vectorA.signatures) !== JSON.stringify(vectorB.signatures)
    ? { from: vectorA.signatures, to: vectorB.signatures }
    : null;

  const preferencesDiff = JSON.stringify(vectorA.preferences) !== JSON.stringify(vectorB.preferences)
    ? { from: vectorA.preferences, to: vectorB.preferences }
    : null;

  return {
    traits: traitDiffs,
    facets: facetsDiff,
    signatures: signaturesDiff,
    preferences: preferencesDiff,
    hasChanges: Object.keys(traitDiffs).length > 0 || !!facetsDiff || !!signaturesDiff || !!preferencesDiff,
  };
}

export async function forkVector(db: Database, sourceVectorId: string, targetAgentId: string) {
  const source = await getVector(db, sourceVectorId);
  if (!source) {
    throw new Error(`Source vector ${sourceVectorId} not found`);
  }

  return createVector(db, {
    agentId: targetAgentId,
    traits: source.traits as PersonalityTraits,
    facets: source.facets as Facets,
    signatures: source.signatures as Signatures,
    preferences: source.preferences as Preferences,
    parentVectorId: sourceVectorId,
  });
}
