import { NextRequest, NextResponse } from "next/server";
import { authenticateAndRateLimit } from "@/lib/api-auth";
import { db } from "@holomime/db";
import { computeTeamCompatibility } from "@holomime/core";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { auth, response } = await authenticateAndRateLimit(req);
  if (response) return response;

  const { id } = await params;
  const compatibility = await computeTeamCompatibility(db, id, auth.userId);

  if (!compatibility) {
    return NextResponse.json({ error: "Team not found or has no members with traits" }, { status: 404 });
  }

  return NextResponse.json(compatibility);
}
