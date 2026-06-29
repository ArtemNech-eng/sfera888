/**
 * Канонический экспорт позиций мебели — `positions.json`
 * (`AI_Design_3D_Blockout`, задача 3.6).
 *
 * См. `.kiro/specs/ai-design-3d-blockout/design.md` секции
 * «Data Models → Furniture positions export (positions.json)» и
 * «Property 12: Полнота экспорта позиций мебели», а также `requirements.md`
 * Requirement 7.3.
 *
 * Что делает этот модуль:
 *   • объявляет тип `PositionsExport` — каноническую форму `positions.json`;
 *   • `buildPositionsExport(spec, sceneId?)` строит экспорт из `Scene_Spec`:
 *     ровно одна запись на каждый предмет мебели (по `id`) с теми же
 *     значениями позиции, габаритов и ориентации, что в `Scene_Spec`
 *     (Property 12). Это проверяемый артефакт для `Geometric_Consistency`
 *     (Requirement 7.3) — множество позиций берётся из единственного
 *     `Room_Blockout`, поэтому не зависит от камеры (Req 7.2, 7.4).
 *
 * Экспорт — чистая функция данных `Scene_Spec`: рендер/пиксели не участвуют.
 */

import type { RotationDeg, SceneSpec } from "./sceneSpec";

/** Позиция/центр предмета в мировых координатах (метры). */
export interface PositionVec3 {
  x: number;
  y: number;
  z: number;
}

/** Габариты предмета (метры): ширина/глубина/высота. */
export interface PositionDimensions {
  w: number;
  d: number;
  h: number;
}

/** Одна запись экспорта — мировое размещение одного предмета мебели. */
export interface PositionRecord {
  /** Идентификатор предмета (уникален в пределах `Scene_Spec`). */
  id: string;
  /** Мировая позиция (центр) предмета. */
  position: PositionVec3;
  /** Мировые габариты предмета. */
  dimensions: PositionDimensions;
  /** Ортогональная ориентация в плане: 0/90/180/270 градусов. */
  rotationDeg: RotationDeg;
}

/**
 * Каноническая форма `positions.json`: список мировых размещений мебели плюс
 * необязательный идентификатор сцены. Используется для проверки
 * `Geometric_Consistency` (Req 7.3).
 */
export interface PositionsExport {
  /** Необязательный идентификатор сцены/проекта. */
  sceneId?: string;
  /** По одной записи на каждый предмет мебели `Scene_Spec`. */
  furniture: PositionRecord[];
}

/**
 * Строит канонический экспорт позиций мебели из `Scene_Spec`.
 *
 * Гарантия (Property 12): результат содержит ровно одну запись на каждый
 * предмет мебели `spec.furniture` (по `id`), а значения `position`,
 * `dimensions` и `rotationDeg` побайтово совпадают со значениями в
 * `Scene_Spec`. Порядок записей сохраняется. Поля копируются в новые
 * объекты, чтобы экспорт не разделял ссылок со `Scene_Spec` и оставался
 * независимым артефактом.
 *
 * Уникальность `id` гарантирует сам `Scene_Spec` (схема `sceneSpecSchema`),
 * поэтому «одна запись на предмет по `id`» эквивалентно «одна запись на
 * элемент массива `furniture`».
 *
 * @param spec    валидный `Scene_Spec` (источник позиций мебели).
 * @param sceneId необязательный идентификатор сцены/проекта.
 */
export function buildPositionsExport(
  spec: SceneSpec,
  sceneId?: string,
): PositionsExport {
  const furniture: PositionRecord[] = spec.furniture.map((item) => ({
    id: item.id,
    position: {
      x: item.position.x,
      y: item.position.y,
      z: item.position.z,
    },
    dimensions: {
      w: item.dimensions.w,
      d: item.dimensions.d,
      h: item.dimensions.h,
    },
    rotationDeg: item.rotationDeg,
  }));

  const result: PositionsExport = { furniture };
  if (sceneId !== undefined) {
    result.sceneId = sceneId;
  }
  return result;
}
