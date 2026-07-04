import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  varchar,
  timestamp,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { communityThreadsTable } from "./community-threads";
import { communityAccountsTable } from "./community-accounts";

/**
 * `community_comments` — комментарии (ответы) к темам сообщества. Реализуют
 * форум-модель «тема → обсуждение»: под каждой темой (`community_threads`)
 * растёт дерево комментариев с необязательной вложенностью через
 * `parent_comment_id` (self-reference).
 *
 *   • `thread_id`         — тема, к которой относится комментарий.
 *   • `parent_comment_id` — родительский комментарий (NULL = верхний уровень).
 *   • `visibility`        — `public` | `hidden` (гейт видимости в лентах/дереве).
 *   • `moderation_status` — НЕ гейт видимости (постмодерация, как у тем).
 *   • `is_seeded`         — демо/сид-комментарий (для наполнения и имитации).
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (расширение форум-слоя).
 */
export const communityCommentsTable = pgTable(
  "community_comments",
  {
    id: serial("id").primaryKey(),
    threadId: integer("thread_id")
      .notNull()
      .references(() => communityThreadsTable.id, { onDelete: "cascade" }),
    parentCommentId: integer("parent_comment_id").references(
      (): AnyPgColumn => communityCommentsTable.id,
      { onDelete: "cascade" },
    ),
    authorAccountId: integer("author_account_id").references(
      () => communityAccountsTable.id,
      { onDelete: "set null" },
    ),
    body: text("body").notNull(),
    isSeeded: boolean("is_seeded").notNull().default(false),
    visibility: varchar("visibility", { length: 12 }).notNull().default("public"),
    moderationStatus: varchar("moderation_status", { length: 16 })
      .notNull()
      .default("not_screened"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    threadCreatedIdx: index("community_comments_thread_created_idx").on(t.threadId, t.createdAt),
    parentIdx: index("community_comments_parent_idx").on(t.parentCommentId),
  }),
);

export const insertCommunityCommentSchema = createInsertSchema(communityCommentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCommunityComment = z.infer<typeof insertCommunityCommentSchema>;
export type CommunityComment = typeof communityCommentsTable.$inferSelect;
