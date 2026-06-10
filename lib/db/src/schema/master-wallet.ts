import { pgTable, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mastersTable } from "./masters";

export const masterWalletTable = pgTable("master_wallet", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id").notNull().unique().references(() => mastersTable.id),
  tokensBalance: numeric("tokens_balance", { precision: 10, scale: 2 }).notNull().default("0"),
  totalTokensPurchased: numeric("total_tokens_purchased", { precision: 10, scale: 2 }).notNull().default("0"),
  totalTokensSpent: numeric("total_tokens_spent", { precision: 10, scale: 2 }).notNull().default("0"),
  totalTokensRefunded: numeric("total_tokens_refunded", { precision: 10, scale: 2 }).notNull().default("0"),
  totalRubSpent: integer("total_rub_spent").notNull().default(0),
  // DEPRECATED: token system — поля оставлены для истории
  creditTokensIssued: numeric("credit_tokens_issued", { precision: 10, scale: 2 }).notNull().default("0"),
  creditTokensSpent: numeric("credit_tokens_spent", { precision: 10, scale: 2 }).notNull().default("0"),
  creditLimitTokens: numeric("credit_limit_tokens", { precision: 10, scale: 2 }).notNull().default("0"),
  // NEW: ruble balance (commission model)
  balance: numeric("balance", { precision: 10, scale: 2 }).notNull().default("0"),
  creditLimit: numeric("credit_limit", { precision: 10, scale: 2 }).notNull().default("0"),
  totalServiceFeesSpent: numeric("total_service_fees_spent", { precision: 10, scale: 2 }).notNull().default("0"),
  totalTopups: numeric("total_topups", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMasterWalletSchema = createInsertSchema(masterWalletTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMasterWallet = z.infer<typeof insertMasterWalletSchema>;
export type MasterWallet = typeof masterWalletTable.$inferSelect;
