import { pgTable, timestamp, uuid, varchar, jsonb, boolean, real, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { personalityVectors } from "./personality-vectors";

export const evalSuites = pgTable("eval_suites", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  name: varchar("name", { length: 200 }).notNull(),
  description: varchar("description", { length: 500 }),
  scenarios: jsonb("scenarios").notNull().default([]),
  isBuiltIn: boolean("is_built_in").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evalRuns = pgTable("eval_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  suiteId: uuid("suite_id").notNull().references(() => evalSuites.id, { onDelete: "cascade" }),
  vectorId: uuid("vector_id").notNull().references(() => personalityVectors.id, { onDelete: "cascade" }),
  results: jsonb("results").notNull().default([]),
  overallScore: real("overall_score"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  index("er_suite_id_idx").on(table.suiteId),
  index("er_vector_id_idx").on(table.vectorId),
  index("er_status_idx").on(table.status),
]);
