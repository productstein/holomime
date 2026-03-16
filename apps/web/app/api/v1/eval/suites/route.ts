import { NextRequest, NextResponse } from "next/server";
import { authenticateAndRateLimit } from "@/lib/api-auth";
import { db } from "@holomime/db";
import { listSuites, createSuite } from "@holomime/core";

export async function GET(req: NextRequest) {
  const { auth, response } = await authenticateAndRateLimit(req);
  if (response) return response;

  const suites = await listSuites(db, auth.userId);
  return NextResponse.json(suites);
}

export async function POST(req: NextRequest) {
  const { auth, response } = await authenticateAndRateLimit(req);
  if (response) return response;

  const body = await req.json();
  const { name, scenarios } = body;

  if (!name || !scenarios) {
    return NextResponse.json({ error: "name and scenarios required" }, { status: 400 });
  }

  const suite = await createSuite(db, {
    userId: auth.userId,
    name,
    scenarios,
  });

  return NextResponse.json(suite, { status: 201 });
}
