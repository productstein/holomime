import { NextRequest, NextResponse } from "next/server";
import { authenticateAndRateLimit } from "@/lib/api-auth";
import { db, teams } from "@holomime/db";
import { eq, and } from "drizzle-orm";
import { getTeamWithMembers } from "@holomime/core";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { auth, response } = await authenticateAndRateLimit(req);
  if (response) return response;

  const { id } = await params;
  const team = await getTeamWithMembers(db, id, auth.userId);
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(team);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { auth, response } = await authenticateAndRateLimit(req);
  if (response) return response;

  const { id } = await params;
  const body = await req.json();
  const { name, description } = body;

  const [team] = await db
    .update(teams)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(teams.id, id), eq(teams.userId, auth.userId)))
    .returning();

  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(team);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { auth, response } = await authenticateAndRateLimit(req);
  if (response) return response;

  const { id } = await params;
  await db
    .delete(teams)
    .where(and(eq(teams.id, id), eq(teams.userId, auth.userId)));

  return NextResponse.json({ success: true });
}
