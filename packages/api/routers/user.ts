import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { router, protectedProcedure } from "../trpc";
import { users, apiKeys } from "@holomime/db";
import { getUsageStats } from "../lib/plan-checks";

export const userRouter = router({
  getMe: protectedProcedure
    .query(async ({ ctx }) => {
      const [user] = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, ctx.userDbId))
        .limit(1);

      return user ?? null;
    }),

  updateProfile: protectedProcedure
    .input(z.object({
      displayName: z.string().max(100).optional(),
      bio: z.string().max(500).optional(),
      avatarUrl: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .update(users)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(users.id, ctx.userDbId))
        .returning();

      return user;
    }),

  getApiKeys: protectedProcedure
    .query(async ({ ctx }) => {
      return ctx.db
        .select({
          id: apiKeys.id,
          prefix: apiKeys.prefix,
          name: apiKeys.name,
          lastUsedAt: apiKeys.lastUsedAt,
          createdAt: apiKeys.createdAt,
        })
        .from(apiKeys)
        .where(eq(apiKeys.userId, ctx.userDbId));
    }),

  createApiKey: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      // Generate a random API key
      const rawKey = `mk_${randomBytes(32).toString("hex")}`;
      const prefix = rawKey.slice(0, 7); // mk_xxxx
      const keyHash = createHash("sha256").update(rawKey).digest("hex");

      const [key] = await ctx.db
        .insert(apiKeys)
        .values({
          userId: ctx.userDbId,
          keyHash,
          prefix,
          name: input.name,
        })
        .returning();

      // Return the full key ONCE — it won't be retrievable again
      return {
        id: key.id,
        key: rawKey,
        prefix,
        name: input.name,
        createdAt: key.createdAt,
      };
    }),

  revokeApiKey: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(apiKeys)
        .where(and(eq(apiKeys.id, input.id), eq(apiKeys.userId, ctx.userDbId)));

      return { success: true };
    }),

  getUsage: protectedProcedure
    .query(async ({ ctx }) => {
      return getUsageStats(ctx.db, ctx.userDbId, ctx.plan);
    }),
});
