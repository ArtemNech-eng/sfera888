import {
  pgTable,
  serial,
  varchar,
  integer,
  text,
  boolean,
  timestamp,
  numeric,
  jsonb,
  uuid,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { citiesTable } from "./settings";
import { leadsTable } from "./leads";

/**
 * `designs` — полноценный AI-дизайн-проект интерьера (план §22, AI-designer
 * spec). Архитектура — production от старта (см. `.kiro/specs/ai-designer`):
 *
 *   • Один дизайн = одна страница `/dizajn/{slug}` (SEO landing).
 *   • Генерация: 4 view-render'а (Fal.ai img2img) + GPT-артефакты
 *     (materials/estimate/solutions) + algorithmic color palette + SVG floor
 *     plan (программно, не AI).
 *   • Async worker — POST `/api/dizajn/generate` создаёт запись со status
 *     `generating`, фоновый воркер процессит, клиент пуллит GET `/:slug`.
 *
 * Анонимные пользователи: владение через `anon_id` (UUID v4 в cookie
 * `kiro_anon_id`). Auto-claim к `user_id` после login — отдельный спек.
 */

/**
 * Структура JSONB-артефактов дизайн-проекта. Типы строго фиксированы для
 * консистентности между API/UI/SEO.
 */

export interface DesignMaterial {
  category: string; // "Стены", "Пол", "Потолок", ...
  description: string; // "Краска интерьерная, матовая"
}

export interface DesignEstimateItem {
  category: string; // "Отделочные материалы", "Мебель", "Освещение"
  amountKopeks: number; // 5500000 = 55 000 ₽
}

export interface DesignSolution {
  text: string; // "Функциональная планировка с рабочим местом у окна"
}

export interface DesignColorSwatch {
  hex: string; // "#E8DFD0"
  name?: string | null; // "Бежевый тёплый" — опционально
}

/** Один из 4 ракурсов проекта (общий вид / акцент / хранение / окно). */
export interface DesignView {
  url: string;             // Public R2 URL
  label: string;           // "Общий вид от входа"
  position: number;        // 1..4 для устойчивого порядка
}

/** Один из 6 крупных планов (мебель/детали), вырезанных из ракурсов. */
export interface DesignDetailCrop {
  url: string;             // Public R2 URL
  label: string;           // "Кровать с мягким изголовьем"
  fromView?: number | null; // position ракурса-источника (для трассировки)
}

export const designsTable = pgTable(
  "designs",
  {
    id: serial("id").primaryKey(),
    /** SEO-slug для public URL `/dizajn/{slug}`. */
    slug: varchar("slug", { length: 160 }).unique("designs_slug_key"),

    /** Владельцы (хотя бы один из anon_id / clientPhoneHash / userId-when-impl). */
    anonId: uuid("anon_id"),
    clientPhoneHash: varchar("client_phone_hash", { length: 64 }),

    /** Параметры дизайн-проекта. */
    roomType: varchar("room_type", { length: 50 }).notNull(),
    style: varchar("style", { length: 50 }).notNull(),
    cityId: integer("city_id").references(() => citiesTable.id, { onDelete: "set null" }),
    district: varchar("district", { length: 100 }),
    /** м². */
    area: numeric("area", { precision: 10, scale: 2 }),
    /** Бюджет проекта, ₽ (не копейки). */
    budget: integer("budget"),
    /** Сроки реализации, в неделях. */
    durationWeeks: integer("duration_weeks"),

    /** Изображение пользователя (фото комнаты «до»). */
    inputImageUrl: text("input_image_url"),
    /** Главный AI-render (hero, для og-image и feed thumbnail). */
    resultImageUrl: text("result_image_url"),

    /**
     * Структурированные артефакты дизайн-проекта (генерируются GPT-4o-mini
     * по {room, style, area, budget}). NULL пока status='generating'.
     */
    materials: jsonb("materials").$type<DesignMaterial[]>(),
    estimate: jsonb("estimate").$type<DesignEstimateItem[]>(),
    solutions: jsonb("solutions").$type<DesignSolution[]>(),
    colorPalette: jsonb("color_palette").$type<DesignColorSwatch[]>(),

    /** 4 ракурса проекта (общий / акцент / хранение / окно). resultImageUrl — это `views[0]`. */
    views: jsonb("views").$type<DesignView[]>(),
    /** 6 деталей мебели — кропы из ракурсов через sharp (server-side). */
    detailCrops: jsonb("detail_crops").$type<DesignDetailCrop[]>(),

    /**
     * Status convention (validated в коде, без PG enum):
     *   draft        — черновик (форма не submit'нута; пока не используется)
     *   generating   — pending в воркере (Fal.ai/GPT calls in progress)
     *   completed    — готов, все артефакты заполнены
     *   failed       — генерация упала (см. error_message)
     *   private      — пользователь скрыл с публичной страницы (после auth)
     */
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    errorMessage: text("error_message"),

    /** Публичность — для индексации в каталоге `/dizajn/{room}-{style}` и sitemap. */
    isPublic: boolean("is_public").notNull().default(false),
    publicConsentAt: timestamp("public_consent_at"),

    /** SEO-метаданные (генерируются GPT в worker'е). */
    seoTitle: varchar("seo_title", { length: 120 }),
    seoDescription: varchar("seo_description", { length: 220 }),
    h1: varchar("h1", { length: 160 }),
    description: text("description"),

    /** Оценка стоимости от-до (ID-индексируется в SEO-aggregate). */
    estimatedPriceFrom: numeric("estimated_price_from", { precision: 10, scale: 2 }),
    estimatedPriceTo: numeric("estimated_price_to", { precision: 10, scale: 2 }),

    /** Engagement counters. */
    viewCount: integer("view_count").notNull().default(0),
    saveCount: integer("save_count").notNull().default(0),

    /** Lead-связка (если пользователь кликнул «Хочу такой же»). */
    leadId: integer("lead_id").references((): AnyPgColumn => leadsTable.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    publicStatusIdx: index("designs_public_status_idx").on(t.isPublic, t.status),
    cityRoomStyleIdx: index("designs_city_room_style_idx").on(t.cityId, t.roomType, t.style),
    anonIdIdx: index("designs_anon_id_idx")
      .on(t.anonId, t.createdAt)
      .where(sql`${t.anonId} IS NOT NULL`),
    statusPendingIdx: index("designs_status_pending_idx")
      .on(t.status, t.createdAt)
      .where(sql`${t.status} = 'generating'`),
    publicRecentIdx: index("designs_public_recent_idx")
      .on(t.createdAt)
      .where(sql`${t.isPublic} = true AND ${t.status} = 'completed'`),
  }),
);

export const insertDesignSchema = createInsertSchema(designsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDesign = z.infer<typeof insertDesignSchema>;
export type Design = typeof designsTable.$inferSelect;
