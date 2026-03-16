import { NextRequest, NextResponse } from "next/server";
import { authenticateAndRateLimit } from "@/lib/api-auth";
import { db, teams, teamMembers } from "@holomime/db";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { auth, response } = await authenticateAndRateLimit(req);
  if (response) return response;

  const rows = await db
    .select()
    .from(teams)
    .where(eq(teams.userId, auth.userId))
    .orderBy(teams.updatedAt);

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { auth, response } = await authenticateAndRateLimit(req);
  if (response) return response;

  const body = await req.json();
  const { name, description, members } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const [team] = await db
    .insert(teams)
    .values({
      userId: auth.userId,
      name,
      description: description ?? null,
    })
    .returning();

  if (members?.length) {
    await db.insert(teamMembers).values(
      members.map((m: { agentId: string; role?: string }) => ({
        teamId: team.id,
        agentId: m.agentId,
        role: m.role ?? "member",
      })),
    );
  }

  return NextResponse.json(team, { status: 201 });
}
