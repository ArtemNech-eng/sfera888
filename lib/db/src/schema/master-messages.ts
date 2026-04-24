import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const masterMessagesTable = pgTable("master_messages", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id").notNull(),
  telegramChatId: text("telegram_chat_id").notNull(),
  text: text("text").notNull(),
  fromMaster: boolean("from_master").notNull().default(true),
  senderName: text("sender_name"),
  isRead: boolean("is_read").notNull().default(false),
  photoUrl: text("photo_url"),
  telegramMessageId: integer("telegram_message_id"),
  maxMid: text("max_mid"),
  editedAt: timestamp("edited_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMasterMessageSchema = createInsertSchema(masterMessagesTable).omit({ id: true, createdAt: true });
export type InsertMasterMessage = z.infer<typeof insertMasterMessageSchema>;
export type MasterMessage = typeof masterMessagesTable.$inferSelect;
