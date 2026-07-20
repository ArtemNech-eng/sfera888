-- Real Price — Фаза 0 baseline (spec: .kiro/specs/real-price)
--
-- Файл-зеркало идемпотентного runtime-блока в artifacts/api-server/src/index.ts
-- (runRuntimeFixes). Аддитивно и безопасно на работающем проде; повторный
-- прогон — no-op. Эволюция сметы (receipts) в «Объект» + словарь видов работ +
-- нормализованные ценовые точки. Существующий receipt-флоу не затрагивается.

-- 1) Словарь видов работ
CREATE TABLE IF NOT EXISTS work_types (
  id serial PRIMARY KEY,
  slug varchar(120) NOT NULL,
  name text NOT NULL,
  category varchar(16) NOT NULL DEFAULT 'project',   -- project | task
  default_unit varchar(24),
  synonyms text[] NOT NULL DEFAULT '{}',
  service_type_id integer REFERENCES service_types(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS work_types_slug_key ON work_types(slug);

-- 2) Объект = расширение receipts (additive, 1 заказ = 1 Объект)
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS object_type     varchar(16),                              -- project | task
  ADD COLUMN IF NOT EXISTS source          varchar(16) NOT NULL DEFAULT 'platform',  -- platform | self_added
  ADD COLUMN IF NOT EXISTS area            numeric(10,2),
  ADD COLUMN IF NOT EXISTS zhk             varchar(160),
  ADD COLUMN IF NOT EXISTS stages          jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_published    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at    timestamp,
  ADD COLUMN IF NOT EXISTS is_indexable    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS publish_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS slug            varchar(120),
  ADD COLUMN IF NOT EXISTS seo_title       varchar(70),
  ADD COLUMN IF NOT EXISTS seo_description varchar(180),
  ADD COLUMN IF NOT EXISTS public_title    varchar(150);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_slug_key') THEN
    ALTER TABLE receipts ADD CONSTRAINT receipts_slug_key UNIQUE (slug);
  END IF;
END $$;

-- 3) Нормализованные ценовые точки (источник агрегатов)
CREATE TABLE IF NOT EXISTS price_points (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  receipt_id integer REFERENCES receipts(id) ON DELETE SET NULL,
  master_id integer REFERENCES masters(id),
  work_type_id integer NOT NULL REFERENCES work_types(id),
  unit varchar(24),
  quantity numeric(12,2),
  unit_price numeric(12,2) NOT NULL,
  total numeric(12,2),
  city text,
  district text,
  zhk varchar(160),
  source varchar(16) NOT NULL DEFAULT 'platform',
  closed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS price_points_work_city_idx ON price_points(work_type_id, city, closed_at);
CREATE INDEX IF NOT EXISTS price_points_work_district_idx ON price_points(work_type_id, district);
