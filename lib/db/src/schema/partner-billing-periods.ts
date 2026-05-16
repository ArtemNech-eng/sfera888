import { pgTable, serial, integer, numeric, boolean, timestamp, date, varchar } from "drizzle-orm/pg-core";
import { trafficPartnersTable } from "./traffic-partners";

export const partnerBillingPeriodsTable = pgTable("partner_billing_periods", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => trafficPartnersTable.id),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  isFirstPeriod: boolean("is_first_period").notNull().default(false),
  daysInPeriod: integer("days_in_period").notNull(),
  leadsCount: integer("leads_count").notNull().default(0),
  validLeadsCount: integer("valid_leads_count").notNull().default(0),
  tokenSpentCount: integer("token_spent_count").notNull().default(0),
  fixedPct: numeric("fixed_pct", { precision: 5, scale: 4 }).notNull().default("0"),
  fixedSalaryBase: numeric("fixed_salary_base", { precision: 10, scale: 2 }).notNull().default("0"),
  fixedSalaryEarned: numeric("fixed_salary_earned", { precision: 10, scale: 2 }).notNull().default("0"),
  bonusPerLead: integer("bonus_per_lead").notNull().default(250),
  bonusEarned: numeric("bonus_earned", { precision: 10, scale: 2 }).notNull().default("0"),
  totalEarned: numeric("total_earned", { precision: 10, scale: 2 }).notNull().default("0"),
  status: varchar("status", { length: 50 }).notNull().default("calculating"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  paidAt: timestamp("paid_at"),
});

export type PartnerBillingPeriod = typeof partnerBillingPeriodsTable.$inferSelect;
export type InsertPartnerBillingPeriod = typeof partnerBillingPeriodsTable.$inferInsert;
