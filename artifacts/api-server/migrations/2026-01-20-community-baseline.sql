-- Migration: ХочуТакже — гео-сообщество (baseline)
-- Spec: .kiro/specs/hochu-takzhe-community/
-- Requirements: 1.1, 1.6, 3.1, 4.5, 8.1, 17.2 (+ 6.1, 7.1, 16.x, 19.4)
--
-- Аддитивная миграция: создаёт новые таблицы гео-сообщества и добавляет
-- nullable/default-колонки в существующую `cities`. НЕ изменяет и НЕ удаляет
-- существующие столбцы/таблицы (cities, service_types, leads, designs, orders),
-- поэтому текущая CRM/PWA/marketplace-логика продолжает работать без изменений.
--
-- Идемпотентность: весь DDL обёрнут в IF NOT EXISTS — повторный прогон
-- безопасен для running production.

-- =============================================================================
-- 1. ALTER TABLE cities — стартовые города и SEO-покрытие
-- =============================================================================

ALTER TABLE cities
  ADD COLUMN IF NOT EXISTS is_starter     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_geo_covered boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN cities.is_starter     IS 'Стартовый город приоритетного развития сообщества (1..3) (Requirement 17.1, 17.4)';
COMMENT ON COLUMN cities.is_geo_covered IS 'Город в целевом наборе SEO-покрытия (~40 городов ≥400k) (Requirement 16.1)';

-- =============================================================================
-- 2. CREATE TABLE community_accounts (Community_Account, Requirement 11.x)
-- =============================================================================
-- Создаётся до `zhk`, т.к. zhk.created_by_account_id ссылается на неё, а FK
-- community_accounts.zhk_id добавляется позже (после создания zhk).

CREATE TABLE IF NOT EXISTS community_accounts (
  id                serial PRIMARY KEY,
  phone             varchar(30) NOT NULL,
  phone_verified_at timestamp,
  role              varchar(20) NOT NULL DEFAULT 'resident',
  zhk_id            integer,
  max_user_id       varchar(80),
  created_at        timestamp   NOT NULL DEFAULT NOW(),
  CONSTRAINT community_accounts_phone_key UNIQUE (phone)
);

CREATE INDEX IF NOT EXISTS community_accounts_zhk_idx      ON community_accounts (zhk_id);
CREATE INDEX IF NOT EXISTS community_accounts_max_user_idx ON community_accounts (max_user_id);

-- =============================================================================
-- 3. CREATE TABLE zhk (ZhK_Record, Requirement 1.1, 1.6, 4.x, 16.x, 17.2)
-- =============================================================================

CREATE TABLE IF NOT EXISTS zhk (
  id                    serial PRIMARY KEY,
  slug                  varchar(100) NOT NULL,
  name                  varchar(100) NOT NULL,
  name_normalized       varchar(100) NOT NULL,
  city_id               integer      NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  developer             varchar(200),
  completion_date       varchar(40),
  buildings             jsonb,
  status                varchar(20)  NOT NULL DEFAULT 'NON_LIVING',
  is_seeded             boolean      NOT NULL DEFAULT false,
  content_score         integer      NOT NULL DEFAULT 0,
  is_indexable          boolean      NOT NULL DEFAULT false,
  created_by_account_id integer      REFERENCES community_accounts(id) ON DELETE SET NULL,
  seo_title             varchar(70),
  seo_description       varchar(180),
  h1                    varchar(100),
  body_md               text,
  created_at            timestamp    NOT NULL DEFAULT NOW(),
  CONSTRAINT zhk_slug_key UNIQUE (slug)
);

-- Поисковый индекс дедупликации ЖК в пределах города (Requirement 4.5).
-- НЕ UNIQUE: дедуп на уровне сервиса возвращает существующий ЖК вместо ошибки
-- (см. design.md → Data Models; graceful-поведение по Requirement 4.5).
CREATE INDEX IF NOT EXISTS zhk_city_name_normalized_idx ON zhk (city_id, name_normalized);
CREATE INDEX IF NOT EXISTS zhk_city_status_idx          ON zhk (city_id, status);

