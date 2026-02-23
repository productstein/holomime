import { z } from "zod";
import { eq } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { personalityVectors, compiledCache } from "@holomime/db";
import { compileInputSchema } from "@holomime/types";
import type { PersonalityTraits, Facets, Signatures, Preferences } from "@holomime/types";
import { compile, explainCompilation, getCurrentVector } from "@holomime/core";

export const compilerRouter = router({
  compile: protectedProcedure
    .input(compileInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Get the vector to compile
      let vector;
      if (input.vectorId) {
        const [v] = await ctx.db
          .select()
          .from(personalityVectors)
          .where(eq(personalityVectors.id, input.vectorId))
          .limit(1);
        vector = v;
      } else if (input.agentId) {
        vector = await getCurrentVector(ctx.db, input.agentId);
      }

      if (!vector) {
        throw new Error("No personality vector found");
      }

      // Check cache
      const cacheKey = `${vector.hash}:${input.provider}:${input.surface}`;
      const [cached] = await ctx.db
        .select()
        .from(compiledCache)
        .where(eq(compiledCache.cacheKey, cacheKey))
        .limit(1);

      if (cached) {
        return cached.compiledConfig;
      }

      // Compile
      const compiled = compile({
        traits: vector.traits as PersonalityTraits,
        facets: vector.facets as Facets,
        signatures: vector.signatures as Signatures,
        preferences: vector.preferences as Preferences,
        provider: input.provider,
        surface: input.surface,
        vectorHash: vector.hash,
      });

      // Cache the result
      await ctx.db
        .insert(compiledCache)
        .values({
          cacheKey,
          vectorHash: vector.hash,
          provider: input.provider,
          surface: input.surface,
          compiledConfig: compiled,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h TTL
        })
        .onConflictDoNothing();

      return compiled;
    }),

  explain: protectedProcedure
    .input(compileInputSchema)
    .query(async ({ ctx, input }) => {
      let vector;
      if (input.vectorId) {
        const [v] = await ctx.db
          .select()
          .from(personalityVectors)
          .where(eq(personalityVectors.id, input.vectorId))
          .limit(1);
        vector = v;
      } else if (input.agentId) {
        vector = await getCurrentVector(ctx.db, input.agentId);
      }

      if (!vector) throw new Error("No personality vector found");

      return explainCompilation({
        traits: vector.traits as PersonalityTraits,
        facets: vector.facets as Facets,
        signatures: vector.signatures as Signatures,
        preferences: vector.preferences as Preferences,
        provider: input.provider,
        surface: input.surface,
        vectorHash: vector.hash,
      });
    }),
});
