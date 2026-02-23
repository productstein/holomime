import { pgTable, timestamp, uuid, varchar, text, index } from "drizzle-orm/pg-core";
import { agents } from "./agents";
import { personalityVectors } from "./personality-vectors";

export const agentAvatars = pgTable("agent_avatars", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  vectorId: uuid("vector_id").notNull().references(() => personalityVectors.id, { onDelete: "cascade" }),
  svgData: text("svg_data").notNull(),
  style: varchar("style", { length: 20 }).notNull().default("pixel"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("aa_agent_id_idx").on(table.agentId),
]);
