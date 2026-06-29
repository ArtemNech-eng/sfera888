# Implementation Plan: AI_Design_3D_Blockout (подход B2)

## Overview

Реализация offline-пайплайна B2: TypeScript-оркестратор в `artifacts/api-server`
(запуск через `npx tsx`) + Python-скрипт Blender (`Blockout_Builder`),
обменивающиеся данными через JSON/PNG. Сначала строится чистое ядро на TypeScript
(`Scene_Spec`, габариты, пресеты, сборка спека, экспорт позиций) с
property-тестами на `fast-check` + `node:test` по образцу
`__tests__/dizajn/layout-json-roundtrip.property.test.ts`. Затем — Blender-builder,
обёртка `Depth_ControlNet` в `falAi.ts`, бюджет-гард, адаптер композитора,
загрузка в R2, оркестрация перекраски с деградацией, публикация `SEO_Page` и
финальная сборка пайплайна с CLI и R&D-прототипом. Существующий
`infographicComposer.ts` и `Fallback_2D_Path` не изменяются.

Языки: **TypeScript** (оркестратор, обёртки, тесты) и **Python** (`Blockout_Builder`
под headless Blender) — как задано в дизайне.

## Tasks

- [x] 1. Scene_Spec: типы, схема и сериализация
  - [x] 1.1 Реализовать модель и сериализацию `Scene_Spec`
    - Создать `artifacts/api-server/src/lib/blockout/sceneSpec.ts`
    - Определить типы `SceneSpec`, `Wall`, `FurnitureItem`, `CameraSpec`, `RoomType`
    - Построить zod-схему (по образцу `parseLayout` в `layoutPlanner.ts`) как единственный источник правды о форме `Scene_Spec`; запретить `undefined`/`NaN`/даты/буферы
    - Реализовать `serializeSceneSpec(spec): string` (канонический JSON) и `parseSceneSpec(json): SceneSpec` (строгий парс, ошибка с именем первого нарушенного поля)
    - _Requirements: 4.1, 4.2, 4.4_

  - [x]* 1.2 Property-тест round-trip `Scene_Spec`
    - **Property 1: Scene_Spec round-trip**
    - Генератор `sceneSpecArb` (валидный `Scene_Spec` по схеме, образец `layoutJsonArb`); ≥100 итераций
    - **Validates: Requirements 4.1, 4.2, 4.3**

  - [x]* 1.3 Property-тест «невалидная схема называет поле»
    - **Property 2: Невалидная схема называет первое нарушенное поле**
    - Портить ровно одно поле валидного спека, проверять имя поля в сообщении ошибки
    - **Validates: Requirements 4.4**

- [x] 2. Габариты комнаты и пресеты расстановки
  - [x] 2.1 Реализовать `computeRoomDimensions`
    - Добавить в `sceneSpec.ts` детерминированный вывод W×L×H из `(roomType, areaM2)` (табличные соотношения сторон + фиксированная высота)
    - Гарантировать строго положительные W, L, H
    - _Requirements: 2.1, 2.4_

  - [x]* 2.2 Property-тест детерминизма и положительности габаритов
    - **Property 3: Габариты комнаты детерминированы и положительны**
    - **Validates: Requirements 2.1, 2.4**

  - [x] 2.3 Реализовать `Layout_Preset` и `selectLayoutPreset`
    - Создать `artifacts/api-server/src/lib/blockout/layoutPresets.ts` с захардкоженными пресетами по типу помещения
    - Каждый предмет — примитив (box/простой меш) без материалов/текстур, с позицией, габаритами (>0) и `rotationDeg ∈ {0,90,180,270}` в мировых координатах
    - `selectLayoutPreset(roomType)` бросает ошибку с именем типа, если пресета нет
    - _Requirements: 3.1, 3.2, 3.3, 3.5_

  - [x]* 2.4 Property-тест выбора пресета по типу
    - **Property 6: Выбор Layout_Preset соответствует типу помещения**
    - **Validates: Requirements 3.1**

  - [x]* 2.5 Property-тест примитивов пресета с валидными трансформами
    - **Property 7: Предметы пресета — примитивы с полными валидными трансформами**
    - **Validates: Requirements 3.2, 3.3**

  - [x]* 2.6 Property-тест «отсутствие пресета называет тип помещения»
    - **Property 9: Отсутствие пресета называет тип помещения**
    - **Validates: Requirements 3.5**

