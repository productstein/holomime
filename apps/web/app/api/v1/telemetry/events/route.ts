import { NextRequest, NextResponse } from "next/server";
import { authenticateAndRateLimit } from "@/lib/api-auth";
import { db, agents } from "@holomime/db";
import { eq, and } from "drizzle-orm";
import { ingestEvent, ingestBatch } from "@holomime/core";
import { telemetryEventSchema } from "@holomime/types";
import { z } from "zod";

export async function POST(req: NextRequest) {
  const { auth, response } = await authenticateAndRateLimit(req);
  if (response) return response;

  const body = await req.json();

  // Support single event or batch
  if (Array.isArray(body.events)) {
    const parsed = z.array(telemetryEventSchema).safeParse(body.events);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid events", details: parsed.error.issues }, { status: 400 });
    }
    await ingestBatch(db, parsed.data);
    return NextResponse.json({ received: parsed.data.length });
  }

  const parsed = telemetryEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event", details: parsed.error.issues }, { status: 400 });
  }

  await ingestEvent(db, parsed.data);
  return NextResponse.json({ received: 1 }, { status: 201 });
}
