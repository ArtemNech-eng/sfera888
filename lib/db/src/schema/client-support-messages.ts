import { pgTable, serial, text, boolean, timestamp, varchar } from "drizzle-orm/pg-core";

export const clientSupportMessagesTable = pgTable("client_support_messages", {
  id: serial("id").primaryKey(),
  receiptToken: varchar("receipt_token", { length: 64 }).notNull(),
  message: text("message").notNull(),
  fromClient: boolean("from_client").notNull().default(true),
  operatorName: text("operator_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  seenAt: timestamp("seen_at"),
});

export type ClientSupportMessage = typeof clientSupportMessagesTable.$inferSelect;