- [x] 3. Сборка Scene_Spec, оболочка, камеры и экспорт позиций
  - [x] 3.1 Реализовать `buildSceneSpec`
    - Добавить в `sceneSpec.ts`: валидация площади (ошибка с типом помещения и минимальной площадью, если меньше минимума), построение `shell` (размещение ровно одной двери и одного окна на указанных стенах в пределах их протяжённости), фиксированный `Camera_Rig` (ровно 4 perspective + 1 top_ortho + 1 isometric с переиспользуемыми позициями)
    - Гарантировать, что мебель пресета помещается в границы `Room_Shell`
    - _Requirements: 2.2, 2.3, 2.5, 3.4, 5.1, 5.4_

  - [x]* 3.2 Property-тест «площадь ниже минимума»
    - **Property 4: Отклонение площади ниже минимума**
    - **Validates: Requirements 2.5**

  - [x]* 3.3 Property-тест «проёмы лежат на указанной стене»
    - **Property 5: Проёмы лежат на указанной стене**
    - **Validates: Requirements 2.3**

  - [x]* 3.4 Property-тест «мебель в границах Room_Shell»
    - **Property 8: Мебель помещается в границы Room_Shell** (AABB с учётом поворота внутри `[0..W]×[0..L]×[0..H]`)
    - **Validates: Requirements 3.4**

  - [x]* 3.5 Property-тест фиксированного состава Camera_Rig
    - **Property 10: Состав Camera_Rig фиксирован и детерминирован**
    - **Validates: Requirements 5.1, 5.4**

  - [x] 3.6 Реализовать канонический экспорт позиций мебели (TS)
    - Создать `artifacts/api-server/src/lib/blockout/positions.ts` с `buildPositionsExport(spec): PositionsExport` (ровно одна запись на предмет по `id` с позицией/габаритами/ориентацией из `Scene_Spec`) — каноническая форма `positions.json`, используемая для проверки `Geometric_Consistency`
    - _Requirements: 7.3_

  - [x]* 3.7 Property-тест геометрической согласованности по камерам
    - **Property 11: Геометрическая согласованность по всем камерам** (множество позиций не зависит от камеры; проверка по данным `Scene_Spec`/экспорту, не по пикселям)
    - **Validates: Requirements 7.1, 7.2, 7.4**

  - [x]* 3.8 Property-тест полноты экспорта позиций
    - **Property 12: Полнота экспорта позиций мебели**
    - **Validates: Requirements 7.3**

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Blockout_Builder (Blender Python)
  - [x] 5.1 Реализовать парсинг и валидацию `Scene_Spec` в Blender-скрипте
    - Создать `artifacts/api-server/scripts/blockout/blockout_builder.py` с CLI `-- --scene scene.json --out <work_dir>`
    - `parse_scene_spec(path)` — зеркальная проверка ключей/типов схемы; при нарушении `sys.exit(<non-zero>)` с именем первого нарушенного поля
    - _Requirements: 4.2, 4.4_

  - [x] 5.2 Реализовать построение оболочки и расстановку мебели
    - `build_room_shell(spec)` — 4 стены, пол, потолок, ровно одно окно и одна дверь из W×L×H по позициям `shell`; положительные W/L/H
    - `place_furniture(spec)` — инстанцировать предметы `Layout_Preset` как примитивы без материалов/текстур в мировых координатах, проверять нахождение внутри границ `Room_Shell`
    - _Requirements: 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4_

  - [x] 5.3 Реализовать камеры и рендер карт глубины
    - `setup_camera_rig(spec)` — создать камеры из `cameraRig`
    - `render_depth_maps(spec, out)` — EEVEE Next, по одной `Depth_Map` на камеру (Z/Depth-проход через Compositor); при `renderNormals` — ещё и одну `Normal_Map` на камеру
    - _Requirements: 5.1, 5.2, 5.3, 12.2_

  - [x] 5.4 Реализовать экспорт мировых позиций мебели
    - `export_positions(spec, out)` — записать `positions.json` (одна запись на предмет: позиция/габариты/ориентация), один раз на сцену
    - _Requirements: 7.3_

  - [x]* 5.5 Интеграционный/smoke-тест рендера глубины
    - Запуск headless Blender; проверить, что число `Depth_Map` равно числу камер, а при `renderNormals` число `Normal_Map` равно числу камер; проверить движок EEVEE Next и запуск `blender --background --python`
    - _Requirements: 5.2, 5.3, 12.1, 12.2_

