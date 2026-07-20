-- Real Price — Фаза 1: витрина агрегатов цен (spec: .kiro/specs/real-price)
--
-- Файл-зеркало идемпотентного runtime-блока в artifacts/api-server/src/index.ts.
-- Считается из price_points (медиана + P25/P75, отсечение выбросов) по ключам
-- work_city / work_zhk; публикуется при n ≥ порог (is_indexable).

CREATE TABLE IF NOT EXISTS price_aggregates (
  id serial PRIMARY KEY,
  key_type varchar(16) NOT NULL,                 -- work_city | work_zhk
  work_type_id integer NOT NULL REFERENCES work_types(id) ON DELETE CASCADE,
  city text NOT NULL DEFAULT '',
  district text NOT NULL DEFAULT '',             -- ЖК/район для work_zhk; '' для work_city
  unit varchar(24),
  p25 numeric(12,2),
  p50 numeric(12,2),
  p75 numeric(12,2),
  n integer NOT NULL DEFAULT 0,
  series_12m jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_indexable boolean NOT NULL DEFAULT false,
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS price_aggregates_key_uidx
  ON price_aggregates(key_type, work_type_id, city, district);
