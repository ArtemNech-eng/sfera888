# Implementation Plan

## Overview

Этот план следует исследовательской методологии bugfix: сначала пишем тесты, фиксирующие дефект (Bug Condition) и текущее поведение (Preservation) на **неисправленном** коде, затем применяем фикс по разделам A–G дизайна и убеждаемся, что дефект закрыт без регрессий.

Тест-стек: Node built-in runner + `fast-check@4` (`pnpm --filter @workspace/api-server test`). Чистые хелперы раскладки `DesignBoard` тестируются напрямую (вынесены из компонента — см. дизайн §A.5).

Нумерация `Property N` совпадает с разделом **Correctness Properties** дизайна, чтобы hover-статус property-тестов работал корректно. Дефекты разделены на Группу A (рендер страницы результата) и Группу B (качество AI-генерации).

## Tasks

### Фаза 1 — Exploration tests (Bug Condition) ДО фикса

- [x] 1. Написать property-тест bug-condition для адаптивной сетки ракурсов ROW1
  - **Property 1: Bug Condition** - Адаптивная сетка ракурсов под фактическое число кадров
  - **CRITICAL**: Этот тест ДОЛЖЕН ПАДАТЬ на неисправленном коде — падение подтверждает дефект (1.1)
  - **DO NOT** чинить тест или код при падении — фиксируем контрпример
  - **GOAL**: Показать пустые ячейки `sm:grid-cols-4` при `mainViews.length < 4`
  - **Scoped PBT Approach**: генерировать `mainViews.length ∈ {1,2,3,4}` (fast-check) и ассертить инвариант «число ячеек сетки == число ракурсов, пустых треков нет»
  - Источник bug condition: `isBugCondition(state).has_view_holes` (дизайн §Bug Condition)
  - Ассерты соответствуют Expected Behavior Property 1 (число ячеек == число ракурсов)
  - Прогнать на неисправленном `DesignBoard` (рендер подмножества) — **EXPECTED OUTCOME: FAIL** для `n ∈ {1,2,3}`
  - Документировать контрпример (например, `n=1` → 1 фото + 3 пустые ячейки)
  - Отметить задачу выполненной, когда тест написан, прогнан и падение задокументировано
  - _Requirements: 1.1, 2.1_

- [x] 2. Написать property-тест bug-condition для устойчивости ROW2 (изометрия/план)
  - **Property 2: Bug Condition** - Устойчивость ROW2 к отсутствию изометрии/плана
  - **CRITICAL**: Тест ДОЛЖЕН ПАДАТЬ на неисправленном коде (1.2)
  - **GOAL**: Показать, что `lg:grid-cols-[1fr_2fr_auto]` резервирует пустой `1fr` при `isometricView=null AND topDownPlanUrl=null`
  - **Scoped PBT Approach**: перебрать все 4 комбинации присутствия `isometricView`/`topDownPlanUrl`; ассертить, что в grid-template ROW2 нет трека без контента (left включён ⟺ есть изометрия или план)
  - Источник bug condition: `isBugCondition(state).left_col_empty` (дизайн §Bug Condition)
  - Прогнать на неисправленном коде — **EXPECTED OUTCOME: FAIL** для комбинации без left
  - Документировать контрпример (пустая левая колонка, смещение центра/палитры)
  - _Requirements: 1.2, 2.2_

- [x] 3. Написать property-тест bug-condition для пустых опциональных секций
  - **Property 3: Bug Condition** - Опциональные секции без пустых блоков
  - **CRITICAL**: Тест ДОЛЖЕН ПАДАТЬ на неисправленном коде (1.3)
  - **GOAL**: Показать висящий плейсхолдер «Палитра уточняется.» и заголовки пустых секций
  - **Scoped PBT Approach**: генерировать пустые/непустые `colorPalette`, `materials`, `estimate`, `solutions`, `detailCrops`; для пустой секции ассертить отсутствие её заголовка и плейсхолдера в выводе
  - Источник bug condition: `isBugCondition(state).empty_section_rendered` (дизайн §Bug Condition)
  - Прогнать на неисправленном коде — **EXPECTED OUTCOME: FAIL** (рендерится «Палитра уточняется.» / пустой блок)
  - Документировать контрпример
  - _Requirements: 1.3, 2.3_

