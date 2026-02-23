import { pgTable, timestamp, uuid, integer, jsonb, varchar, index } from "drizzle-orm/pg-core";
import { agents } from "./agents";

export const personalityVectors = pgTable("personality_vectors", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  traits: jsonb("traits").notNull(),        // PersonalityTraits (12 dimensions)
  facets: jsonb("facets").notNull().default({}),
  signatures: jsonb("signatures").notNull().default({}),
  preferences: jsonb("preferences").notNull().default({}),
  hash: varchar("hash", { length: 64 }).notNull().unique(),
  parentVectorId: uuid("parent_vector_id"),  // Fork source
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("pv_agent_id_idx").on(table.agentId),
  index("pv_agent_version_idx").on(table.agentId, table.version),
  index("pv_hash_idx").on(table.hash),
]);
