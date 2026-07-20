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

-- 4) Стартовый словарь видов работ (идемпотентно). category work=гранулярная
--    позиция сметы (агрегация), project|task = headline-тип для маршрутизации
--    Объекта. synonyms — стемы для маппинга свободных описаний. Курируется в CRM.
INSERT INTO work_types (slug, name, category, default_unit, synonyms, sort_order) VALUES
  ('demontazh','Демонтаж','work','м²',ARRAY['демонтаж','снятие','обдирка'],10),
  ('shtukaturka-sten','Штукатурка стен','work','м²',ARRAY['штукатур'],20),
  ('shpaklevka-sten','Шпаклёвка стен','work','м²',ARRAY['шпакл','шпаклёвк','шпаклевк','шпаклеван'],30),
  ('gruntovka','Грунтовка','work','м²',ARRAY['грунт'],40),
  ('shlifovka','Шлифовка стен','work','м²',ARRAY['шлифов'],50),
  ('pokraska-sten','Покраска стен','work','м²',ARRAY['покраск','окраск'],60),
  ('pokraska-potolka','Покраска потолка','work','м²',ARRAY['покраска потолк','потолок покрас'],70),
  ('poklejka-oboev','Поклейка обоев','work','м²',ARRAY['обои','обоев','поклейк'],80),
  ('stekloholst','Стеклохолст / малярный флизелин','work','м²',ARRAY['стеклохолст','стеклохост'],90),
  ('styazhka-pola','Стяжка пола','work','м²',ARRAY['стяжк'],100),
  ('ukladka-plitki-steny','Укладка плитки на стены','work','м²',ARRAY['плитк','настенн плитк','укладка плитки'],110),
  ('ukladka-plitki-pol','Укладка керамогранита на пол','work','м²',ARRAY['керамогранит','плитки на пол','напольн плитк'],120),
  ('zatirka-shvov','Затирка швов','work','м²',ARRAY['затирк','оформление швов'],130),
  ('ukladka-laminata','Укладка ламината','work','м²',ARRAY['ламинат'],140),
  ('shtroblenie','Штробление стен','work','м.п.',ARRAY['штроб'],150),
  ('montazh-gkl','Короба и перегородки ГКЛ','work','м²',ARRAY['гкл','гипсокартон','короб'],160),
  ('otkosy','Откосы','work','шт',ARRAY['откос'],170),
  ('plintus','Плинтус','work','м.п.',ARRAY['плинтус'],180),
  ('elektrika','Электромонтаж (розетки, разводка)','work','точка',ARRAY['электрик','розет','выключател','проводк','щит'],190),
  ('santehnika-razvodka','Разводка сантехники','work','точка',ARRAY['разводка труб','канализац','водоснабж','разводка воды'],200),
  ('ustanovka-santehniki','Установка сантехприборов','work','шт',ARRAY['унитаз','раковин','смесител','ванн','тумб','вытяжк','люк'],210),
  ('tech-otverstiya','Технические отверстия / коронование','work','шт',ARRAY['коронован','тех.отверст','отверстия'],220),
  ('sanuzel-pod-klyuch','Санузел под ключ','project','объект',ARRAY['санузел под ключ','ванная под ключ','сан.узел','с/у под ключ'],300),
  ('kuhnya-pod-klyuch','Кухня под ключ','project','объект',ARRAY['кухня под ключ'],310),
  ('kvartira-pod-klyuch','Квартира под ключ','project','объект',ARRAY['квартира под ключ','комплексн отделк','ремонт под ключ'],320),
  ('zamena-smesitelya','Замена смесителя','task','шт',ARRAY['замена смесител'],400),
  ('zamena-zamka','Замена замка','task','шт',ARRAY['замена замка'],410),
  ('naveska-sborka','Навеска и сборка','task','шт',ARRAY['навеск','сборк','повесить'],420),
  ('melkiy-remont','Мелкий ремонт (муж на час)','task','час',ARRAY['муж на час','мелкий ремонт'],430)
ON CONFLICT (slug) DO NOTHING;
