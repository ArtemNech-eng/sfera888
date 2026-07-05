-- Migration: Community Generalized Locality (Стадия 2) — locality kind
-- Spec: .kiro/specs/community-generalized-locality/
-- Requirements: 1.5, 2.4, 9.1, 9.2, 9.4, 9.5, 9.6
--
-- Аддитивно обобщает таблицу `zhk` (ЖК) до универсальной Locality: добавляет
-- дискриминатор `kind` со значением по умолчанию 'zhk'. Существующие строки
-- получают kind='zhk' через DEFAULT (Requirement 9.1). Слаги/имена/атрибуты
-- НЕ изменяются — 0 удалённых, 0 добавленных строк (Requirement 9.2).
-- НЕ удаляет и НЕ переопределяет существующие столбцы/таблицы.
--
-- Идемпотентность: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- охранённый DO $$ для CHECK — повторный прогон безопасен (Requirement 9.3).
-- Атомарность/откат: весь DDL обёрнут в одну транзакцию BEGIN/COMMIT; при
-- ошибке любого шага изменения полностью откатываются (Requirement 9.4).
-- Zero downtime: аддитивный ADD COLUMN ... DEFAULT в Postgres ≥ 11 не
-- переписывает таблицу и не блокирует чтение (Requirement 9.5).

BEGIN;

-- =============================================================================
-- 1. Колонка kind с типом по умолчанию 'zhk' (Requirement 1.4, 9.1, 9.6)
-- =============================================================================
-- ADD COLUMN IF NOT EXISTS + DEFAULT атомарно проставляет 'zhk' всем
-- существующим строкам — 0 удалённых, 0 добавленных (Requirement 9.2).

ALTER TABLE zhk
  ADD COLUMN IF NOT EXISTS kind varchar(16) NOT NULL DEFAULT 'zhk';

COMMENT ON COLUMN zhk.kind IS
  'Locality_Kind: zhk|district|settlement; default zhk (Requirement 1.2, 1.4)';

-- =============================================================================
-- 2. Страховочный бэкфилл (Requirement 9.1)
-- =============================================================================
-- На случай ранее добавленной nullable-колонки; для чистого случая — no-op.

UPDATE zhk SET kind = 'zhk' WHERE kind IS NULL;

-- =============================================================================
-- 3. CHECK-ограничение допустимых значений (Requirement 1.5)
-- =============================================================================
-- Охранённое добавление: повторный прогон не падает (идемпотентность).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'zhk_kind_check' AND table_name = 'zhk'
  ) THEN
    ALTER TABLE zhk ADD CONSTRAINT zhk_kind_check
      CHECK (kind IN ('zhk', 'district', 'settlement'));
  END IF;
END $$;

-- =============================================================================
-- 4. Индекс листинга/фильтрации локаций города (Requirement 2.4)
-- =============================================================================

CREATE INDEX IF NOT EXISTS zhk_city_kind_idx ON zhk (city_id, kind);

COMMIT;
