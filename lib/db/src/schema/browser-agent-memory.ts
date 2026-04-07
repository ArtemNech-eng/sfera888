import { pgTable, serial, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const browserAgentMemoryTable = pgTable("browser_agent_memory", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 200 }).notNull(),
  value: text("value").notNull(),
  context: varchar("context", { length: 200 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type BrowserAgentMemory = typeof browserAgentMemoryTable.$inferSelect;
