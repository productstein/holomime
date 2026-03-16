import { NextRequest, NextResponse } from "next/server";
import { authenticateAndRateLimit } from "@/lib/api-auth";
import { db, agents, personalityVectors } from "@holomime/db";
import { eq, and } from "drizzle-orm";
import { compile, getCurrentVector } from "@holomime/core";
import { compileInputSchema } from "@holomime/types";
import type { PersonalityTraits, Facets, Signatures, Preferences } from "@holomime/types";

export async function POST(req: NextRequest) {
  const { auth, response } = await authenticateAndRateLimit(req);
  if (response) return response;

  const body = await req.json();
  const parsed = compileInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
  }

  const { agentId, vectorId, provider, surface } = parsed.data;

  // Resolve vector — either by explicit vectorId or agent's current vector
  let vector;
  if (vectorId) {
    const [v] = await db
      .select()
      .from(personalityVectors)
      .where(eq(personalityVectors.id, vectorId))
      .limit(1);
    vector = v;
  } else if (agentId) {
    // Verify agent belongs to user
    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.userId, auth.userId)))
      .limit(1);

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    vector = await getCurrentVector(db, agentId);
  } else {
    return NextResponse.json({ error: "agentId or vectorId required" }, { status: 400 });
  }

  if (!vector) {
    return NextResponse.json({ error: "No personality vector found" }, { status: 404 });
  }

  const compiled = compile({
    traits: vector.traits as PersonalityTraits,
    facets: vector.facets as Facets,
    signatures: vector.signatures as Signatures,
    preferences: vector.preferences as Preferences,
    provider,
    surface: surface ?? "chat",
    vectorHash: vector.hash,
  });

  return NextResponse.json(compiled);
}
