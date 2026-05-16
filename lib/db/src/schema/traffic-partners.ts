import { pgTable, serial, integer, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const trafficPartnersTable = pgTable("traffic_partners", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  avitoAccountName: varchar("avito_account_name", { length: 255 }),
  avitoAccountLink: varchar("avito_account_link", { length: 500 }),
  notes: text("notes"),
  registeredAt: timestamp("registered_at").notNull().defaultNow(),
  firstLeadAt: timestamp("first_lead_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type TrafficPartner = typeof trafficPartnersTable.$inferSelect;
export type InsertTrafficPartner = typeof trafficPartnersTable.$inferInsert;
