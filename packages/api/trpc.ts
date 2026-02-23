import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Database } from "@holomime/db";

export interface TRPCContext {
  db: Database;
  userId: string | null;
  userDbId: string | null;
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Middleware: require authenticated user
const enforceAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.userId || !ctx.userDbId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "You must be signed in" });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      userDbId: ctx.userDbId,
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceAuth);
