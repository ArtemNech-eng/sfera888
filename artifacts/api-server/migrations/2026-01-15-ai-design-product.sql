-- Migration: AI_Design_Product foundation
-- Spec: .kiro/specs/ai-design-product/
-- Requirements: 5.2, 6.4, 8.6, 10.1, 10.6, 11.1, 11.4, 13.5, 3.3, 3.4
--
-- Расширяет существующие таблицы (designs, cities) новыми полями для
-- пайплайна AI-дизайна и создаёт три новые таблицы:
--   * furniture_products      — каталог мебели для подбора SKU
--   * finishing_materials     — каталог отделочных материалов для сметы
--   * rate_limit_buckets      — счётчики дневного rate-limit (Postgres-based)
--
-- Идемпотентность: все DDL обёрнуты в IF NOT EXISTS, чтобы повторный прогон
-- миграции не падал и был безопасным для running production.

-- =============================================================================
-- 1. ALTER TABLE designs — новые поля пайплайна
-- =============================================================================

ALTER TABLE designs
  ADD COLUMN IF NOT EXISTS layout_json        jsonb,
  ADD COLUMN IF NOT EXISTS top_down_plan_url  text,
  ADD COLUMN IF NOT EXISTS picked_furniture   jsonb,
  ADD COLUMN IF NOT EXISTS progress           integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_step       varchar(60),
  ADD COLUMN IF NOT EXISTS pdf_url            text,
  ADD COLUMN IF NOT EXISTS pdf_rendering_at   timestamp;

COMMENT ON COLUMN designs.layout_json       IS 'Layout_JSON: room/door/window/furniture[] (Requirement 6)';
COMMENT ON COLUMN designs.top_down_plan_url IS 'R2 ключ или public URL Top_Down_Plan PNG (Requirement 8.6)';
COMMENT ON COLUMN designs.picked_furniture  IS 'PickedFurnitureRow[] (Requirement 10.6)';
COMMENT ON COLUMN designs.progress          IS 'Прогресс пайплайна 0..100 (Requirement 5.2)';
COMMENT ON COLUMN designs.current_step      IS 'Имя текущего шага пайплайна (Requirement 5.4)';
COMMENT ON COLUMN designs.pdf_url           IS 'R2 ключ PDF после первого рендера (Requirement 13.5)';
COMMENT ON COLUMN designs.pdf_rendering_at  IS 'Soft-lock для concurrent PDF render запросов';

-- =============================================================================
-- 2. CREATE TABLE furniture_products (Requirement 10.1)
-- =============================================================================

CREATE TABLE IF NOT EXISTS furniture_products (
  id            serial PRIMARY KEY,
  sku           varchar(80)  NOT NULL UNIQUE,
  name          varchar(200) NOT NULL,
  brand         varchar(100),
  price_kopeks  integer      NOT NULL CHECK (price_kopeks >= 0),
  width_cm      integer      NOT NULL CHECK (width_cm  > 0),
  depth_cm      integer      NOT NULL CHECK (depth_cm  > 0),
  height_cm     integer      NOT NULL CHECK (height_cm > 0),
  type          varchar(40)  NOT NULL,
  style_tags    varchar(40)[] NOT NULL DEFAULT '{}',
  room_types    varchar(40)[] NOT NULL DEFAULT '{}',
  image_url     text,
  partner_url   text,
  is_available  boolean      NOT NULL DEFAULT true,
  created_at    timestamp    NOT NULL DEFAULT NOW(),
  updated_at    timestamp    NOT NULL DEFAULT NOW()
);

-- Picker index — горячий путь Furniture_Matcher: фильтр по type + is_available,
-- сортировка по цене. Partial index покрывает только доступные SKU.
CREATE INDEX IF NOT EXISTS furniture_products_picker_idx
  ON furniture_products (type, is_available, price_kopeks)
  WHERE is_available = true;

-- GIN на массивы тегов: позволяет быстрый поиск SKU, чьи style_tags / room_types
-- содержат заданный стиль / тип помещения через оператор `@>`.
CREATE INDEX IF NOT EXISTS furniture_products_styles_gin
  ON furniture_products USING gin (style_tags);

CREATE INDEX IF NOT EXISTS furniture_products_rooms_gin
  ON furniture_products USING gin (room_types);

-- =============================================================================
-- 3. CREATE TABLE finishing_materials (Requirement 11.1)
-- =============================================================================

CREATE TABLE IF NOT EXISTS finishing_materials (
  id                     serial PRIMARY KEY,
  sku                    varchar(80)  NOT NULL UNIQUE,
  name                   varchar(200) NOT NULL,
  brand                  varchar(100),
  category               varchar(20)  NOT NULL CHECK (category IN ('walls','floor','ceiling','other')),
  unit                   varchar(10)  NOT NULL CHECK (unit IN ('sqm','pcs')),
  price_per_unit_kopeks  integer      NOT NULL CHECK (price_per_unit_kopeks >= 0),
  style_tags             varchar(40)[] NOT NULL DEFAULT '{}',
  room_types             varchar(40)[] NOT NULL DEFAULT '{}',
  partner_url            text,
  is_available           boolean      NOT NULL DEFAULT true,
  created_at             timestamp    NOT NULL DEFAULT NOW(),
  updated_at             timestamp    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS finishing_materials_picker_idx
  ON finishing_materials (category, is_available, price_per_unit_kopeks)
  WHERE is_available = true;

CREATE INDEX IF NOT EXISTS finishing_materials_styles_gin
  ON finishing_materials USING gin (style_tags);

CREATE INDEX IF NOT EXISTS finishing_materials_rooms_gin
  ON finishing_materials USING gin (room_types);

-- =============================================================================
-- 4. CREATE TABLE rate_limit_buckets (Requirements 3.3, 3.4)
-- =============================================================================
-- Один счётчик на ключ `bucket_key` ('anon:UUID' или 'ip:1.2.3.4') + начало
-- текущего 24-часового fixed window. Атомарный INSERT ... ON CONFLICT DO UPDATE
-- из lib/designRateLimit.ts обновляет счётчик и сбрасывает window_start, когда
-- (NOW() - window_start) > 24h.

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key    varchar(150) PRIMARY KEY,
  counter       integer   NOT NULL DEFAULT 0,
  window_start  timestamp NOT NULL DEFAULT NOW(),
  updated_at    timestamp NOT NULL DEFAULT NOW()
);

-- Индекс по window_start нужен только для опционального фонового cron'а,
-- который чистит «холодные» бакеты (window_start < NOW() - 7 days).
CREATE INDEX IF NOT EXISTS rate_limit_buckets_window_idx
  ON rate_limit_buckets (window_start);

-- =============================================================================
-- 5. ALTER TABLE cities — городской коэффициент стоимости работ (Requirement 11.4)
-- =============================================================================
-- Решение: новая колонка прямо в `cities`, без отдельной таблицы — это убирает
-- join на горячем пути Materials_Estimator и легко ведётся в админ-CRM.
-- NULL означает «использовать общероссийский default» (см. DEFAULT_WORK_COEFF_KOPEKS_PER_SQM
-- в lib/materialsEstimator.ts; ориентир 800000 копеек/м²).

ALTER TABLE cities
  ADD COLUMN IF NOT EXISTS work_coefficient_kopeks_per_sqm integer;

COMMENT ON COLUMN cities.work_coefficient_kopeks_per_sqm IS
  'Стоимость работ в копейках за 1 м² помещения для Real_Estimate (Requirement 11.4). NULL — использовать общероссийское значение по умолчанию.';
