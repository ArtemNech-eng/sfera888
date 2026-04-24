import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const avitoSettingsTable = pgTable("avito_settings", {
  id: serial("id").primaryKey(),
  clientId: text("client_id"),
  clientSecret: text("client_secret"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  avitoUserId: text("avito_user_id"),
  avitoUserName: text("avito_user_name"),
  authType: text("auth_type").default("client_credentials"), // "client_credentials" | "oauth_code"
  enabled: boolean("enabled").notNull().default(false),
  // Manual advance balance (rubles) — Avito API does not expose аванс via public API
  advanceBalance: integer("advance_balance").default(0),
  advanceBalanceUpdatedAt: timestamp("advance_balance_updated_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AvitoSettings = typeof avitoSettingsTable.$inferSelect;
