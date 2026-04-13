import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AvitoSettings = typeof avitoSettingsTable.$inferSelect;
