import { pgTable, serial, varchar, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { communityAccountsTable } from "./community-accounts";

/**
 * `specialties` — профессиональные специальности мастеров (плиточник, электрик,
 * маляр …). Каждая Specialty определяет тематическое сообщество в PRO_Zone
 * (Requirement 6.1). Публичный slug используется для URL `/pro/{specialtySlug}`.
 *
 * Spec: .kiro/specs/hochu-takzhe-community/ (migration 2026-01-20-community-baseline)
 */
export const specialtiesTable = pgTable("specialties", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique("specialties_slug_key"),
  name: varchar("name", { length: 100 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * `pro_memberships` — членство аккаунта в PRO-сообществе. Доступ к
 * PRO_Protected_Layer (чувствительный контент) предоставляется только при
 * `verified = true` (Requirement 7.1, 7.2).
 */
export const proMembershipsTable = pgTable(
  "pro_memberships",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id")
      .notNull()
      .references(() => communityAccountsTable.id, { onDelete: "cascade" }),
    specialtyId: integer("specialty_id").references(() => specialtiesTable.id, {
      onDelete: "set null",
    }),
    verified: boolean("verified").notNull().default(false),
    verifiedAt: timestamp("verified_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    accountIdx: index("pro_memberships_account_idx").on(t.accountId),
    specialtyIdx: index("pro_memberships_specialty_idx").on(t.specialtyId),
  }),
);

export const insertSpecialtySchema = createInsertSchema(specialtiesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSpecialty = z.infer<typeof insertSpecialtySchema>;
export type Specialty = typeof specialtiesTable.$inferSelect;

export const insertProMembershipSchema = createInsertSchema(proMembershipsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertProMembership = z.infer<typeof insertProMembershipSchema>;
export type ProMembership = typeof proMembershipsTable.$inferSelect;
