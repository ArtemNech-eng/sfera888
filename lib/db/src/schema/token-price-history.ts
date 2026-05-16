import { pgTable, serial, varchar, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tokenPriceHistoryTable = pgTable("token_price_history", {
  id: serial("id").primaryKey(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: integer("entity_id").notNull(),
  fieldName: varchar("field_name", { length: 100 }).notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: varchar("changed_by", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTokenPriceHistorySchema = createInsertSchema(tokenPriceHistoryTable).omit({ id: true, createdAt: true });
export type InsertTokenPriceHistory = z.infer<typeof insertTokenPriceHistorySchema>;
export type TokenPriceHistory = typeof tokenPriceHistoryTable.$inferSelect;