- [x] 6. Depth_ControlNet_Wrapper (TS, в falAi.ts)
  - [x] 6.1 Реализовать `falDepthControlNetRepaint`
    - Добавить в `artifacts/api-server/src/lib/falAi.ts` обёртку по существующему паттерну: raw `fetch`, заголовок `Authorization: Key ${FAL_API_KEY}`, базовый URL `https://fal.run/{model}`; модель из env `FAL_MODEL_DEPTH_CONTROLNET` (default `fal-ai/flux-control-lora-depth/image-to-image`)
    - Передавать `Depth_Map` как структурный управляющий сигнал; возвращать `costKopeks`
    - Ввести `NsfwBlockedError extends Error { costKopeks }`: при `has_nsfw_concepts=true` не возвращать изображение, бросать ошибку с доступной стоимостью
    - При HTTP-ошибке/пустом результате — ошибка с HTTP-статусом и текстом ответа (`Fal.ai HTTP {status}: {text}`)
    - _Requirements: 6.1, 6.2, 6.5, 6.6, 6.7, 1.5_

  - [x]* 6.2 Property-тест «Depth_Map как структурный сигнал»
    - **Property 13: Depth_Map передаётся как структурный управляющий сигнал** (мок `fetch`, проверка тела запроса)
    - **Validates: Requirements 6.2**

  - [x]* 6.3 Property-тест возврата стоимости
    - **Property 15: Обёртка возвращает стоимость в копейках** (неотрицательная)
    - **Validates: Requirements 6.5**

  - [x]* 6.4 Property-тест NSFW-отказа со стоимостью
    - **Property 16: NSFW даёт ошибку без изображения, но со стоимостью**
    - **Validates: Requirements 6.6, 6.7**

  - [x]* 6.5 Property-тест ошибок провайдера с HTTP-статусом и текстом
    - **Property 17: Ошибки провайдера несут HTTP-статус и текст** (статус `>=400` или пустой набор изображений)
    - **Validates: Requirements 1.5**

  - [x]* 6.6 Unit-тест соответствия паттерну falAi
    - Проверить URL `https://fal.run/{model}` и заголовок `Authorization: Key {FAL_API_KEY}` (мок `fetch`)
    - _Requirements: 6.1_

- [x] 7. Cost guard (учёт бюджета)
  - [x] 7.1 Расширить `designCostGuard.ts` аккумулятором бюджета B2
    - Аккумулировать `costKopeks` по всем вызовам `Depth_ControlNet_Provider` (включая NSFW-отказы)
    - Перед каждым вызовом проверять верхнюю границу `Cost_Budget` ($0.6); при превышении — прекращать дальнейшие вызовы и сообщать о превышении; выводить итоговую стоимость в копейках
    - _Requirements: 12.4, 12.5_

  - [x]* 7.2 Property-тест суммарной стоимости
    - **Property 21: Суммарная стоимость равна сумме вызовов провайдера**
    - **Validates: Requirements 12.4**

  - [x]* 7.3 Property-тест отсечки по бюджету
    - **Property 22: Отсечка по бюджету прекращает вызовы провайдера**
    - **Validates: Requirements 12.5**

- [x] 8. Composer adapter (без смены контракта)
  - [x] 8.1 Реализовать `buildInfographicInput`
    - Создать `artifacts/api-server/src/lib/blockout/composerAdapter.ts`: 4 фото-`Photoreal_Repaint` → `views`, изометрия → `isometric` (или `null`), ортография сверху → `topDownPlanPng` (или `null`); прочие поля (`design`, метки, кропы) передаются без изменений
    - Вызов `composeInfographic(input)` без изменения сигнатуры и формы `InfographicInput`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x]* 8.2 Property-тест маппинга слотов
    - **Property 18: Маппинг слотов композитора**
    - **Validates: Requirements 8.1, 8.2, 8.3**

  - [x]* 8.3 Property-тест сохранения прочих полей
    - **Property 19: Прочие поля InfographicInput сохраняются без изменений**
    - **Validates: Requirements 8.5**

  - [x]* 8.4 Unit-тест неизменного вызова композитора
    - `composeInfographic` вызывается с валидным `InfographicInput` без изменения сигнатуры
    - _Requirements: 8.4_

