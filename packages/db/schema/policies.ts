import { pgTable, timestamp, uuid, varchar, jsonb, primaryKey, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { personalityVectors } from "./personality-vectors";

export const policyDocuments = pgTable("policy_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  rules: jsonb("rules").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("pd_user_id_idx").on(table.userId),
]);

export const vectorPolicies = pgTable("vector_policies", {
  vectorId: uuid("vector_id").notNull().references(() => personalityVectors.id, { onDelete: "cascade" }),
  policyId: uuid("policy_id").notNull().references(() => policyDocuments.id, { onDelete: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.vectorId, table.policyId] }),
]);
