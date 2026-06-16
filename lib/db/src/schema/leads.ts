import { pgTable, serial, text, timestamp, numeric, pgEnum, index, integer, boolean, varchar, jsonb, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mastersTable } from "./masters";
import { designsTable } from "./designs";

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

  // ── Marketplace source-tracking fields (added in 0005_marketplace_baseline) ─
  // Все nullable, не ломают существующий /api/landing/leads и старый CRM-flow.
  // source (text) уже существует — туда пишем 'marketplace' для лидов с публичной
  // площадки. Enum не вводим, чтобы не делать invasive миграцию.
  sourcePageUrl: text("source_page_url"),
  sourcePageType: varchar("source_page_type", { length: 40 }),
  serviceSlug: varchar("service_slug", { length: 100 }),
  citySlug: varchar("city_slug", { length: 100 }),
  marketplaceContext: jsonb("marketplace_context"),
  referrer: text("referrer"),
  utmSource: varchar("utm_source", { length: 100 }),
  utmMedium: varchar("utm_medium", { length: 100 }),
  utmCampaign: varchar("utm_campaign", { length: 100 }),
  utmTerm: varchar("utm_term", { length: 200 }),
  utmContent: varchar("utm_content", { length: 200 }),
  attachedMasterId: integer("attached_master_id").references(() => mastersTable.id, { onDelete: "set null" }),
  clientIp: varchar("client_ip", { length: 45 }),
  clientUserAgent: text("client_user_agent"),
  consentGivenAt: timestamp("consent_given_at"),
  captchaScore: numeric("captcha_score", { precision: 3, scale: 2 }),

  // ── AI-designer foundation (added in 0006_designs_baseline) ───────────────
  // FK with ON DELETE SET NULL — leads survive when their originating design
  // is removed, but the link is dropped. Lambda reference breaks the
  // leads ⇄ designs import cycle.
  designId: integer("design_id").references((): AnyPgColumn => designsTable.id, { onDelete: "set null" }),
}, (t) => ({
  // Поддержка частых выборок: задачи "Что делать сейчас", лента активных заявок,
  // быстрый поиск по телефону при создании заявки.
  statusActiveIdx: index("leads_status_active_idx").on(t.status, t.deletedAt, t.createdAt),
  phoneIdx: index("leads_phone_idx").on(t.clientPhone),
  // Marketplace lookups: фильтр в CRM по источнику + быстрый поиск лидов,
  // привязанных к конкретному мастеру (заявка с карточки мастера).
  sourceMarketplaceIdx: index("leads_source_marketplace_idx").on(t.source),
  attachedMasterIdx: index("leads_attached_master_idx").on(t.attachedMasterId),
}));

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