- [x] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Загрузка в R2 и валидация окружения хранилища
  - [x] 10.1 Реализовать загрузку артефактов в Object_Storage
    - Создать `artifacts/api-server/src/lib/blockout/storage.ts`: `uploadDepthMaps()` и `uploadBoard()` через `objectStorage.ts` (`R2File.save`), возврат публичных URL
    - Проверять обязательные env (`R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL`, `DEFAULT_OBJECT_STORAGE_BUCKET_ID`); при отсутствии — ошибка с именем отсутствующей переменной
    - _Requirements: 10.1, 10.2, 10.3_

  - [x]* 10.2 Property-тест «отсутствие env-переменной называет переменную»
    - **Property 20: Отсутствие env-переменной хранилища называет переменную**
    - **Validates: Requirements 10.3**

- [x] 11. Оркестрация перекраски (ретраи и деградация)
  - [x] 11.1 Реализовать `repaintAll`
    - Создать `artifacts/api-server/src/lib/blockout/repaint.ts`: один вызов `falDepthControlNetRepaint` на камеру с единым `Shared_Style_Prompt` (число `Photoreal_Repaint` = числу камер)
    - Ретраи с фиксированным лимитом попыток на `Depth_Map`; стойкий сбой iso/ortho → поле `null` (остальные камеры обрабатываются немедленно); стойкий сбой любой из 4 фото-камер → немедленная остановка с указанием камеры
    - Интеграция с cost guard (отсечка по `Cost_Budget`, учёт стоимости NSFW)
    - _Requirements: 6.3, 6.4, 12.5, 13.2, 13.3, 13.4_

  - [x]* 11.2 Property-тест единого промпта и одной перекраски на камеру
    - **Property 14: Единый промпт и одна перекраска на камеру**
    - **Validates: Requirements 6.3, 6.4**

  - [x]* 11.3 Property-тест ограниченного числа попыток
    - **Property 23: Число попыток на Depth_Map ограничено**
    - **Validates: Requirements 13.2**

  - [x]* 11.4 Property-тест деградации изометрии/ортографии в null
    - **Property 24: Деградация изометрии/ортографии в null**
    - **Validates: Requirements 13.3**

  - [x]* 11.5 Property-тест остановки при сбое фото-камеры
    - **Property 25: Сбой фото-камеры прекращает сборку с указанием камеры**
    - **Validates: Requirements 13.4**

- [x] 12. Публикация SEO_Page
  - [x] 12.1 Реализовать `publishSeoPage`
    - Создать `artifacts/api-server/src/lib/blockout/seoPublish.ts`: вставка строки в `designs` (`status=completed`, `is_public=true`, `views[]`, `resultImageUrl`, `content`) только в окружении Railway с доступной БД
    - При недоступном `DATABASE_URL`/не Railway или недоступной БД — пропуск публикации без падения, сохранение `boardPublicUrl` в выводе для повторной публикации
    - _Requirements: 11.1, 11.3, 11.4, 11.5_

  - [x]* 12.2 Property-тест сохранения URL борда при сбое публикации
    - **Property 26: URL борда сохраняется при сбое публикации**
    - **Validates: Requirements 11.5**

  - [x]* 12.3 Unit-тесты ветвлений окружения/БД
    - Нет `DATABASE_URL` локально → публикация пропущена; БД down → пропуск без падения; партия из N городов → запуск N проектов
    - _Requirements: 11.2, 11.3, 11.4_

