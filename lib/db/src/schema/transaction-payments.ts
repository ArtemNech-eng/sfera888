import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { transactionsTable } from "./transactions";

export const transactionPaymentsTable = pgTable("transaction_payments", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull().references(() => transactionsTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  note: text("note"),
  paidAt: timestamp("paid_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type TransactionPayment = typeof transactionPaymentsTable.$inferSelect;
