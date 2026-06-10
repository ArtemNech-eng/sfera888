import { pgTable, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mastersTable } from "./masters";

export const masterDepositsTable = pgTable("master_deposits", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id").notNull().references(() => mastersTable.id, { onDelete: "cascade" }),
  depositBalance: numeric("deposit_balance", { precision: 12, scale: 2 }).notNull().default("0"),
  recommendedAmount: integer("recommended_amount").notNull().default(10000),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMasterDepositSchema = createInsertSchema(masterDepositsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMasterDeposit = z.infer<typeof insertMasterDepositSchema>;
export type MasterDeposit = typeof masterDepositsTable.$inferSelect;
