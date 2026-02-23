import { pgTable, timestamp, uuid, varchar, jsonb, index } from "drizzle-orm/pg-core";
import { agents } from "./agents";

export const telemetryEvents = pgTable("telemetry_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("te_agent_id_idx").on(table.agentId),
  index("te_event_type_idx").on(table.eventType),
  index("te_created_at_idx").on(table.createdAt),
]);
