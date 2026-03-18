import { pgTable, serial, text, timestamp, numeric, integer, boolean, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const masterStatusEnum = pgEnum("master_status", ["active", "suspended", "inactive", "pending_contract"]);

export const mastersTable = pgTable("masters", {
  id: serial("id").primaryKey(),
  alias: text("alias").notNull(),
  city: text("city").notNull(),
  specialization: text("specialization").notNull(),
  specializations: text("specializations").array().notNull().default([]),
  telegramId: text("telegram_id"),
  phone: text("phone"),
  status: masterStatusEnum("status").notNull().default("active"),
  rating: numeric("rating", { precision: 3, scale: 2 }).notNull().default("3.0"),
  totalOrders: integer("total_orders").notNull().default(0),
  acceptedOrders: integer("accepted_orders").notNull().default(0),
  avgResponseTime: numeric("avg_response_time", { precision: 10, scale: 2 }),
  debt: numeric("debt", { precision: 12, scale: 2 }).notNull().default("0"),
  voronkaColumnId: integer("voronka_column_id"),
  isTestMaster: boolean("is_test_master").notNull().default(true),
  tags: text("tags").array().notNull().default([]),
  customAvatarUrl: text("custom_avatar_url"),
  contractLink: text("contract_link"),
  pwaLogin: text("pwa_login"),
  pwaPasswordHash: text("pwa_password_hash"),
  workingHours: jsonb("working_hours"),
  preferredDistricts: text("preferred_districts").array().notNull().default([]),
  minArea: integer("min_area").notNull().default(0),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  contractSignedAt: timestamp("contract_signed_at"),
  contractSignIp: text("contract_sign_ip"),
  passportPhotoUrl: text("passport_photo_url"),
  passportRegPhotoUrl: text("passport_reg_photo_url"),
  passportVerified: boolean("passport_verified").notNull().default(false),
  passportVerifyNote: text("passport_verify_note"),
  contractFullName: text("contract_full_name"),
  contractPassportNumber: text("contract_passport_number"),
  contractPassportDate: text("contract_passport_date"),
  contractPassportIssuer: text("contract_passport_issuer"),
  contractAddress: text("contract_address"),
  lastSeenAt: timestamp("last_seen_at"),
});

export const insertMasterSchema = createInsertSchema(mastersTable).omit({ id: true, createdAt: true });
export type InsertMaster = z.infer<typeof insertMasterSchema>;
export type Master = typeof mastersTable.$inferSelect;