-- Отложенный FK community_accounts.zhk_id → zhk.id (циркулярная связь).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'community_accounts_zhk_id_fkey'
      AND table_name = 'community_accounts'
  ) THEN
    ALTER TABLE community_accounts
      ADD CONSTRAINT community_accounts_zhk_id_fkey
      FOREIGN KEY (zhk_id) REFERENCES zhk(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =============================================================================
-- 4. CREATE TABLE specialties (Specialty, Requirement 6.1)
-- =============================================================================

CREATE TABLE IF NOT EXISTS specialties (
  id         serial PRIMARY KEY,
  slug       varchar(100) NOT NULL,
  name       varchar(100) NOT NULL,
  is_active  boolean      NOT NULL DEFAULT true,
  created_at timestamp    NOT NULL DEFAULT NOW(),
  CONSTRAINT specialties_slug_key UNIQUE (slug)
);

-- =============================================================================
-- 5. CREATE TABLE pro_memberships (Requirement 7.1, 7.2)
-- =============================================================================

CREATE TABLE IF NOT EXISTS pro_memberships (
  id           serial PRIMARY KEY,
  account_id   integer   NOT NULL REFERENCES community_accounts(id) ON DELETE CASCADE,
  specialty_id integer   REFERENCES specialties(id) ON DELETE SET NULL,
  verified     boolean   NOT NULL DEFAULT false,
  verified_at  timestamp,
  created_at   timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pro_memberships_account_idx   ON pro_memberships (account_id);
CREATE INDEX IF NOT EXISTS pro_memberships_specialty_idx ON pro_memberships (specialty_id);

-- =============================================================================
-- 6. CREATE TABLE community_threads (City_Feed / Local_Feed / PRO, Requirement 8.1)
-- =============================================================================

CREATE TABLE IF NOT EXISTS community_threads (
  id                serial PRIMARY KEY,
  zone              varchar(20)  NOT NULL,
  scope             varchar(10)  NOT NULL,
  city_id           integer      REFERENCES cities(id) ON DELETE SET NULL,
  zhk_id            integer      REFERENCES zhk(id) ON DELETE CASCADE,
  specialty_id      integer      REFERENCES specialties(id) ON DELETE SET NULL,
  is_local          boolean      NOT NULL DEFAULT false,
  category          varchar(40),
  title             varchar(200) NOT NULL,
  body              text         NOT NULL,
  author_account_id integer      REFERENCES community_accounts(id) ON DELETE SET NULL,
  is_seeded         boolean      NOT NULL DEFAULT false,
  visibility        varchar(12)  NOT NULL DEFAULT 'public',
  moderation_status varchar(16)  NOT NULL DEFAULT 'not_screened',
  last_activity_at  timestamp    NOT NULL DEFAULT NOW(),
  created_at        timestamp    NOT NULL DEFAULT NOW()
);

-- City_Feed / Local_Feed сортировка по дате (Requirement 1.2, 1.4, 3.3).
CREATE INDEX IF NOT EXISTS community_threads_scope_city_created_idx
  ON community_threads (scope, city_id, created_at);
CREATE INDEX IF NOT EXISTS community_threads_scope_zhk_created_idx
  ON community_threads (scope, zhk_id, created_at);
-- PRO: All_Russia / My_City_Filter по специальности (Requirement 6.2, 6.4).
CREATE INDEX IF NOT EXISTS community_threads_zone_specialty_local_city_idx
  ON community_threads (zone, specialty_id, is_local, city_id);
-- Изоляция зон + фильтрация по городу (Requirement 8.1).
CREATE INDEX IF NOT EXISTS community_threads_zone_city_idx  ON community_threads (zone, city_id);
CREATE INDEX IF NOT EXISTS community_threads_zhk_idx        ON community_threads (zhk_id);
CREATE INDEX IF NOT EXISTS community_threads_specialty_idx  ON community_threads (specialty_id);

-- =============================================================================
-- 7. CREATE TABLE community_thread_drafts (сохранённый ввод, Requirement 3.4, 11.3)
-- =============================================================================

CREATE TABLE IF NOT EXISTS community_thread_drafts (
  id                serial PRIMARY KEY,
  author_account_id integer   REFERENCES community_accounts(id) ON DELETE SET NULL,
  payload           jsonb     NOT NULL,
  reason            varchar(40),
  created_at        timestamp NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 8. CREATE TABLE community_moderation_log (журнал модерации, Requirement 19.4)
-- =============================================================================

CREATE TABLE IF NOT EXISTS community_moderation_log (
  id           serial PRIMARY KEY,
  target_type  varchar(20) NOT NULL,
  target_id    integer     NOT NULL,
  action       varchar(24) NOT NULL,
  reason       text,
  moderator_id integer,
  created_at   timestamp   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS community_moderation_log_target_idx
  ON community_moderation_log (target_type, target_id);

-- =============================================================================
-- 9. CREATE TABLE zhk_weekly_activity (метрика Living_ZhK, Requirement 17.2, 17.3)
-- =============================================================================

CREATE TABLE IF NOT EXISTS zhk_weekly_activity (
  id               serial PRIMARY KEY,
  zhk_id           integer NOT NULL REFERENCES zhk(id) ON DELETE CASCADE,
  week_start       date    NOT NULL,
  active_residents integer NOT NULL DEFAULT 0,
  created_at       timestamp NOT NULL DEFAULT NOW(),
  updated_at       timestamp NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS zhk_weekly_activity_zhk_week_key
  ON zhk_weekly_activity (zhk_id, week_start);
CREATE INDEX IF NOT EXISTS zhk_weekly_activity_zhk_idx
  ON zhk_weekly_activity (zhk_id);
