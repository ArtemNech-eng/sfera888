-- Migration 0015: AI-design page redesign — multiple views + detail crops
--
-- Adds two JSONB columns to designs table:
--   views        — array of 4 angles per project: [{url, label, position}]
--                  (общий вид, акцент, шкаф/хранение, окно/рабочее место)
--   detail_crops — array of 6 detail-photo crops cut from the views via sharp:
--                  [{url, label, fromView}]
--                  (кровать, тумба, шкаф, рабочий стол, бра, потолочный светильник)
--
-- Existing fields used as-is:
--   input_image_url       → "Было" фото (text2img generated for AI-concepts)
--   result_image_url      → главный hero ракурс (для og:image и feed thumbnail)
--   district, area, budget, materials, estimate, solutions, color_palette,
--   seo_title, seo_description, h1, description — уже в схеме.

ALTER TABLE designs
  ADD COLUMN IF NOT EXISTS views        JSONB,
  ADD COLUMN IF NOT EXISTS detail_crops JSONB;
