import { NextRequest, NextResponse } from "next/server";
import { authenticateAndRateLimit } from "@/lib/api-auth";
import { db, agents, personalityVectors } from "@holomime/db";
import { eq, and, desc } from "drizzle-orm";
import { createVector, getCurrentVector } from "@holomime/core";
import { personalityTraitsSchema } from "@holomime/types";

export async function GET(req: NextRequest) {
  const { auth, response } = await authenticateAndRateLimit(req);
  if (response) return response;

  const agentId = req.nextUrl.searchParams.get("agent_id");
  if (!agentId) {
    return NextResponse.json({ error: "agent_id required" }, { status: 400 });
  }

  const vectors = await db
    .select()
    .from(personalityVectors)
    .where(eq(personalityVectors.agentId, agentId))
    .orderBy(desc(personalityVectors.version));

  return NextResponse.json(vectors);
}

export async function POST(req: NextRequest) {
  const { auth, response } = await authenticateAndRateLimit(req);
  if (response) return response;

  const body = await req.json();
  const { agent_id, traits } = body;

  if (!agent_id) {
    return NextResponse.json({ error: "agent_id required" }, { status: 400 });
  }

  // Validate traits
  const parsed = personalityTraitsSchema.safeParse(traits);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid traits", details: parsed.error.issues }, { status: 400 });
  }

  // Verify agent belongs to user
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agent_id), eq(agents.userId, auth.userId)))
    .limit(1);

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const vector = await createVector(db, {
    agentId: agent_id,
    traits: parsed.data,
  });

  return NextResponse.json(vector, { status: 201 });
}
