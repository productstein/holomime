import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { agentAvatars, agents, personalityVectors } from "@holomime/db";
import { generateAvatar, getCurrentVector } from "@holomime/core";
import type { PersonalityTraits } from "@holomime/types";

export const avatarRouter = router({
  generate: protectedProcedure
    .input(z.object({
      agentId: z.string().uuid(),
      style: z.enum(["pixel", "illustrated"]).default("pixel"),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get current vector
      const vector = await getCurrentVector(ctx.db, input.agentId);
      if (!vector) throw new Error("Agent has no personality vector");

      // Generate SVG
      const svgData = generateAvatar(vector.traits as PersonalityTraits, {
        size: 200,
        style: input.style,
      });

      // Upsert avatar
      const [avatar] = await ctx.db
        .insert(agentAvatars)
        .values({
          agentId: input.agentId,
          vectorId: vector.id,
          svgData,
          style: input.style,
        })
        .returning();

      return avatar;
    }),

  get: publicProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [avatar] = await ctx.db
        .select()
        .from(agentAvatars)
        .where(eq(agentAvatars.agentId, input.agentId))
        .limit(1);

      return avatar ?? null;
    }),

  preview: protectedProcedure
    .input(z.object({
      traits: z.object({
        warmth: z.number().min(0).max(1),
        assertiveness: z.number().min(0).max(1),
        formality: z.number().min(0).max(1),
        humor: z.number().min(0).max(1),
        directness: z.number().min(0).max(1),
        empathy: z.number().min(0).max(1),
        risk_tolerance: z.number().min(0).max(1),
        creativity: z.number().min(0).max(1),
        precision: z.number().min(0).max(1),
        verbosity: z.number().min(0).max(1),
        tempo: z.number().min(0).max(1),
        authority_gradient: z.number().min(0).max(1),
      }),
      size: z.number().int().min(64).max(512).default(200),
    }))
    .query(({ input }) => {
      // Pure function — no DB needed, generates SVG from traits
      return generateAvatar(input.traits, { size: input.size });
    }),
});