- [x] 4. Написать property-тест bug-condition для адаптивной сборки инфографики
  - **Property 5: Bug Condition** - Адаптивная сборка инфографики
  - **CRITICAL**: Тест ДОЛЖЕН ПАДАТЬ на неисправленном коде (1.5)
  - **GOAL**: Показать дублирование hero и пустые зоны при неполном наборе входов
  - **Scoped PBT Approach**: генерировать `views.length ∈ {1..4}`, наличие/отсутствие изометрии, `detailCrops ∈ {0..6}`; ассертить «число занятых слотов == число реальных ассетов, без дублей и пустых зон»
  - Источник bug condition: `isBugCondition(state).infographic_distorted` + `pickFourViews` дублирует hero (дизайн §Hypothesized Root Cause A3)
  - Прогнать `composeInfographic`/воркер-путь на неисправленном коде — **EXPECTED OUTCOME: FAIL** (4 одинаковых кадра при `views<4`)
  - Документировать контрпример
  - _Requirements: 1.5, 2.5_

- [x] 5. Написать exploration-тест bug-condition для надёжной модели Layout_Planner
  - **Property 6: Bug Condition** - Надёжная модель Layout_Planner
  - **CRITICAL**: Тест ДОЛЖЕН ПАДАТЬ на неисправленном коде (1.6)
  - **GOAL**: Показать, что модель читается на module-load и/или дефолт ненадёжен (`claude-opus-4-7`), что приводит к исчерпанию retries → `failed`
  - **Scoped PBT Approach**: мок OpenAI-клиента под «слабую» модель; ассертить, что выбор модели — read-fresh из `AI_INTEGRATIONS_DESIGN_MODEL` на момент вызова с надёжным дефолтом
  - Источник bug condition: `isBugConditionB(genState).weak_model` (дизайн §Bug Condition B6)
  - Прогнать на неисправленном коде — **EXPECTED OUTCOME: FAIL** (нет read-fresh / ненадёжный дефолт)
  - Документировать контрпример (смена env не влияет без рестарта)
  - _Requirements: 1.6, 2.6_

- [x] 6. Написать exploration-тест bug-condition для функционального правдоподобия плана
  - **Property 7: Bug Condition** - Функциональное правдоподобие плана
  - **CRITICAL**: Тест ДОЛЖЕН ПАДАТЬ на неисправленном коде (1.7)
  - **GOAL**: Показать, что `validateLayout` принимает неубедительный план (кровать «плавает» по центру bedroom → `ok:true`)
  - **Scoped PBT Approach**: каноничные неубедительные планы (нет ключевой мебели / нереалистичные габариты / «плавающая» мебель); ассертить, что валидатор отклоняет (`ok:false` с кодами `MISSING_FUNCTIONAL_ITEM`/`UNREALISTIC_DIMENSIONS`/`FLOATING_FURNITURE`)
  - Источник bug condition: `isBugConditionB(genState).implausible_layout` (дизайн §Bug Condition B7)
  - Прогнать на неисправленном коде — **EXPECTED OUTCOME: FAIL** (валидатор возвращает `ok:true`)
  - Документировать контрпример
  - _Requirements: 1.7, 2.7_

- [x] 7. Написать exploration-тест bug-condition для разрешения и identity ракурсов
  - **Property 8: Bug Condition** - Разрешение и identity ракурсов
  - **CRITICAL**: Тест ДОЛЖЕН ПАДАТЬ на неисправленном коде (1.8)
  - **GOAL**: Показать апскейл 512→1024 при нарезке коллажа 2×2 (потеря детализации/identity)
  - **Scoped PBT Approach**: ассертить выбор стратегии ракурсов — `chosenViewResolution == NATIVE_VIEW_PX` (1024) без апскейла из 512-px квадранта, либо optional-деградация
  - Источник bug condition: `isBugConditionB(genState).low_res_views` (дизайн §Bug Condition B8)
  - Прогнать на неисправленном коде — **EXPECTED OUTCOME: FAIL** (success-путь использует апскейл 512→1024)
  - Документировать контрпример
  - _Requirements: 1.8, 2.8_

