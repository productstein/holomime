import { NextRequest, NextResponse } from "next/server";
import { authenticateAndRateLimit } from "@/lib/api-auth";
import { db, teams, teamMembers } from "@holomime/db";
import { eq, and } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { auth, response } = await authenticateAndRateLimit(req);
  if (response) return response;

  const { id } = await params;

  // Verify team ownership
  const [team] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.id, id), eq(teams.userId, auth.userId)))
    .limit(1);

  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const body = await req.json();
  const { agentId, role = "member" } = body;

  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }

  const [member] = await db
    .insert(teamMembers)
    .values({ teamId: id, agentId, role })
    .returning();

  return NextResponse.json(member, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { auth, response } = await authenticateAndRateLimit(req);
  if (response) return response;

  const { id } = await params;

  // Verify team ownership
  const [team] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.id, id), eq(teams.userId, auth.userId)))
    .limit(1);

  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const body = await req.json();
  const { agentId } = body;

  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }

  await db
    .delete(teamMembers)
    .where(and(eq(teamMembers.teamId, id), eq(teamMembers.agentId, agentId)));

  return NextResponse.json({ success: true });
}
