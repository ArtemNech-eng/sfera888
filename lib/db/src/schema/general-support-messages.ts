import { pgTable, serial, text, boolean, timestamp, varchar } from "drizzle-orm/pg-core";

export const generalSupportMessagesTable = pgTable("general_support_messages", {
  id: serial("id").primaryKey(),
  clientPhone: varchar("client_phone", { length: 20 }).notNull(),
  clientName: text("client_name"),
  message: text("message").notNull(),
  fromClient: boolean("from_client").notNull().default(true),
  operatorName: text("operator_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  seenAt: timestamp("seen_at"),
});

export type GeneralSupportMessage = typeof generalSupportMessagesTable.$inferSelect;
