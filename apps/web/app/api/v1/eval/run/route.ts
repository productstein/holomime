import { NextRequest, NextResponse } from "next/server";
import { authenticateAndRateLimit } from "@/lib/api-auth";
import { db, agents, personalityVectors, evalSuites } from "@holomime/db";
import { eq, and } from "drizzle-orm";
import { createEvalRun, getEvalRun } from "@holomime/core";

export async function POST(req: NextRequest) {
  const { auth, response } = await authenticateAndRateLimit(req);
  if (response) return response;

  const body = await req.json();
  const { suite_id, vector_id } = body;

  if (!suite_id || !vector_id) {
    return NextResponse.json({ error: "suite_id and vector_id required" }, { status: 400 });
  }

  // Verify vector exists
  const [vector] = await db
    .select()
    .from(personalityVectors)
    .where(eq(personalityVectors.id, vector_id))
    .limit(1);

  if (!vector) {
    return NextResponse.json({ error: "Vector not found" }, { status: 404 });
  }

  const run = await createEvalRun(db, {
    suiteId: suite_id,
    vectorId: vector_id,
  });

  return NextResponse.json({ runId: run.id, status: run.status }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const { auth, response } = await authenticateAndRateLimit(req);
  if (response) return response;

  const runId = req.nextUrl.searchParams.get("run_id");
  if (!runId) {
    return NextResponse.json({ error: "run_id required" }, { status: 400 });
  }

  const run = await getEvalRun(db, runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json(run);
}