- [x] 8. Написать exploration-тест bug-condition для соответствия стилю и фото пользователя
  - **Property 9: Bug Condition** - Соответствие стилю и фото пользователя
  - **CRITICAL**: Тест ДОЛЖЕН ПАДАТЬ на неисправленном коде (1.9)
  - **GOAL**: Показать, что при наличии `design.input_image_url` (user-upload) hero генерится text2img (`falGenerateGptImage`) без подачи фото как reference
  - **Scoped PBT Approach**: проект с пользовательским фото; ассертить, что генерация ракурсов вызывает edit-image провайдер с `image_urls=[userPhotoUrl]`, `input_fidelity:"high"`
  - Источник bug condition: `isBugConditionB(genState).ignores_input` (дизайн §Bug Condition B9)
  - Прогнать на неисправленном коде — **EXPECTED OUTCOME: FAIL** (фото не подаётся как reference)
  - Документировать контрпример
  - _Requirements: 1.9, 2.9_

### Фаза 2 — Preservation tests ДО фикса (observation-first)

- [x] 9. Написать property-тесты preservation для полного и Showcase-проекта
  - **Property 10: Preservation** - Идентичный рендер полного и Showcase-проекта
  - **IMPORTANT**: Следовать observation-first методологии
  - Observe: на неисправленном коде рендер **полного** `Artifact_Set` (4 ракурса, изометрия, план, палитра, материалы, смета, решения, 6 detail-кропов) даёт grid-классы ROW1 `grid-cols-2 sm:grid-cols-4`, ROW2 `lg:grid-cols-[1fr_2fr_auto]`, ROW3 `lg:grid-cols-[1fr_3fr]`
  - Observe: редакторский `Showcase_Project` (без `anon_id`) рендерится с теми же блоками
  - Зафиксировать snapshot grid-треков/блоков для полного набора как baseline
  - Написать property-тест: для всех **полных** наборов (`NOT isBugCondition(state)`) разметка == текущая (редукция к существующей сетке)
  - Прогнать на неисправленном коде — **EXPECTED OUTCOME: PASS** (фиксируем baseline)
  - Отметить задачу выполненной, когда тесты написаны, прогнаны и проходят на неисправленном коде
  - _Requirements: 3.5, 3.7_

- [x] 10. Написать тесты preservation для fail/budget/guard-семантики
  - **Property 11: Preservation** - Неизменность fail/budget/guard-семантики
  - **IMPORTANT**: Следовать observation-first методологии
  - Observe: сбой обязательного шага (`Layout_JSON`/`Hero_Render`/`Real_Estimate`/AI-текст) → `status=failed`, `is_public=false`, пользовательское сообщение (`markFailed`, `RequiredStepFailedError`, `assertCompletionInvariant`)
  - Observe: превышение `Cost_Ceiling` → `failed` + «превышен бюджет генерации» (`enforceCostCeiling`, `BudgetExceededError`)
  - Observe: captcha/rate-limit на `/ai-design` применяются без изменений
  - Написать тесты, фиксирующие наблюдаемое поведение fail-путей (cases где `NOT isBugCondition`)
  - Прогнать на неисправленном коде — **EXPECTED OUTCOME: PASS** (baseline fail-семантики)
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

### Фаза 3 — Реализация фикса (разделы A–G дизайна)

