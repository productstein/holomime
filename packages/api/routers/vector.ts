import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { agents, personalityVectors } from "@holomime/db";
import { personalityTraitsSchema, facetsSchema, signaturesSchema, preferencesSchema } from "@holomime/types";
import {
  createVector, getVector, getVectorsByAgent, getCurrentVector,
  updateVector, rollbackVector, diffVectors,
} from "@holomime/core";
import type { PersonalityTraits, Facets, Signatures, Preferences } from "@holomime/types";

export const vectorRouter = router({
  create: protectedProcedure
    .input(z.object({
      agentId: z.string().uuid(),
      traits: personalityTraitsSchema,
      facets: facetsSchema.optional(),
      signatures: signaturesSchema.optional(),
      preferences: preferencesSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify agent belongs to user
      const [agent] = await ctx.db
        .select()
        .from(agents)
        .where(and(eq(agents.id, input.agentId), eq(agents.userId, ctx.userDbId)))
        .limit(1);

      if (!agent) throw new Error("Agent not found");

      return createVector(ctx.db, input);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getVector(ctx.db, input.id);
    }),

  getCurrent: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getCurrentVector(ctx.db, input.agentId);
    }),

  listVersions: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return getVectorsByAgent(ctx.db, input.agentId);
    }),

  update: protectedProcedure
    .input(z.object({
      agentId: z.string().uuid(),
      traits: personalityTraitsSchema.partial().optional(),
      facets: facetsSchema.optional(),
      signatures: signaturesSchema.optional(),
      preferences: preferencesSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify agent belongs to user
      const [agent] = await ctx.db
        .select()
        .from(agents)
        .where(and(eq(agents.id, input.agentId), eq(agents.userId, ctx.userDbId)))
        .limit(1);

      if (!agent) throw new Error("Agent not found");

      return updateVector(ctx.db, {
        agentId: input.agentId,
        traits: input.traits,
        facets: input.facets,
        signatures: input.signatures,
        preferences: input.preferences,
      });
    }),

  rollback: protectedProcedure
    .input(z.object({
      agentId: z.string().uuid(),
      vectorId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      return rollbackVector(ctx.db, input.agentId, input.vectorId);
    }),

  diff: protectedProcedure
    .input(z.object({
      vectorAId: z.string().uuid(),
      vectorBId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      const vectorA = await getVector(ctx.db, input.vectorAId);
      const vectorB = await getVector(ctx.db, input.vectorBId);

      if (!vectorA || !vectorB) throw new Error("One or both vectors not found");

      return diffVectors(
        {
          traits: vectorA.traits as PersonalityTraits,
          facets: vectorA.facets as Facets,
          signatures: vectorA.signatures as Signatures,
          preferences: vectorA.preferences as Preferences,
        },
        {
          traits: vectorB.traits as PersonalityTraits,
          facets: vectorB.facets as Facets,
          signatures: vectorB.signatures as Signatures,
          preferences: vectorB.preferences as Preferences,
        },
      );
    }),
});
