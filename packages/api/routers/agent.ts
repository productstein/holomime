import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { agents, users } from "@holomime/db";
import { createAgentInputSchema } from "@holomime/types";
import { ARCHETYPES } from "@holomime/config";
import { createVector } from "@holomime/core";

export const agentRouter = router({
  create: protectedProcedure
    .input(createAgentInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Create the agent
      const [agent] = await ctx.db
        .insert(agents)
        .values({
          userId: ctx.userDbId,
          name: input.name,
          handle: input.handle,
          description: input.description,
        })
        .returning();

      // If an archetype was selected, create the initial vector
      if (input.archetype && input.archetype in ARCHETYPES) {
        const archetypeConfig = ARCHETYPES[input.archetype as keyof typeof ARCHETYPES];
        await createVector(ctx.db, {
          agentId: agent.id,
          traits: archetypeConfig.traits,
        });
      }

      return agent;
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [agent] = await ctx.db
        .select()
        .from(agents)
        .where(and(eq(agents.id, input.id), eq(agents.userId, ctx.userDbId)))
        .limit(1);

      if (!agent) return null;
      return agent;
    }),

  list: protectedProcedure
    .query(async ({ ctx }) => {
      return ctx.db
        .select()
        .from(agents)
        .where(eq(agents.userId, ctx.userDbId))
        .orderBy(desc(agents.updatedAt));
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional(),
      isPublic: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [agent] = await ctx.db
        .update(agents)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(agents.id, id), eq(agents.userId, ctx.userDbId)))
        .returning();

      return agent;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(agents)
        .where(and(eq(agents.id, input.id), eq(agents.userId, ctx.userDbId)));

      return { success: true };
    }),

  getPublic: publicProcedure
    .input(z.object({ handle: z.string() }))
    .query(async ({ ctx, input }) => {
      const [agent] = await ctx.db
        .select({
          id: agents.id,
          name: agents.name,
          handle: agents.handle,
          description: agents.description,
          isPublic: agents.isPublic,
          currentVectorId: agents.currentVectorId,
          forkCount: agents.forkCount,
          createdAt: agents.createdAt,
          creator: {
            username: users.username,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
          },
        })
        .from(agents)
        .innerJoin(users, eq(agents.userId, users.id))
        .where(and(eq(agents.handle, input.handle), eq(agents.isPublic, true)))
        .limit(1);

      return agent ?? null;
    }),

  fork: protectedProcedure
    .input(z.object({
      sourceAgentId: z.string().uuid(),
      name: z.string().min(1).max(100),
      handle: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get source agent (must be public)
      const [source] = await ctx.db
        .select()
        .from(agents)
        .where(and(eq(agents.id, input.sourceAgentId), eq(agents.isPublic, true)))
        .limit(1);

      if (!source || !source.currentVectorId) {
        throw new Error("Source agent not found or has no personality");
      }

      // Create the new agent
      const [newAgent] = await ctx.db
        .insert(agents)
        .values({
          userId: ctx.userDbId,
          name: input.name,
          handle: input.handle,
          forkedFromAgentId: source.id,
        })
        .returning();

      // Fork the vector
      const { forkVector } = await import("@holomime/core");
      await forkVector(ctx.db, source.currentVectorId, newAgent.id);

      // Increment fork count on source
      const { sql } = await import("drizzle-orm");
      await ctx.db
        .update(agents)
        .set({ forkCount: sql`${agents.forkCount} + 1` })
        .where(eq(agents.id, source.id));

      return newAgent;
    }),
});