- [x] 11. Применить фикс качества AI-дизайна (Группы A и B)

  - [x] 11.1 Адаптивный рендер страницы `DesignBoard` (дизайн §A)
    - Файл: `artifacts/marketplace/components/dizajn/DesignBoard.tsx`
    - Ввести чистые хелперы `viewsGridClass(n)`, `row2TemplateClass({hasLeft, hasPalette})`, `row3TemplateClass({hasSolutions, hasCrops})`; вынести рядом с компонентом/в локальный модуль для прямого property-тестирования
    - ROW1: адаптировать колонки/span под `mainViews.length` (1→full width, 2→`grid-cols-2`, 3→без дыр, 4→текущее `grid-cols-2 sm:grid-cols-4`)
    - ROW2: вычислять `hasLeft = Boolean(isometricView || topDownPlanUrl)`, `hasPalette`; строить grid-template динамически; левую колонку/палитру рендерить только при наличии
    - Удалить висящий плейсхолдер палитры (ветка «Палитра уточняется.»)
    - ROW3: `hasSolutions`/`hasCrops`; не рендерить пустую ROW3; оставшийся блок занимает всю ширину
    - _Bug_Condition: isBugCondition(state) — has_view_holes OR left_col_empty OR empty_section_rendered_
    - _Expected_Behavior: Properties 1, 2, 3 (число ячеек == число артефактов, треки без пустот, нет висящих плейсхолдеров)_
    - _Preservation: полный набор редуцируется к текущей сетке (Property 10)_
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 11.2 Адаптивная сборка инфографики (дизайн §B)
    - Файл: `artifacts/api-server/src/lib/infographicComposer.ts`
    - Расширить `InfographicInput`: `views: Buffer[]` (1..4), `isometric: Buffer | null`, `detailCrops: Buffer[]` (0..6); заменить кортежи фиксированной длины
    - Вычислять прямоугольники слотов из фактических длин; middle-блок изометрии — только при `isometric != null`; caption'ы/SVG-overlay по фактическим длинам
    - Файл: `artifacts/api-server/src/lib/designWorker.ts` — шаг 11: убрать жёсткий гейт `composerViews && isometricBuffer && cropBuffers.length === 6`; передавать только реальные буферы (без hero-дублей из `pickFourViews`), `isometricBuffer` как `Buffer | null`, фактические `cropBuffers`; минимальный гейт `≥1` реальный ракурс + `content`; шаг остаётся optional
    - _Bug_Condition: isBugCondition(state).infographic_distorted + pickFourViews дублирует hero_
    - _Expected_Behavior: Property 5 (занятых слотов == реальных ассетов, без дублей/пустот)_
    - _Preservation: optional-классификация шага 11 не меняется (3.2)_
    - _Requirements: 2.5_

  - [x] 11.3 Публикационный порог флагмана (дизайн §C)
    - Файл: `artifacts/api-server/src/lib/designWorker.ts` — расширить `assertCompletionInvariant`
    - Ввести константу модуля `FLAGSHIP_MIN_VIEWS` (например, 2) и `Flagship_Publication_Threshold`: требовать `views.length ≥ FLAGSHIP_MIN_VIEWS` сверх required-артефактов
    - Если порог не достигнут — `RequiredStepFailedError(STEP_ANGLE_RENDERS, "не удалось собрать связный набор ракурсов")` → стандартный fail-путь (`is_public=false`)
    - Семантику остальных required-проверок не трогать
    - _Bug_Condition: isBugCondition(state) для вырожденного набора (один дублированный hero)_
    - _Expected_Behavior: Property 4 (связная страница из подмножества ИЛИ failed при недостижении порога)_
    - _Preservation: остальные required-проверки и fail-семантика без изменений (Property 11, 3.2)_
    - _Requirements: 2.4_

  - [x] 11.4 Надёжная модель Layout_Planner с read-fresh (дизайн §D)
    - Файл: `artifacts/api-server/src/lib/designConfig.ts` — добавить `getDesignModel()` по образцу `getEditImageProvider()`: read-fresh `AI_INTEGRATIONS_DESIGN_MODEL` → fallback `AI_INTEGRATIONS_OPENAI_MODEL` → надёжный дефолт с поддержкой `json_schema` structured outputs; пустые/мусорные значения → дефолт с предупреждением
    - Файл: `artifacts/api-server/src/lib/layoutPlanner.ts` — заменить module-load `const model = ...` на вызов `getDesignModel()` внутри `generateOnce`
    - Файл: `.env.example` — документировать рекомендованное значение `AI_INTEGRATIONS_DESIGN_MODEL`
    - _Bug_Condition: isBugConditionB(genState).weak_model_
    - _Expected_Behavior: Property 6 (read-fresh модель с надёжным дефолтом, план стабильно проходит схему/валидатор)_
    - _Preservation: успешный план по-прежнему завершает пайплайн → completed (3.1)_
    - _Requirements: 2.6_

  - [x] 11.5 Plausibility-проверка плана (дизайн §E)
    - Файл: `artifacts/api-server/src/lib/geometricValidator.ts`
    - Добавить коды в `ViolationCode`: `MISSING_FUNCTIONAL_ITEM`, `UNREALISTIC_DIMENSIONS`, `FLOATING_FURNITURE`
    - Новая чистая функция `validatePlausibility(room, furniture): ValidationViolation[]`: ключевая мебель по типу комнаты (`FUNCTIONAL_TYPES_BY_ROOM`, для bedroom — `bed`); реалистичные габариты по типу; ключевая мебель примыкает к стене (не «плавает»)
    - В `validateLayout` дописать `violations.push(...validatePlausibility(...))` — нарушения автоматически попадают в `previousViolations` retry-цикла
    - _Bug_Condition: isBugConditionB(genState).implausible_layout_
    - _Expected_Behavior: Property 7 (валидатор отклоняет неубедительный план и уводит в retry-подсказку)_
    - _Preservation: базовая геометрическая валидация не меняется_
    - _Requirements: 2.7_

  - [x] 11.6 Identity-preserving ракурсы нативного разрешения (дизайн §F)
    - Файл: `artifacts/api-server/src/lib/designWorker.ts` — шаги 2–3
    - Шаг 2 (`Hero_Render`, required): без изменений по статусу, генерировать view 1 в нативном 1024
    - Шаг 3 (angle renders, optional): для ракурсов 2..4 вызывать `getEditImageProvider()` → `falGenerateGptImageEdit`/`falGenerateFluxKontextPro` с `image_urls=[heroUrl]`, `quality:"high"`, `input_fidelity:"high"`; каждый под `withCostGuard`
    - Деградация: если edit-image недоступен/упал после повтора — fallback на коллаж-нарезку (collage 2×2 → sharp); angle renders остаются optional (сбой не уводит в `failed`)
    - Убрать апскейл 512→1024 в success-пути (оставить только в fallback-ветке)
    - _Bug_Condition: isBugConditionB(genState).low_res_views_
    - _Expected_Behavior: Property 8 (нативное 1024 + identity, либо optional-деградация без failed)_
    - _Preservation: optional-классификация angle renders и Cost_Ceiling не нарушаются (3.2, 3.3, Property 11)_
    - _Requirements: 2.8_

  - [x] 11.7 Соответствие стилю и фото пользователя (дизайн §G)
    - Файл: `artifacts/api-server/src/lib/designWorker.ts` + промпт-билдеры
    - При наличии пользовательского фото (`design.input_image_url`, user-upload, не seed) — подавать его как reference в hero/ракурсы через edit-image (`image_urls=[userPhotoUrl]`, `input_fidelity:"high"`); для seed-проектов поведение не меняется
    - Усилить привязку стиля в `buildHeroCollagePrompt`/angle-промптах: явный стилевой клаузис из `STYLE_RU_CLAUSES` в начале промпта + `NEGATIVE_PROMPT`-подобная защита (где поддерживается провайдером)
    - Required/optional-классификация шагов не меняется
    - _Bug_Condition: isBugConditionB(genState).ignores_input_
    - _Expected_Behavior: Property 9 (фото как reference + усиленная привязка стиля)_
    - _Preservation: seed-проекты и классификация шагов без изменений_
    - _Requirements: 2.9_

