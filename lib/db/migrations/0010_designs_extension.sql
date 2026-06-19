-- Расширяем таблицу `designs` под полноценный дизайн-проект (а не просто render).
-- См. .kiro/specs/ai-designer/design.md для контекста.
--
-- Что добавляем:
--   • anon_id UUID — владелец до login (cookie kiro_anon_id)
--   • materials, estimate, solutions, color_palette — JSONB-артефакты дизайн-проекта
--   • budget, duration_weeks — параметры из формы
--   • save_count — engagement counter (mirror master_portfolio.save_count)
--   • error_message — для status='failed'
--
-- Индексы — для feed (anon's own + public recent) и worker queue.

ALTER TABLE "designs"
  ADD COLUMN "anon_id" uuid,
  ADD COLUMN "materials" jsonb,
  ADD COLUMN "estimate" jsonb,
  ADD COLUMN "solutions" jsonb,
  ADD COLUMN "color_palette" jsonb,
  ADD COLUMN "budget" integer,
  ADD COLUMN "duration_weeks" integer,
  ADD COLUMN "save_count" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "error_message" text;

-- Индекс для «мои дизайны» (anon-id feed) и «последние public» (homepage feed).
CREATE INDEX "designs_anon_id_idx"
  ON "designs" USING btree ("anon_id", "created_at" DESC)
  WHERE "anon_id" IS NOT NULL;

-- Worker queue индекс — быстрая выборка pending для бэкграунд-воркера.
CREATE INDEX "designs_status_pending_idx"
  ON "designs" USING btree ("status", "created_at")
  WHERE "status" = 'generating';

-- Public-feed индекс — для homepage HomeAIDesigns + /dizajn aggregate.
CREATE INDEX "designs_public_recent_idx"
  ON "designs" USING btree ("created_at" DESC)
  WHERE "is_public" = true AND "status" = 'completed';
