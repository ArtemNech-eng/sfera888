import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { mastersTable } from "./masters";
import { ordersTable } from "./orders";

export const masterReviewsTable = pgTable("master_reviews", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id").notNull().references(() => mastersTable.id, { onDelete: "cascade" }),
  orderId: integer("order_id").references(() => ordersTable.id),
  sentiment: text("sentiment").notNull().default("neutral"), // "positive" | "negative" | "neutral"
  text: text("text").notNull(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MasterReview = typeof masterReviewsTable.$inferSelect;
