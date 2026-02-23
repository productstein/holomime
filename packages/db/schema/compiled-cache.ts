import { pgTable, timestamp, varchar, jsonb, primaryKey } from "drizzle-orm/pg-core";

export const compiledCache = pgTable("compiled_cache", {
  cacheKey: varchar("cache_key", { length: 255 }).primaryKey(), // vectorHash:provider:surface
  vectorHash: varchar("vector_hash", { length: 64 }).notNull(),
  provider: varchar("provider", { length: 50 }).notNull(),
  surface: varchar("surface", { length: 50 }).notNull(),
  compiledConfig: jsonb("compiled_config").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});
