import { pgTable, serial, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mastersTable } from "./masters";
import { usersTable } from "./users";

export const masterMessagesTable = pgTable("master_messages", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id").notNull().references(() => mastersTable.id, { onDelete: "cascade" }),
  telegramChatId: text("telegram_chat_id").notNull(),
  text: text("text").notNull(),
  fromMaster: boolean("from_master").notNull().default(true),
  senderName: text("sender_name"),
  isRead: boolean("is_read").notNull().default(false),
  photoUrl: text("photo_url"),
  telegramMessageId: integer("telegram_message_id"),
  maxMid: text("max_mid"),
  editedAt: timestamp("edited_at"),
  updatedByUserId: integer("updated_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  // Индексы для частых запросов:
  // 1) Получение всех сообщений мастера (чат)
  masterIdIdx: index("master_messages_master_id_idx").on(t.masterId),
  // 2) Подсчёт непрочитанных сообщений от мастеров (CRM)
  fromMasterReadIdx: index("master_messages_from_master_read_idx").on(t.fromMaster, t.isRead),
  // 3) Сортировка по дате создания (лента чатов)
  createdAtIdx: index("master_messages_created_at_idx").on(t.createdAt),
  // 4) Поиск по telegramChatId (для интеграций)
  telegramChatIdIdx: index("master_messages_telegram_chat_id_idx").on(t.telegramChatId),
}));

export const insertMasterMessageSchema = createInsertSchema(masterMessagesTable).omit({ id: true, createdAt: true });
export type InsertMasterMessage = z.infer<typeof insertMasterMessageSchema>;
export type MasterMessage = typeof masterMessagesTable.$inferSelect;