### Фаза 4 — Верификация (повторный прогон тестов)

- [x] 12. Проверить, что дефект закрыт и регрессий нет

  - [x] 12.1 Подтвердить, что exploration-тесты bug-condition теперь проходят
    - **Property 1: Expected Behavior** - Адаптивная сетка ракурсов ROW1
    - **Property 2: Expected Behavior** - Устойчивость ROW2
    - **Property 3: Expected Behavior** - Опциональные секции без пустых блоков
    - **Property 5: Expected Behavior** - Адаптивная инфографика
    - **Property 6: Expected Behavior** - Надёжная модель Layout_Planner
    - **Property 7: Expected Behavior** - Функциональное правдоподобие плана
    - **Property 8: Expected Behavior** - Разрешение и identity ракурсов
    - **Property 9: Expected Behavior** - Соответствие стилю и фото
    - **IMPORTANT**: Перепрогнать ТЕ ЖЕ тесты из задач 1–8 — НЕ писать новые
    - **EXPECTED OUTCOME**: все тесты ПРОХОДЯТ (дефект закрыт)
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.8, 2.9_

  - [x] 12.2 Подтвердить, что preservation-тесты по-прежнему проходят
    - **Property 10: Preservation** - Идентичный рендер полного и Showcase-проекта
    - **Property 11: Preservation** - Неизменность fail/budget/guard-семантики
    - **IMPORTANT**: Перепрогнать ТЕ ЖЕ тесты из задач 9–10 — НЕ писать новые
    - **EXPECTED OUTCOME**: тесты ПРОХОДЯТ (нет регрессий; полный набор → та же разметка; fail/budget/captcha без изменений)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7_

  - [x] 12.3 Integration-проверка публикационного порога и edit-image пути
    - Полный прогон воркера с деградированными опциональными шагами → `completed` со связной адаптивной страницей либо `failed` при недостижении `Flagship_Publication_Threshold` (Property 4)
    - Прогон с пользовательским фото → ракурсы edit-image с референсом на фото (Property 9)
    - Прогон с identity-preserving ракурсами → 4 кадра нативного 1024; при форс-сбое edit-image — fallback на коллаж-нарезку без перевода в `failed` (Property 8, 3.2)
    - _Requirements: 2.4, 2.8, 2.9, 3.2_

