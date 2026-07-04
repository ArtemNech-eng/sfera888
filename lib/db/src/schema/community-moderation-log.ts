import { pgTable, serial, varchar, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * `community_moderation_log` — журнал модерационных действий с указанием причины
 * и идентификатора модератора (Requirement 19.4). `moderator_id = NULL` означает
 * автоматическое действие.
 *
 * `target_id` — обобщённая ссылка (thread/account) без жёсткого FK, чтобы журнал
 * переживал удаление цели и покрывал разные типы объектов.
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (migration 2026-01-20-community-baseline)
 */
export const communityModerationLogTable = pgTable(
  "community_moderation_log",
  {
    id: serial("id").primaryKey(),
    /** `thread` | `account`. */
    targetType: varchar("target_type", { length: 20 }).notNull(),
    targetId: integer("target_id").notNull(),
    /** `block` | `hide` | `move_protected` | `queue` | … */
    action: varchar("action", { length: 24 }).notNull(),
    reason: text("reason"),
    /** NULL = автоматическое действие; иначе id модератора (Requirement 19.4). */
    moderatorId: integer("moderator_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    targetIdx: index("community_moderation_log_target_idx").on(t.targetType, t.targetId),
  }),
);

export const insertCommunityModerationLogSchema = createInsertSchema(
  communityModerationLogTable,
).omit({ id: true, createdAt: true });
export type InsertCommunityModerationLog = z.infer<typeof insertCommunityModerationLogSchema>;
export type CommunityModerationLog = typeof communityModerationLogTable.$inferSelect;
