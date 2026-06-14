import { pgTable, serial, text, timestamp, numeric, integer, boolean, pgEnum, jsonb, varchar } from "drizzle-orm/pg-core";
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
  totalLeadsReceived: integer("total_leads_received").notNull().default(0),
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
  maxChatId: text("max_chat_id"),
  servicePrices: jsonb("service_prices").$type<{ service: string; priceFrom: number }[]>(),
  suspendedAt: timestamp("suspended_at"),
  suspensionReason: text("suspension_reason"),
  fomoDisabled: boolean("fomo_disabled").notNull().default(false),
  maxActiveOrders: integer("max_active_orders").notNull().default(1),
  // ── Репутация: счётчик подряд отменённых заказов ──────────────────────────
  // 0 = активный, 1 = «последний шанс» (жёлтый бейдж), >=2 = автоблок.
  // Любой выполненный заказ сбрасывает счётчик в 0.
  consecutiveCancellations: integer("consecutive_cancellations").notNull().default(0),
  blockedFromOrders: boolean("blocked_from_orders").notNull().default(false),
  blockedAt: timestamp("blocked_at"),
  blockedReason: text("blocked_reason"),
  lastCancelAt: timestamp("last_cancel_at"),
  lastCompletedAt: timestamp("last_completed_at"),
  // Сколько раз оператор вручную снимал автоблок с этого мастера. Растёт при каждом
  // unblockMaster(). Если значение >=2 — рецидивист, оператор должен подумать,
  // прежде чем снимать блок снова.
  manualUnblocksCount: integer("manual_unblocks_count").notNull().default(0),

  // ── Marketplace publication fields (added in 0005_marketplace_baseline) ────
  // Все nullable / safe-default чтобы существующий CRM/PWA-код не сломался.
  // slug генерируется при публикации мастера через CRM, не на старте.
  slug: varchar("slug", { length: 100 }).unique("masters_slug_key"),
  isPublished: boolean("is_published").notNull().default(false),
  publishedAt: timestamp("published_at"),
  publicTitle: varchar("public_title", { length: 150 }),
  publicBio: text("public_bio"),
  seoTitle: varchar("seo_title", { length: 70 }),
  seoDescription: varchar("seo_description", { length: 180 }),
  yearsExperience: integer("years_experience"),
  publicRating: numeric("public_rating", { precision: 3, scale: 2 }),
  publicReviewsCount: integer("public_reviews_count").notNull().default(0),
});

export const REPUTATION_BLOCK_THRESHOLD = 2;

export const insertMasterSchema = createInsertSchema(mastersTable).omit({ id: true, createdAt: true });
export type InsertMaster = z.infer<typeof insertMasterSchema>;
export type Master = typeof mastersTable.$inferSelect;
