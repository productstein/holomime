import { NextRequest, NextResponse } from "next/server";
import { authenticateAndRateLimit } from "@/lib/api-auth";
import { db, agents } from "@holomime/db";
import { eq, and } from "drizzle-orm";
import { getTimeline, computeDrift } from "@holomime/core";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { auth, response } = await authenticateAndRateLimit(req);
  if (response) return response;

  const { id } = await params;

  // Verify agent ownership
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.userId, auth.userId)))
    .limit(1);

  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const periodDays = parseInt(url.searchParams.get("periodDays") ?? "30", 10);

  const [timeline, drift] = await Promise.all([
    getTimeline(db, id, { limit }),
    computeDrift(db, id, { periodDays }),
  ]);

  return NextResponse.json({ timeline, drift });
}
