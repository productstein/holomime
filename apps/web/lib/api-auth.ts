import { createHash } from "crypto";
import { db, apiKeys, users } from "@holomime/db";
import { eq } from "drizzle-orm";

/**
 * Authenticate an API request using a Bearer token (API key).
 * Returns the user ID if valid, null otherwise.
 */
export async function authenticateApiKey(request: Request): Promise<{ userId: string } | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const rawKey = authHeader.slice(7);
  if (!rawKey.startsWith("mk_")) return null;

  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const [key] = await db
    .select({ userId: apiKeys.userId })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (!key) return null;

  // Update last used timestamp (fire-and-forget)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.keyHash, keyHash))
    .catch(() => {});

  return { userId: key.userId };
}
