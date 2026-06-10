import { pgTable, serial, text, timestamp, numeric, pgEnum, index, integer, boolean, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "processing",
  "sent_to_work",
  "non_target",
  "client_refusal",
]);

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  clientName: text("client_name").notNull(),
  clientPhone: text("client_phone").notNull(),
  city: text("city").notNull(),
  district: text("district").notNull(),
  serviceType: text("service_type").notNull(),
  area: numeric("area", { precision: 10, scale: 2 }).notNull(),
  services: text("services"),
  scheduledAt: timestamp("scheduled_at"),
  comment: text("comment"),
  photos: text("photos"),
  source: text("source"),
  avitoItemId: text("avito_item_id"),
  avitoItemTitle: text("avito_item_title"),
  status: leadStatusEnum("status").notNull().default("new"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
  cancellationReason: text("cancellation_reason"),
  statusUpdatedAt: timestamp("status_updated_at"),
  trafficPartnerId: integer("traffic_partner_id"),
  leadChannel: varchar("lead_channel", { length: 100 }).default("avito_partner"),
  isPossibleDuplicate: boolean("is_possible_duplicate").default(false),
  partnerLeadStatus: varchar("partner_lead_status", { length: 50 }),
  partnerRejectionReason: varchar("partner_rejection_reason", { length: 500 }),
  paymentModel: varchar("payment_model", { length: 50 }).notNull().default("commission"),
}, (t) => ({
  // Поддержка частых выборок: задачи "Что делать сейчас", лента активных заявок,
  // быстрый поиск по телефону при создании заявки.
  statusActiveIdx: index("leads_status_active_idx").on(t.status, t.deletedAt, t.createdAt),
  phoneIdx: index("leads_phone_idx").on(t.clientPhone),
}));

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
