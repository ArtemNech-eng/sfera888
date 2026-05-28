import { pgTable, serial, integer, varchar, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mastersTable } from "./masters";

export const masterActivePackagesTable = pgTable("master_active_packages", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id").notNull().references(() => mastersTable.id),
  packageType: varchar("package_type", { length: 20 }).notNull().default("paid"),
  tokensTotal: numeric("tokens_total", { precision: 10, scale: 2 }).notNull().default("0"),
  tokensRemaining: numeric("tokens_remaining", { precision: 10, scale: 2 }).notNull().default("0"),
  expiresAt: timestamp("expires_at").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  isDebtPaid: boolean("is_debt_paid").notNull().default(true),
  transactionId: integer("transaction_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertMasterActivePackageSchema = createInsertSchema(masterActivePackagesTable)
  .omit({ id: true, createdAt: true, updatedAt: true });

export type InsertMasterActivePackage = z.infer<typeof insertMasterActivePackageSchema>;
export type MasterActivePackage = typeof masterActivePackagesTable.$inferSelect;
