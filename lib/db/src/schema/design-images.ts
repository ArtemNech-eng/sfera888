import {
  pgTable,
  serial,
  integer,
  text,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { designsTable } from "./designs";

/**
 * design_images — все картинки, привязанные к одному дизайну.
 *
 * `type` принимает `input` (исходное фото клиента), `result` (сгенерированный
 * AI-вариант) и `thumbnail` (превью для каталога /dizajn). Размеры и порядок
 * управляются полями `width` / `height` / `sort_order` для будущего адаптивного
 * рендера (`<picture>` / `srcset`).
 *
 * `ON DELETE CASCADE` от designs — при удалении дизайна сразу удаляются все
 * его картинки. Storage cleanup (R2 / S3 / blob) — ответственность отдельного
 * скрипта, не БД.
 */
export const designImagesTable = pgTable(
  "design_images",
  {
    id: serial("id").primaryKey(),
    designId: integer("design_id")
      .notNull()
      .references(() => designsTable.id, { onDelete: "cascade" }),
    // Type convention (validated at application layer):
    //   input / result / thumbnail
    type: varchar("type", { length: 30 }).notNull(),
    url: text("url").notNull(),
    width: integer("width"),
    height: integer("height"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    designTypeIdx: index("design_images_design_type_idx").on(t.designId, t.type),
  }),
);

export const insertDesignImageSchema = createInsertSchema(designImagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertDesignImage = z.infer<typeof insertDesignImageSchema>;
export type DesignImage = typeof designImagesTable.$inferSelect;
