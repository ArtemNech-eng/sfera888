import { pgTable, serial, text, timestamp, integer, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const chatStageEnum = pgEnum("chat_stage", [
  "new",
  "processing",
  "deciding",
  "on_site",
  "completed",
  "cancelled",
]);

export const telegramChatsTable = pgTable("telegram_chats", {
  id: serial("id").primaryKey(),
  telegramChatId: text("telegram_chat_id").notNull().unique(),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  avatarUrl: text("avatar_url"),
  stage: chatStageEnum("stage").notNull().default("new"),
  assignedOperatorId: integer("assigned_operator_id"),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at"),
  unreadCount: integer("unread_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const telegramMessagesTable = pgTable("telegram_messages", {
  id: serial("id").primaryKey(),
  chatId: text("chat_id").notNull(),
  telegramMessageId: integer("telegram_message_id"),
  text: text("text").notNull(),
  fromBot: boolean("from_bot").notNull().default(false),
  senderName: text("sender_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTelegramChatSchema = createInsertSchema(telegramChatsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTelegramChat = z.infer<typeof insertTelegramChatSchema>;
export type TelegramChat = typeof telegramChatsTable.$inferSelect;

export const insertTelegramMessageSchema = createInsertSchema(telegramMessagesTable).omit({ id: true, createdAt: true });
export type InsertTelegramMessage = z.infer<typeof insertTelegramMessageSchema>;
export type TelegramMessage = typeof telegramMessagesTable.$inferSelect;
