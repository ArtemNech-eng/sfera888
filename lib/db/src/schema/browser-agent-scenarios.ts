import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const browserAgentScenariosTable = pgTable("browser_agent_scenarios", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  taskTemplate: text("task_template").notNull(),
  icon: text("icon").default("globe"),
  color: text("color").default("blue"),
  runCount: integer("run_count").notNull().default(0),
  lastRunAt: timestamp("last_run_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
