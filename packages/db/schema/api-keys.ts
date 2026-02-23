import { pgTable, timestamp, uuid, varchar, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  keyHash: varchar("key_hash", { length: 64 }).notNull().unique(),
  prefix: varchar("prefix", { length: 12 }).notNull(), // mk_xxxx
  name: varchar("name", { length: 100 }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("ak_user_id_idx").on(table.userId),
  index("ak_key_hash_idx").on(table.keyHash),
]);
