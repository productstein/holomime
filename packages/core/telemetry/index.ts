import { eq, and, gte, sql, desc } from "drizzle-orm";
import type { Database } from "@holomime/db";
import { telemetryEvents } from "@holomime/db";
import type { TelemetryEvent, HealthScore } from "@holomime/types";

export async function ingestEvent(db: Database, event: TelemetryEvent) {
  const [inserted] = await db
    .insert(telemetryEvents)
    .values({
      agentId: event.agentId,
      eventType: event.eventType,
      metadata: event.metadata,
    })
    .returning();

  return inserted;
}

export async function ingestBatch(db: Database, events: TelemetryEvent[]) {
  if (!events.length) return [];

  return db
    .insert(telemetryEvents)
    .values(
      events.map((e) => ({
        agentId: e.agentId,
        eventType: e.eventType,
        metadata: e.metadata,
      }))
    )
    .returning();
}

export async function getRecentEvents(db: Database, agentId: string, limit = 100) {
  return db
    .select()
    .from(telemetryEvents)
    .where(eq(telemetryEvents.agentId, agentId))
    .orderBy(desc(telemetryEvents.createdAt))
    .limit(limit);
}

export async function getEventCounts(db: Database, agentId: string, since: Date) {
  const rows = await db
    .select({
      eventType: telemetryEvents.eventType,
      count: sql<number>`count(*)::int`,
    })
    .from(telemetryEvents)
    .where(
      and(
        eq(telemetryEvents.agentId, agentId),
        gte(telemetryEvents.createdAt, since),
      )
    )
    .groupBy(telemetryEvents.eventType);

  return Object.fromEntries(rows.map((r) => [r.eventType, r.count]));
}

/**
 * Compute a health score for an agent based on recent telemetry.
 * This is a simplified scoring model — production would use ML-based drift detection.
 */
export async function computeHealthScore(db: Database, agentId: string): Promise<HealthScore> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
  const counts = await getEventCounts(db, agentId, since);

  const totalEvents = Object.values(counts).reduce((sum, c) => sum + c, 0);
  const completedCount = counts["message.completed"] ?? 0;
  const failedCount = counts["message.failed"] ?? 0;
  const policyViolations = counts["policy.violation"] ?? 0;
  const driftEvents = counts["drift.detected"] ?? 0;

  // Consistency: ratio of successful completions
  const consistency = totalEvents > 0
    ? Math.round((completedCount / (completedCount + failedCount || 1)) * 100)
    : 100;

  // Policy compliance: inverse of violation rate
  const policyCompliance = totalEvents > 0
    ? Math.round(Math.max(0, 100 - (policyViolations / totalEvents) * 500))
    : 100;

  // Performance: based on completion rate
  const performanceScore = totalEvents > 0
    ? Math.round((completedCount / totalEvents) * 100)
    : 50;

  // Drift level
  let driftLevel: "none" | "low" | "moderate" | "high" = "none";
  if (driftEvents > 10) driftLevel = "high";
  else if (driftEvents > 5) driftLevel = "moderate";
  else if (driftEvents > 0) driftLevel = "low";

  // Overall score
  const overall = Math.round(consistency * 0.4 + policyCompliance * 0.3 + performanceScore * 0.3);

  return {
    agentId,
    overall,
    consistency,
    policyCompliance,
    performanceScore,
    driftLevel,
    lastUpdated: new Date(),
  };
}

export async function getMetrics(db: Database, agentId: string, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const events = await db
    .select()
    .from(telemetryEvents)
    .where(
      and(
        eq(telemetryEvents.agentId, agentId),
        gte(telemetryEvents.createdAt, since),
      )
    )
    .orderBy(telemetryEvents.createdAt);

  const totalEvents = events.length;
  const completed = events.filter((e) => e.eventType === "message.completed");
  const failed = events.filter((e) => e.eventType === "message.failed");

  // Extract latency metrics from metadata
  const latencies = completed
    .map((e) => (e.metadata as Record<string, unknown>)?.latency_ms as number)
    .filter((l): l is number => typeof l === "number");

  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] ?? 0;
  const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] ?? 0;
  const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] ?? 0;

  return {
    totalEvents,
    completedCount: completed.length,
    failedCount: failed.length,
    successRate: totalEvents > 0 ? completed.length / totalEvents : 0,
    latency: { p50, p95, p99 },
    period: { from: since, to: new Date(), days },
  };
}