- [x] 13. Checkpoint — убедиться, что все тесты проходят
  - Запустить `pnpm --filter @workspace/api-server test` и тесты marketplace-компонента
  - Прогнать `typecheck`
  - Убедиться, что все unit/property/integration тесты зелёные; при возникновении вопросов — обратиться к пользователю
  - Примечание: визуальное правдоподобие/соответствие стилю и фото (1.7–1.9) проверяется ручной/смотровой проверкой на выборке стилей и комнат — не покрывается чистым PBT
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

## Task Dependency Graph

Волны исполнения (задачи внутри одной волны независимы и могут выполняться параллельно; каждая волна зависит от предыдущих). Все exploration- и preservation-тесты (Фазы 1–2) пишутся на неисправленном коде ДО любой реализации.

```json
{
  "waves": [
    {
      "wave": 1,
      "name": "Exploration + Preservation tests (на неисправленном коде)",
      "tasks": ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
      "dependsOn": []
    },
    {
      "wave": 2,
      "name": "Фикс Группы A (рендер) + надёжная модель + plausibility",
      "tasks": ["11.1", "11.4", "11.5"],
      "dependsOn": ["1", "2", "3", "5", "6", "9", "10"]
    },
    {
      "wave": 3,
      "name": "Адаптивная инфографика + identity-ракурсы",
      "tasks": ["11.2", "11.6"],
      "dependsOn": ["11.1", "11.4"]
    },
    {
      "wave": 4,
      "name": "Публикационный порог + соответствие стилю/фото",
      "tasks": ["11.3", "11.7"],
      "dependsOn": ["11.2", "11.6"]
    },
    {
      "wave": 5,
      "name": "Верификация (перепрогон тестов + integration)",
      "tasks": ["12.1", "12.2", "12.3"],
      "dependsOn": ["11.1", "11.2", "11.3", "11.4", "11.5", "11.6", "11.7"]
    },
    {
      "wave": 6,
      "name": "Checkpoint",
      "tasks": ["13"],
      "dependsOn": ["12.1", "12.2", "12.3"]
    }
  ]
}
```

## Notes

- **Методология bugfix**: тесты Bug Condition (задачи 1–8) обязаны ПАДАТЬ на неисправленном коде — это подтверждает наличие дефекта; тесты Preservation (задачи 9–10) обязаны ПРОХОДИТЬ на неисправленном коде — это фиксирует baseline. После фикса задачи 12.1/12.2 перепрогоняют те же тесты (новые писать нельзя).
- **Соответствие свойств и фикса**: P1–P3 ← §A; P5 ← §B; P4 ← §C; P6 ← §D; P7 ← §E; P8 ← §F; P9 ← §G; P10–P11 — preservation.
- **Зависимости реализации**: §B зависит от контрактов §A (реальные артефакты); §C использует фактические буферы из §B; §F строится на надёжном hero из §D; §G идёт поверх edit-image пути §F; §E (чистый валидатор) независим, но относится к Группе B.
- **Тест-команды**: `pnpm --filter @workspace/api-server test` (Node runner + fast-check@4) для api-server; для `DesignBoard.tsx` — тесты marketplace-пакета.
- **Вне зоны фикса**: чистка уже накопившихся «мусорных» дизайнов в каталоге — отдельная операционная задача (см. bugfix.md §Introduction).
- **Не покрывается PBT**: визуальное правдоподобие (1.7–1.9) — ручная/смотровая проверка на выборке стилей и комнат (задача 13).
