import { pgTable, serial, text, timestamp, numeric, pgEnum } from "drizzle-orm/pg-core";
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
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
