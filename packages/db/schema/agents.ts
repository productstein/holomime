import { pgTable, text, boolean, timestamp, uuid, varchar, integer, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  handle: varchar("handle", { length: 50 }).notNull().unique(),
  description: text("description"),
  isPublic: boolean("is_public").notNull().default(false),
  currentVectorId: uuid("current_vector_id"),
  forkCount: integer("fork_count").notNull().default(0),
  forkedFromAgentId: uuid("forked_from_agent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("agents_user_id_idx").on(table.userId),
  index("agents_handle_idx").on(table.handle),
  index("agents_is_public_idx").on(table.isPublic),
]);
