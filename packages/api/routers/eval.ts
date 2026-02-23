import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { evalScenarioSchema } from "@holomime/types";
import { createSuite, getSuite, listSuites, createEvalRun, getEvalRun, getRunsByVector } from "@holomime/core";

export const evalRouter = router({
  createSuite: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(500).optional(),
      scenarios: z.array(evalScenarioSchema),
    }))
    .mutation(async ({ ctx, input }) => {
      return createSuite(ctx.db, {
        userId: ctx.userDbId,
        ...input,
      });
    }),

  getSuite: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getSuite(ctx.db, input.id);
    }),

  listSuites: protectedProcedure
    .query(async ({ ctx }) => {
      return listSuites(ctx.db, ctx.userDbId);
    }),

  runSuite: protectedProcedure
    .input(z.object({
      suiteId: z.string().uuid(),
      vectorId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Create a pending eval run — actual execution happens via Inngest
      return createEvalRun(ctx.db, input);
    }),

  getRun: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getEvalRun(ctx.db, input.id);
    }),

  getRunsByVector: protectedProcedure
    .input(z.object({ vectorId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getRunsByVector(ctx.db, input.vectorId);
    }),
});
