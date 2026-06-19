-- Расширяем user_saves под AI-дизайны (план: AI-designer Iter 3).
-- Polymorphic pattern: portfolio_id ИЛИ ai_design_id (CHECK constraint
-- гарантирует что хотя бы один задан; уникальность через partial indexes).
--
-- Ничего не меняем в существующих rows — старые saves остаются как есть с
-- portfolio_id IS NOT NULL и ai_design_id NULL.

ALTER TABLE "user_saves"
  ALTER COLUMN "portfolio_id" DROP NOT NULL;

ALTER TABLE "user_saves"
  ADD COLUMN "ai_design_id" integer REFERENCES "designs"("id") ON DELETE CASCADE;

CREATE INDEX "user_saves_ai_design_id_idx"
  ON "user_saves" USING btree ("ai_design_id")
  WHERE "ai_design_id" IS NOT NULL;

-- Уникальность: один пользователь не может сохранить один AI-дизайн дважды.
CREATE UNIQUE INDEX "user_saves_anon_ai_design_uniq"
  ON "user_saves" ("anon_id", "ai_design_id")
  WHERE "anon_id" IS NOT NULL AND "ai_design_id" IS NOT NULL;

CREATE UNIQUE INDEX "user_saves_user_ai_design_uniq"
  ON "user_saves" ("user_id", "ai_design_id")
  WHERE "user_id" IS NOT NULL AND "ai_design_id" IS NOT NULL;

-- App-уровневая инвариант (CHECK): хотя бы один таргет задан, и не оба.
ALTER TABLE "user_saves" ADD CONSTRAINT "user_saves_target_required"
  CHECK (
    ("portfolio_id" IS NOT NULL AND "ai_design_id" IS NULL) OR
    ("portfolio_id" IS NULL AND "ai_design_id" IS NOT NULL)
  );
