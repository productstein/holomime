import { z } from "zod";
import { eq, desc, sql, and, ilike } from "drizzle-orm";
import { router, publicProcedure } from "../trpc";
import { agents, users, personalityVectors, agentAvatars } from "@holomime/db";
import { discoverInputSchema } from "@holomime/types";

export const discoverRouter = router({
  browse: publicProcedure
    .input(discoverInputSchema)
    .query(async ({ ctx, input }) => {
      const conditions = [eq(agents.isPublic, true)];

      // Build query
      let query = ctx.db
        .select({
          id: agents.id,
          name: agents.name,
          handle: agents.handle,
          description: agents.description,
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
        .where(and(...conditions))
        .limit(input.limit);

      // Sort
      if (input.sortBy === "most_forked") {
        query = query.orderBy(desc(agents.forkCount)) as typeof query;
      } else if (input.sortBy === "newest") {
        query = query.orderBy(desc(agents.createdAt)) as typeof query;
      } else {
        // trending and highest_rated default to fork count for now
        query = query.orderBy(desc(agents.forkCount)) as typeof query;
      }

      return query;
    }),

  search: publicProcedure
    .input(z.object({ query: z.string().min(1).max(200) }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select({
          id: agents.id,
          name: agents.name,
          handle: agents.handle,
          description: agents.description,
          forkCount: agents.forkCount,
          creator: {
            username: users.username,
            displayName: users.displayName,
          },
        })
        .from(agents)
        .innerJoin(users, eq(agents.userId, users.id))
        .where(
          and(
            eq(agents.isPublic, true),
            sql`(${agents.name} ILIKE ${'%' + input.query + '%'} OR ${agents.description} ILIKE ${'%' + input.query + '%'})`,
          )
        )
        .orderBy(desc(agents.forkCount))
        .limit(20);
    }),

  creatorProfile: publicProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          bio: users.bio,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.username, input.username))
        .limit(1);

      if (!user) return null;

      const publishedAgents = await ctx.db
        .select({
          id: agents.id,
          name: agents.name,
          handle: agents.handle,
          description: agents.description,
          forkCount: agents.forkCount,
          createdAt: agents.createdAt,
        })
        .from(agents)
        .where(and(eq(agents.userId, user.id), eq(agents.isPublic, true)))
        .orderBy(desc(agents.forkCount));

      const totalForks = publishedAgents.reduce((sum, a) => sum + (a.forkCount as number ?? 0), 0);

      return {
        ...user,
        agents: publishedAgents,
        totalForks,
        agentCount: publishedAgents.length,
      };
    }),
});
