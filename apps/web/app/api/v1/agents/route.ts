import { NextRequest, NextResponse } from "next/server";
import { authenticateAndRateLimit } from "@/lib/api-auth";
import { db, agents } from "@holomime/db";
import { eq, and } from "drizzle-orm";
import { createVector } from "@holomime/core";
import { ARCHETYPES } from "@holomime/config";

export async function GET(req: NextRequest) {
  const { auth, response } = await authenticateAndRateLimit(req);
  if (response) return response;

  const agentList = await db
    .select()
    .from(agents)
    .where(eq(agents.userId, auth.userId));

  return NextResponse.json(agentList);
}

export async function POST(req: NextRequest) {
  const { auth, response } = await authenticateAndRateLimit(req);
  if (response) return response;

  const body = await req.json();
  const { name, handle, description, archetype } = body;

  if (!name || !handle) {
    return NextResponse.json({ error: "name and handle required" }, { status: 400 });
  }

  // Check handle uniqueness
  const [existing] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.handle, handle))
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "Handle already taken" }, { status: 409 });
  }

  const [agent] = await db
    .insert(agents)
    .values({
      userId: auth.userId,
      name,
      handle,
      description: description ?? null,
    })
    .returning();

  // If archetype specified, create initial vector with preset traits
  if (archetype && ARCHETYPES[archetype as keyof typeof ARCHETYPES]) {
    const traits = ARCHETYPES[archetype as keyof typeof ARCHETYPES].traits;
    const vector = await createVector(db, {
      agentId: agent.id,
      traits,
    });

    await db
      .update(agents)
      .set({ currentVectorId: vector.id })
      .where(eq(agents.id, agent.id));
  }

  return NextResponse.json(agent, { status: 201 });
}
