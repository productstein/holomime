import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { telemetryEventSchema } from "@holomime/types";
import { ingestEvent, ingestBatch, computeHealthScore, getMetrics, getRecentEvents } from "@holomime/core";

export const telemetryRouter = router({
  ingest: protectedProcedure
    .input(telemetryEventSchema)
    .mutation(async ({ ctx, input }) => {
      return ingestEvent(ctx.db, input);
    }),

  ingestBatch: protectedProcedure
    .input(z.object({ events: z.array(telemetryEventSchema) }))
    .mutation(async ({ ctx, input }) => {
      return ingestBatch(ctx.db, input.events);
    }),

  getHealth: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return computeHealthScore(ctx.db, input.agentId);
    }),

  getMetrics: protectedProcedure
    .input(z.object({
      agentId: z.string().uuid(),
      days: z.number().int().min(1).max(365).default(30),
    }))
    .query(async ({ ctx, input }) => {
      return getMetrics(ctx.db, input.agentId, input.days);
    }),

  getRecentEvents: protectedProcedure
    .input(z.object({
      agentId: z.string().uuid(),
      limit: z.number().int().min(1).max(500).default(100),
    }))
    .query(async ({ ctx, input }) => {
      return getRecentEvents(ctx.db, input.agentId, input.limit);
    }),
});
