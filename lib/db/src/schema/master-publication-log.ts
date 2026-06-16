/**
 * Audit-trail for master profile publication actions.
 *
 * Captures every publish / unpublish / public-fields edit performed either
 * by the master themselves (self-service from PWA) or by an operator
 * (CRM-override). Used for:
 *
 *   - replaying who unpublished a profile after a complaint;
 *   - identifying VIP-publish overrides that bypassed auto-moderation;
 *   - producing the «Публикация» history tab in CRM master drawer;
 *   - Yandex Webmaster compliance — proves we have moderation pipeline.
 *
 * See MARKETPLACE_PRODUCTION_PLAN.md §11.5 for action codes.
 */

import { pgTable, serial, integer, text, timestamp, varchar, jsonb } from "drizzle-orm/pg-core";
import { mastersTable } from "./masters";

export const masterPublicationLogTable = pgTable("master_publication_log", {
  id: serial("id").primaryKey(),
  masterId: integer("master_id")
    .notNull()
    .references(() => mastersTable.id, { onDelete: "cascade" }),

  /** "master" — self-service из PWA, "operator" — CRM-override */
  actor: varchar("actor", { length: 20 }).notNull(),

  /**
   * Идентификатор актора. Для actor='master' это `masters.id` (тот же что
   * masterId). Для actor='operator' это `users.id` оператора. Nullable на
   * случай системных событий (cron/migration) — заполняется опционально.
   */
  actorId: integer("actor_id"),

  /**
   * Машинный код действия. Список см. §11.5:
   *   publish              — self-service публикация после автомодерации
   *   unpublish            — self-service unpublish
   *   publish_override     — CRM-override без автомодерации (VIP)
   *   unpublish_complaint  — оператор разопубликовал по жалобе
   *   edit_public_fields   — оператор отредактировал publicTitle/publicBio за мастера
   *   automoderation_block — попытка publish заблокирована автомодерацией
   */
  action: varchar("action", { length: 40 }).notNull(),

  /** Обязателен для override и unpublish_complaint. Опционален для publish/unpublish. */
  reason: text("reason"),

  /**
   * Для action='edit_public_fields' — JSON `{ field: { from, to } }`.
   * Для action='automoderation_block' — JSON `{ errors: [{code,message,field}] }`.
   * Для других action — обычно null.
   */
  changes: jsonb("changes"),

  /** IP актора. Нужен для аудита (комплаенс) и поиска злоупотреблений. */
  ip: varchar("ip", { length: 45 }),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type MasterPublicationLog = typeof masterPublicationLogTable.$inferSelect;
export type InsertMasterPublicationLog = typeof masterPublicationLogTable.$inferInsert;
