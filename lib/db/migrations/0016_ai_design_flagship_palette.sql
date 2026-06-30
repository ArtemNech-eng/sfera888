-- Migration 0016: AI_Design_Flagship — input palette column
--
-- Adds a single nullable column to the designs table:
--   palette — input colour palette chosen by the user in `Flagship_Form`
--             (one of dizajnFormSchema.PALETTES: warm_neutral, white_wood,
--             cool_gray, beige_sand, green_sage, blue_calm).
--
-- В отличие от `color_palette` (JSONB, вычисляется worker'ом из результата),
-- `palette` — это ВХОДНОЙ параметр генерации (Requirement 2.4, ai-design-flagship).
-- Nullable для обратной совместимости с уже существующими записями.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS) — безопасно применяется повторно и
-- поверх БД, где колонка уже могла быть добавлена вручную.

ALTER TABLE designs
  ADD COLUMN IF NOT EXISTS palette VARCHAR(40);
