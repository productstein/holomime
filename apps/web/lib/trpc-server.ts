import { appRouter, type TRPCContext } from "@holomime/api";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { auth } from "@clerk/nextjs/server";
import { db, users } from "@holomime/db";
import { eq } from "drizzle-orm";

async function createContext(): Promise<TRPCContext> {
  const { userId: clerkId } = await auth();

  let userDbId: string | null = null;
  if (clerkId) {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);
    userDbId = user?.id ?? null;
  }

  return {
    db,
    userId: clerkId,
    userDbId,
  };
}

export function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
  });
}