- [x] 13. Сборка пайплайна, детект окружения и CLI
  - [x] 13.1 Реализовать детект окружения и запуск Blockout_Builder
    - В `artifacts/api-server/src/lib/blockout/pipeline.ts`: `assertRenderEnvironment()` (проверка бинаря Blender; иначе сообщение + предложение `Fallback_2D_Path`, без запуска 3D-пути) и `runBlockoutBuilder()` (запуск Blender как дочернего процесса; при ненулевом коде — остановка 3D-пути и предложение fallback)
    - Каждый шаг логирует имя шага и причину при сбое
    - _Requirements: 9.3, 13.1, 13.5_

  - [x] 13.2 Реализовать `runBlockoutPipeline` и CLI-вход
    - В `pipeline.ts` соединить шаги: `buildSceneSpec`→`serializeSceneSpec`→`scene.json`→builder→`uploadDepthMaps`→`repaintAll`→`buildInfographicInput`→`composeInfographic`→`uploadBoard`→`publishSeoPage`; сформировать объект вывода (`boardPublicUrl`, `depthMapUrls`, `repaintUrls`, `totalCostKopeks`, `published`, `skippedPublishReason`)
    - Создать CLI `artifacts/api-server/scripts/blockout/run-blockout.ts` (`npx tsx`)
    - _Requirements: 4.1, 8.1, 8.2, 8.3, 8.4, 8.5, 10.1, 10.2, 11.5, 13.5_

  - [x]* 13.3 Property-тест сообщения о сбое шага
    - **Property 27: Сообщение о сбое называет шаг и причину**
    - **Validates: Requirements 13.5**

  - [x]* 13.4 Unit-тесты ветвления fallback
    - `Fallback_2D_Path` не вызывает Blender и не трогает `Render_Environment`; отсутствие Blender → сообщение + предложение fallback; `generate-design-board.ts` присутствует и его контракт не изменён
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 14. R&D-прототип удержания расстановки
  - [x] 14.1 Реализовать CLI-прототип
    - Создать `artifacts/api-server/scripts/blockout/prototype.ts`: для одной комнаты/одного стиля прогнать 4 фото-камеры из подготовленных `Depth_Map` через `falDepthControlNetRepaint` с единым `Shared_Style_Prompt`; сохранять входные `Depth_Map` и `Photoreal_Repaint` в R2 и выводить публичные URL; при флаге сравнения дополнительно сохранять артефакт `Fallback_2D_Path`; при ошибке/пустом результате провайдера — ненулевой код возврата с HTTP-статусом и текстом
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x]* 14.2 Интеграционный тест прототипа
    - Реальные вызовы fal для одной комнаты/4 камер, сохранение `Depth_Map` и `Photoreal_Repaint` в R2 с выводом URL
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 15. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Задачи с `*` опциональны (тесты) и могут быть пропущены для быстрого MVP; основные задачи реализации не помечаются опциональными.
- Property-тесты на `fast-check` + `node:test` по образцу `__tests__/dizajn/layout-json-roundtrip.property.test.ts`: ≥100 итераций, комментарий-метка **Feature: ai-design-3d-blockout, Property {number}: {property_text}**, по одному тесту на каждое из 27 свойств.
- Внешние зависимости (fal, Blender, R2, БД) мокаются в property/unit-тестах; реальные вызовы — только в интеграционных/smoke-тестах.
- Геометрические свойства (8, 11, 12) проверяются по данным `Scene_Spec`/`positions.json`, не по пикселям.
- Каждая задача ссылается на конкретные требования для трассируемости; контракт `infographicComposer.ts` и `Fallback_2D_Path` не изменяются.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.3", "6.1", "7.1", "8.1", "10.1"] },
    { "id": 1, "tasks": ["2.1", "1.2", "1.3", "2.4", "2.5", "2.6", "6.2", "6.3", "6.4", "6.5", "6.6", "7.2", "7.3", "8.2", "8.3", "8.4", "10.2"] },
    { "id": 2, "tasks": ["3.1", "2.2", "5.1", "11.1", "12.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6", "5.2", "11.2", "11.3", "11.4", "11.5", "12.2", "12.3", "13.1"] },
    { "id": 4, "tasks": ["3.7", "3.8", "5.3", "13.2"] },
    { "id": 5, "tasks": ["5.4", "13.3", "13.4", "14.1"] },
    { "id": 6, "tasks": ["5.5", "14.2"] }
  ]
}
```
