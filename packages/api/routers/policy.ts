import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { policyDocuments, vectorPolicies } from "@holomime/db";
import { policyRuleSchema } from "@holomime/types";

export const policyRouter = router({
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      rules: z.array(policyRuleSchema),
    }))
    .mutation(async ({ ctx, input }) => {
      const [policy] = await ctx.db
        .insert(policyDocuments)
        .values({
          userId: ctx.userDbId,
          name: input.name,
          rules: input.rules,
        })
        .returning();

      return policy;
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [policy] = await ctx.db
        .select()
        .from(policyDocuments)
        .where(and(
          eq(policyDocuments.id, input.id),
          eq(policyDocuments.userId, ctx.userDbId),
        ))
        .limit(1);

      return policy ?? null;
    }),

  list: protectedProcedure
    .query(async ({ ctx }) => {
      return ctx.db
        .select()
        .from(policyDocuments)
        .where(eq(policyDocuments.userId, ctx.userDbId));
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      rules: z.array(policyRuleSchema).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [policy] = await ctx.db
        .update(policyDocuments)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(
          eq(policyDocuments.id, id),
          eq(policyDocuments.userId, ctx.userDbId),
        ))
        .returning();

      return policy;
    }),

  attach: protectedProcedure
    .input(z.object({
      vectorId: z.string().uuid(),
      policyId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(vectorPolicies)
        .values(input)
        .onConflictDoNothing();

      return { success: true };
    }),

  detach: protectedProcedure
    .input(z.object({
      vectorId: z.string().uuid(),
      policyId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(vectorPolicies)
        .where(and(
          eq(vectorPolicies.vectorId, input.vectorId),
          eq(vectorPolicies.policyId, input.policyId),
        ));

      return { success: true };
    }),
});
