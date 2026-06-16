import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { designsTable } from "./designs";

/**
 * design_generations — журнал вызовов внешних AI-провайдеров.
 *
 * Одна запись = один call к Recraft/Fal.ai/whatever. Хранит prompt, выбранный
 * стиль/помещение, сырой ответ провайдера (jsonb), стоимость в копейках и
 * статус (`pending` / `success` / `failed`).
 *
 * Связь с `designs` через `design_id` сделана с `ON DELETE SET NULL`, чтобы
 * при удалении дизайна история генераций оставалась для биллинга / аудита.
 *
 * До подключения провайдера таблица пуста и только хранит схему.
 */
export const designGenerationsTable = pgTable(
  "design_generations",
  {
    id: serial("id").primaryKey(),
    designId: integer("design_id").references(() => designsTable.id, {
      onDelete: "set null",
    }),
    provider: varchar("provider", { length: 50 }).notNull(),
    model: varchar("model", { length: 100 }),
    prompt: text("prompt"),
    roomType: varchar("room_type", { length: 50 }),
    style: varchar("style", { length: 50 }),
    // Status convention (validated at application layer):
    //   pending / success / failed
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    costKopeks: integer("cost_kopeks"),
    errorMessage: text("error_message"),
    providerResponse: jsonb("provider_response"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (t) => ({
    designStatusIdx: index("design_generations_design_status_idx").on(t.designId, t.status),
  }),
);

export const insertDesignGenerationSchema = createInsertSchema(designGenerationsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertDesignGeneration = z.infer<typeof insertDesignGenerationSchema>;
export type DesignGeneration = typeof designGenerationsTable.$inferSelect;
