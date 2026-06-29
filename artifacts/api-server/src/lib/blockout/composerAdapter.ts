/**
 * Composer adapter для пайплайна AI_Design_3D_Blockout (подход B2).
 *
 * Назначение (Requirement 8, design §7 «Composer adapter»):
 *   3D-путь заменяет ТОЛЬКО шаг генерации ракурсов, плана и изометрии. Готовые
 *   `Photoreal_Repaint` из `repaintAll` нужно разложить по слотам существующего
 *   композитора `infographicComposer.ts` БЕЗ изменения его контракта
 *   (`composeInfographic`, `InfographicInput`).
 *
 * Маппинг слотов (Property 18, Requirements 8.1–8.3):
 *   • 4 перекраски фото-камер (cam_persp_1..4) → `views` (ровно 4);
 *   • перекраска изометрической камеры (cam_iso) → `isometric`
 *     (или `null` при деградации, Requirement 13.3);
 *   • перекраска ортографической камеры сверху (cam_top) → `topDownPlanPng`
 *     (или `null` при деградации, Requirement 13.3).
 *
 * Прочие поля `InfographicInput` (`design`, `viewLabels`, `cropLabels`,
 * `detailCrops`) передаются без изменений (Requirement 8.5, Property 19).
 *
 * Этот модуль НЕ изменяет сигнатуру `composeInfographic` и форму
 * `InfographicInput` (Requirement 8.4) — он лишь собирает валидный вход и
 * вызывает существующую функцию как есть.
 */

import {
  composeInfographic,
  type InfographicInput,
} from "../infographicComposer";

/**
 * Перекраски (`Photoreal_Repaint`), разложенные по ролям `Camera_Rig`.
 *
 * Роли камер фиксированы (design §«Camera_Rig»):
 *   - `photoViews` — перекраски 4 перспективных фото-камер `cam_persp_1..4`
 *     в порядке ракурсов;
 *   - `isometric` — перекраска изометрической камеры `cam_iso` или `null`,
 *     если эта камера стойко не перекрасилась (деградация, Requirement 13.3);
 *   - `topDown` — перекраска ортографической камеры сверху `cam_top` или
 *     `null` при деградации (Requirement 13.3).
 */
export interface BlockoutRepaints {
  /** Ровно 4 `Photoreal_Repaint` фото-камер → слот `views`. */
  photoViews: Buffer[];
  /** `Photoreal_Repaint` изометрии → слот `isometric` (или `null`). */
  isometric: Buffer | null;
  /** `Photoreal_Repaint` вида сверху → слот `topDownPlanPng` (или `null`). */
  topDown: Buffer | null;
}

/**
 * Прочие поля `InfographicInput`, формируемые прежним способом и передаваемые
 * в композитор без изменений (Requirement 8.5): тексты/метки/кропы и блок
 * `design` (материалы, смета, палитра, решения и т.д.).
 *
 * Это в точности `InfographicInput` за вычетом трёх слотов, которые заменяет
 * 3D-путь (`views`, `isometric`, `topDownPlanPng`).
 */
export type InfographicBaseFields = Omit<
  InfographicInput,
  "views" | "isometric" | "topDownPlanPng"
>;

/** Ожидаемое число фото-ракурсов (4 перспективные камеры `Camera_Rig`). */
export const EXPECTED_PHOTO_VIEW_COUNT = 4;

/**
 * Собирает `InfographicInput` из перекрасок 3D-пайплайна и прочих базовых
 * полей.
 *
 * Заменяются ровно три слота (`views`, `isometric`, `topDownPlanPng`); все
 * остальные поля (`design`, `viewLabels`, `cropLabels`, `detailCrops`)
 * берутся из `baseFields` без изменений (Requirement 8.5, Property 19).
 *
 * @throws Error если число `photoViews` не равно 4 — нарушение контракта
 *   слота `views` (Requirement 8.1). Сообщение называет поле и фактическое
 *   число ракурсов.
 */
export function buildInfographicInput(
  repaints: BlockoutRepaints,
  baseFields: InfographicBaseFields,
): InfographicInput {
  if (repaints.photoViews.length !== EXPECTED_PHOTO_VIEW_COUNT) {
    throw new Error(
      `buildInfographicInput: поле "views" требует ровно ${EXPECTED_PHOTO_VIEW_COUNT} перекраски фото-камер, получено ${repaints.photoViews.length}`,
    );
  }

  return {
    // Прочие поля — без изменений (Requirement 8.5).
    ...baseFields,
    // 3D-путь заменяет ровно три слота (Requirements 8.1–8.3).
    views: repaints.photoViews,
    isometric: repaints.isometric,
    topDownPlanPng: repaints.topDown,
  };
}

/**
 * Тонкая обёртка: собирает `InfographicInput` адаптером и вызывает
 * существующий `composeInfographic` БЕЗ изменения его сигнатуры и формы
 * `InfographicInput` (Requirement 8.4).
 *
 * Возвращает буфер итогового борда — ровно то, что отдаёт `composeInfographic`.
 */
export function composeBlockoutInfographic(
  repaints: BlockoutRepaints,
  baseFields: InfographicBaseFields,
): Promise<Buffer> {
  const input = buildInfographicInput(repaints, baseFields);
  return composeInfographic(input);
}
