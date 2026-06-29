# AI-Design Quality Fix — Bugfix Design

## Overview

Этот фикс закрывает два класса дефектов флагманского продукта «AI-дизайнер интерьеров», чётко их разделяя:

- **Группа A — рендер страницы результата.** `DesignBoard.tsx` и `infographicComposer.ts` собраны под «полный» набор артефактов (4 ракурса + изометрия + план + палитра + материалы + смета + решения + 6 detail-кропов). Как только реальный проект содержит подмножество этих артефактов (нарезка коллажа дала < 4 кадров, деградировала изометрия, пуста палитра/материалы/решения), фиксированные CSS-сетки `grid-cols-4`, `lg:grid-cols-[1fr_2fr_auto]`, `lg:grid-cols-[1fr_3fr]` и all-or-nothing-композитор инфографики дают «дыры», пустые колонки и висящие плейсхолдеры. Фикс делает раскладку **адаптивной к фактическому набору артефактов** — на чистой презентационной логике, без изменения данных пайплайна.

- **Группа B — качество AI-генерации.** Корень — слабая модель пространственного рассуждения в `Layout_Planner` (невалидный/неубедительный `Layout_JSON`), нарезка hero-коллажа 2×2 на 512-px квадранты с последующим апскейлом до 1024 (потеря детализации и рассинхрон ракурсов), и text2img-промпты, слабо учитывающие выбранный стиль и фото пользователя. Фикс: надёжная модель для `Layout_Planner` через `AI_INTEGRATIONS_DESIGN_MODEL`, стратегия деградации при слабом плане, переход на identity-preserving edit-image ракурсы нативного разрешения (переиспользуя уже встроенный `getEditImageProvider()`), и усиление промптов на соответствие стилю/фото.

Принцип фикса — **минимальное вмешательство при сохранении контрактов**. Группа A не трогает данные (`DesignFullDTO`), только presentation. Группа B переиспользует уже существующие обёртки (`falGenerateGptImageEdit`, `falGenerateFluxKontextPro`, `getEditImageProvider`) и не меняет FSM-инварианты воркера (required/optional шаги, watchdog, cost-guard, fail-семантику).

## Glossary

- **Bug_Condition (C)**: условие, при котором проявляется дефект — рендер/композиция «разъезжается» при неполном наборе артефактов (Группа A), либо AI-генерация выдаёт невалидный/неубедительный/низкокачественный результат (Группа B).
- **Property (P)**: желаемое поведение — связная адаптивная страница без пустот при любом подмножестве артефактов (A) и стабильная, реалистичная, соответствующая стилю/фото генерация (B).
- **Preservation**: поведение, которое фикс обязан сохранить без изменений — fail обязательных шагов, cost-ceiling, captcha/rate-limit, рендер полного проекта и `Showcase_Project`.
- **Artifact_Set**: фактический набор готовых артефактов завершённого проекта: `views[]` (1..5), `isometricView`, `topDownPlanUrl`, `colorPalette`, `materials`, `estimate`, `solutions`, `detailCrops`.
- **Main_Views**: основные ракурсы (positions 1..4), без изометрии: `views.filter(v => v !== isometricView).slice(0,4)` в `DesignBoard.tsx`.
- **DesignBoard**: клиентский компонент `artifacts/marketplace/components/dizajn/DesignBoard.tsx`, рендерящий завершённый проект.
- **composeInfographic**: серверный композитор `artifacts/api-server/src/lib/infographicComposer.ts`, собирающий одно изображение 2048×1366.
- **Layout_Planner / generateLayoutJson**: `artifacts/api-server/src/lib/layoutPlanner.ts`, строит `Layout_JSON` через JSON-schema structured output.
- **Geometric_Validator / validateLayout**: `artifacts/api-server/src/lib/geometricValidator.ts`, проверяет вмещение/пересечения/проходы.
- **Edit_Image_Provider**: переключаемый провайдер identity-preserving edit-image (`getEditImageProvider()` из `designConfig.ts`, обёртки `falGenerateGptImageEdit` / `falGenerateFluxKontextPro`).
- **Required/Optional шаг**: классификация шагов FSM воркера (`STEPS_REQUIRED` / `STEPS_OPTIONAL` в `designWorker.ts`). Сбой required → `failed`; сбой optional → деградация.

## Bug Details

### Bug Condition

Дефект Группы A проявляется, когда завершённый проект (`status = "completed"`) рендерится `DesignBoard` или собирается `composeInfographic` из **неполного** `Artifact_Set`: фиксированные раскладки рассчитаны на «полный» набор и оставляют пустые ячейки/колонки/плейсхолдеры.

Дефект Группы B проявляется, когда `Layout_Planner` использует слабую модель (невалидный/неубедительный план), либо ракурсы получаются из апскейленных 512-px квадрантов коллажа (низкое разрешение/рассинхрон/потеря identity), либо промпты слабо учитывают стиль и фото пользователя.

**Формальная спецификация (Группа A — детерминируемая часть):**
```
FUNCTION isBugCondition(state)
  INPUT: state — { status, mainViews[], isometricView, topDownPlanUrl,
                   colorPalette[], materials[], estimate[], solutions[],
                   detailCrops[] } (то, что DesignBoard получает из DesignFullDTO)
  OUTPUT: boolean

  IF state.status != "completed" THEN RETURN false   // только готовые проекты

  // A1: основных ракурсов меньше 4 → дыры в grid-cols-4
  has_view_holes := length(state.mainViews) < 4

  // A2: нет изометрии (и/или плана) → левая колонка ROW2 пустеет,
  //     шаблон 1fr_2fr_auto разъезжается
  left_col_empty := state.isometricView == null AND state.topDownPlanUrl == null

  // A3: пустая опциональная секция рендерит заголовок/плейсхолдер
  empty_section_rendered :=
        (state.colorPalette is empty)            // плейсхолдер «Палитра уточняется.»
     OR (ROW2/ROW3 трек присутствует без контента)

  // A5: инфографика собрана из неполного набора входов → пустые зоны
  infographic_distorted := assembledFromIncompleteInputs(state)

  RETURN has_view_holes OR left_col_empty OR empty_section_rendered
         OR infographic_distorted
END FUNCTION
```

Группа B (качество генерации) формализуется на уровне конфигурации и валидации (детерминируемо), а визуальное правдоподобие рендеров — через example/integration-проверки (см. Testing Strategy):
```
FUNCTION isBugConditionB(genState)
  INPUT: genState — { designModel, layout, viewResolutionPx,
                      viewsIdentityConsistent, userPhotoUrl, usedUserPhoto, style }
  OUTPUT: boolean

  // B6: ненадёжная модель → невалидный/проваливающий геометрию Layout_JSON
  weak_model := NOT isReliableStructuredModel(genState.designModel)

  // B7: схему/геометрию прошёл, но план функционально неубедителен
  implausible_layout := genState.layout != null
                        AND NOT isPlausible(genState.layout)

  // B8: ракурсы из апскейла 512→1024, рассинхрон identity
  low_res_views := genState.viewResolutionPx < NATIVE_VIEW_PX
                   OR NOT genState.viewsIdentityConsistent

  // B9: есть фото пользователя/выбран стиль, но рендер их не учитывает
  ignores_input := (genState.userPhotoUrl != null AND NOT genState.usedUserPhoto)

  RETURN weak_model OR implausible_layout OR low_res_views OR ignores_input
END FUNCTION
```

### Examples

**Группа A**
- Нарезка коллажа упала на `sharp` → в `views` попал только 1 кадр (fallback в воркере) → `mainViews.length == 1` → ROW1 `sm:grid-cols-4` рисует 1 фото и 3 пустые ячейки. Ожидаемо: одна ячейка на всю ширину строки.
- Isometric деградировал, `topDownPlanUrl == null` (не-bedroom) → левая колонка ROW2 пуста, но `lg:grid-cols-[1fr_2fr_auto]` резервирует под неё `1fr` → центр/палитра смещены, слева дыра. Ожидаемо: левая колонка не резервируется.
- `colorPalette` пуст → рендерится заголовок «Цветовая палитра» + текст «Палитра уточняется.» (висящий плейсхолдер). Ожидаемо: блок палитры не рендерится, центр расширяется.
- Проект с минимальным набором (hero + текст + смета, остальное деградировало) → разреженная страница. Ожидаемо: связная компактная композиция (либо публикационный порог не пройден — см. ниже).
- `composeInfographic`: `pickFourViews` дублирует hero в пустые слоты → 4 одинаковых верхних кадра. Ожидаемо: композитор раскладывает только реальные кадры без дублей.

**Группа B**
- `AI_INTEGRATIONS_DESIGN_MODEL` не задан → `claude-opus-4-7` (дефолт в коде) → модель не держит structured output → `parseLayout` отбраковывает → 3 попытки исчерпаны → `failed`. Ожидаемо: дефолт — надёжная модель, плюс read-fresh из env.
- `Layout_JSON` прошёл схему и `validateLayout`, но кровать «плавает» в центре, проходы нереалистичны → коллаж-промпт строится из слабого плана. Ожидаемо: plausibility-проверка ловит и уводит в retry.
- Hero-коллаж 1024×1024 → квадранты 512×512 → resize cover до 1024 → видимый апскейл, ракурсы «плывут» относительно друг друга. Ожидаемо: ракурсы нативного 1024 с сохранённой identity.
- Пользователь загрузил фото комнаты, но hero генерится `falGenerateGptImage` (text2img) без референса на фото. Ожидаемо: фото подаётся как reference (edit-image).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Сбой обязательного шага (`Layout_JSON`, `Hero_Render`, `Real_Estimate`, AI-текст) → `status=failed`, `is_public=false`, пользовательское сообщение (`markFailed`, `RequiredStepFailedError`, `assertCompletionInvariant`) — 3.1, 3.2.
- Превышение `Cost_Ceiling` → `failed` + «превышен бюджет генерации» (`enforceCostCeiling`, `BudgetExceededError`) — 3.3.
- Captcha-проверка и rate-limit на `/ai-design` (routes/middlewares) — без изменений — 3.4.
- Завершённый проект с **полным** `Artifact_Set` рендерится `DesignBoard` пиксель-в-пиксель как сейчас — 3.5.
- Вспомогательные блоки страницы (PDF, лид-форма «Хочу такой же», «Похожие проекты», SEO о стиле/городе) — без изменений — 3.6.
- Редакторские `Showcase_Project` (без `anon_id`, всегда с полным набором) — рендер без изменений — 3.7.

**Scope:**
Любой вход, не являющийся «неполным набором артефактов» (Группа A) и не относящийся к генерации `Layout_JSON`/ракурсов (Группа B), фикс не затрагивает. В частности:
- Полные проекты (адаптивная раскладка обязана **редуцироваться** к текущей при полном наборе).
- Серверные контракты `DesignFullDTO`, `designs`-схема, `design_generations`-учёт.
- Порядок и классификация шагов FSM, watchdog 10 минут.

## Hypothesized Root Cause

**Группа A (рендер):**
1. **Фиксированные CSS-сетки под «полный» набор.** `DesignBoard.tsx`: ROW1 `grid-cols-2 sm:grid-cols-4` (всегда 4 трека), ROW2 `lg:grid-cols-[1fr_2fr_auto]` (3 трека, левый — изометрия+план), ROW3 `lg:grid-cols-[1fr_3fr]` (решения+кропы). При неполном наборе треки остаются, контент исчезает → дыры.
2. **Висящие плейсхолдеры.** Палитра рендерит заголовок + «Палитра уточняется.» даже при пустом `colorPalette`.
3. **All-or-nothing инфографика + дублирование hero.** `composeInfographic` имеет фиксированные слоты; воркер вызывает её только при полном наборе, а `pickFourViews` дублирует hero в пустые слоты — визуально пустые/повторяющиеся зоны.

**Группа B (качество):**
4. **Слабый/нестабильный дефолт модели.** `layoutPlanner.ts` читает модель на module-load: `AI_INTEGRATIONS_DESIGN_MODEL → AI_INTEGRATIONS_OPENAI_MODEL → "claude-opus-4-7"`. Дефолт ненадёжный, а module-load чтение не даёт сменить модель env-патчем без рестарта.
5. **Геометрия ≠ правдоподобие.** `validateLayout` проверяет вмещение/пересечения/дверь/проход, но не функциональную адекватность (наличие ключевой мебели, реалистичные габариты, «плавающая» мебель у стен).
6. **Деструктивная нарезка коллажа.** Воркер режет hero 1024×1024 на 512-px квадранты и апскейлит cover до 1024 → потеря детализации; единый кадр-источник не гарантирует согласованные ракурсы при апскейле.
7. **Игнор фото и слабая привязка стиля.** Pipeline v2.1 использует text2img `falGenerateGptImage`, не подавая `input_image_url` пользователя как reference; стиль присутствует в промпте, но без усиления.

## Correctness Properties

Property 1: Bug Condition — Адаптивная сетка ракурсов под фактическое число кадров

_For any_ завершённого проекта, где `length(mainViews) ∈ {1,2,3,4}`, `DesignBoard` SHALL выбрать раскладку ROW1 (число колонок и span) строго по `length(mainViews)`, так что в сетке не остаётся ни одной пустой ячейки (число ячеек == число ракурсов), сохраняя согласованную композицию.

**Validates: Requirements 2.1**

Property 2: Bug Condition — Устойчивость ROW2 к отсутствию изометрии/плана

_For any_ комбинации присутствия `isometricView` и `topDownPlanUrl`, `DesignBoard` SHALL сформировать grid-template ROW2 только из непустых колонок (left включается тогда и только тогда, когда есть изометрия или план), так что ни один трек сетки не остаётся без контента.

**Validates: Requirements 2.2**

Property 3: Bug Condition — Опциональные секции без пустых блоков

_For any_ опциональной секции (палитра, материалы, смета, решения, detail-кропы), если её данные пусты, `DesignBoard` SHALL не рендерить ни заголовок, ни плейсхолдер этой секции (в частности, не показывать «Палитра уточняется.»), не оставляя висящих блоков.

**Validates: Requirements 2.3**

Property 4: Bug Condition — Связная страница при любом подмножестве / порог публикации

_For any_ завершённого проекта `DesignBoard` SHALL отрендерить композиционно связную страницу из доступного подмножества артефактов (адаптивные ROW1/ROW2/ROW3), при этом проект, не достигший `Flagship_Publication_Threshold`, SHALL быть переведён воркером в `failed` (а не опубликован как разреженный «флагман»).

**Validates: Requirements 2.4**

Property 5: Bug Condition — Адаптивная сборка инфографики

_For any_ набора входов composeInfographic (число реальных ракурсов 1..4, наличие/отсутствие изометрии, 0..6 кропов), композитор SHALL разложить только реально присутствующие ассеты без дублирования и без пустых зон (число занятых слотов == число реальных ассетов), либо корректно не собирать инфографику, не нарушая страницу.

**Validates: Requirements 2.5**

Property 6: Bug Condition — Надёжная модель Layout_Planner

_For any_ генерации `Layout_JSON`, `Layout_Planner` SHALL читать модель из `AI_INTEGRATIONS_DESIGN_MODEL` на момент вызова (read-fresh) с надёжным дефолтом, поддерживающим JSON-schema structured output, так что на корректных входах план стабильно проходит схему и `Geometric_Validator` без скатывания в `failed`.

**Validates: Requirements 2.6**

Property 7: Bug Condition — Функциональное правдоподобие плана

_For any_ `Layout_JSON`, прошедшего схему и базовую геометрию, `Geometric_Validator` SHALL дополнительно проверить функциональное правдоподобие (наличие ключевой мебели по типу комнаты, реалистичные габариты, отсутствие «плавающей» мебели вне стен) и при нарушениях вернуть их в retry-подсказку, не допуская построения коллаж-промпта из неубедительного плана.

**Validates: Requirements 2.7**

Property 8: Bug Condition — Разрешение и identity ракурсов

_For any_ успешного `Hero_Render`, итоговые `views[1..4]` SHALL иметь нативное разрешение (1024×1024 без апскейла из 512-px квадранта) и сохранённую identity (единый источник/референс), либо при недоступности identity-preserving генерации деградировать как optional-шаг без перевода проекта в `failed`.

**Validates: Requirements 2.8**

Property 9: Bug Condition — Соответствие стилю и фото пользователя

_For any_ проекта, где задан стиль и присутствует фото пользователя (`input_image_url` от user-upload), генерация ракурсов SHALL подавать это фото как reference (edit-image) и усиливать привязку к выбранному стилю, чтобы рендеры заметно соответствовали стилю и исходному фото.

**Validates: Requirements 2.9**

Property 10: Preservation — Идентичный рендер полного и Showcase-проекта

_For any_ завершённого проекта с **полным** `Artifact_Set` (4 ракурса, изометрия, план, палитра, материалы, смета, решения, 6 detail-кропов), включая редакторские `Showcase_Project`, адаптивный `DesignBoard` SHALL произвести ту же разметку (те же grid-треки, те же блоки), что и текущая реализация, сохраняя существующий вид.

**Validates: Requirements 3.5, 3.7**

Property 11: Preservation — Неизменность fail/budget/guard-семантики

_For any_ входа, где срабатывает fail обязательного шага, превышение `Cost_Ceiling`, captcha/rate-limit или completion-invariant, фикс SHALL сохранить текущее поведение (`status=failed`, `is_public=false`, пользовательское сообщение; «превышен бюджет генерации»; captcha/limit без изменений), не вмешиваясь в эти пути.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

Предполагая, что анализ корневых причин верен.

#### A. Рендер страницы (Группа A)

**File**: `artifacts/marketplace/components/dizajn/DesignBoard.tsx`

1. **Адаптивная ROW1 (2.1).** Ввести чистый хелпер `viewsGridClass(n: number)`, возвращающий классы под фактическое число `mainViews`:
   - `1` → одна ячейка во всю ширину контейнера (или ограниченной максимальной шириной по центру), без `grid-cols-4`;
   - `2` → `grid-cols-2`;
   - `3` → `grid-cols-3` (или `grid-cols-2` + последний элемент `col-span-2` — выбрать вариант без дыр);
   - `4` → текущее `grid-cols-2 sm:grid-cols-4` (редукция к текущему виду — 3.5).
   Применить к контейнеру ROW1 вместо жёсткого `sm:grid-cols-4`.

2. **Адаптивная ROW2 (2.2, 2.3).** Вычислять состав колонок до рендера:
   - `hasLeft = Boolean(isometricView || topDownPlanUrl)`;
   - `hasPalette = Boolean(colorPalette && colorPalette.length > 0)`;
   - центр (параметры) присутствует всегда (минимум — стиль).
   Строить grid-template динамически (хелпер `row2TemplateClass({hasLeft, hasPalette})`):
   - все три → `lg:grid-cols-[1fr_2fr_auto]` (текущий вид — 3.5);
   - без left → `lg:grid-cols-[2fr_auto]`;
   - без palette → `lg:grid-cols-[1fr_2fr]`;
   - только центр → один трек (full width).
   Левую колонку и блок палитры рендерить только при `hasLeft` / `hasPalette`.

3. **Убрать висящий плейсхолдер палитры (2.3).** Удалить ветку `: ( <p>Палитра уточняется.</p> )`; при пустой палитре блок не рендерится вовсе (управляется `hasPalette`).

4. **Адаптивная ROW3 (2.3).** `hasSolutions`, `hasCrops`. Если оба пусты — ROW3 не рендерится; если один — оставшийся занимает всю ширину (хелпер `row3TemplateClass`). Текущий `lg:grid-cols-[1fr_3fr]` сохраняется при обоих присутствующих (3.5).

5. Все хелперы — **чистые функции** (вход: булевы/числа из DTO, выход: className-строка), вынести рядом с компонентом или в локальный модуль для прямого property-тестирования.

#### B. Адаптивная инфографика (2.5)

**File**: `artifacts/api-server/src/lib/infographicComposer.ts`

1. Расширить `InfographicInput`: `views: Buffer[]` (1..4 реальных), `isometric: Buffer | null`, `detailCrops: Buffer[]` (0..6). Заменить кортежи фиксированной длины.
2. Вычислять прямоугольники слотов из фактических длин: ширина ячейки ROW1 = `(W - 2·PAD - GAP·(n-1)) / n`; middle-блок изометрии рисуется только при `isometric != null` (иначе центр/текст занимают освободившееся место); число crop-ячеек = `detailCrops.length`.
3. Caption'ы и SVG-overlay строить по фактическим длинам (циклы по `views.length` / `detailCrops.length`).

**File**: `artifacts/api-server/src/lib/designWorker.ts`

4. Шаг 11 (Infographic): убрать жёсткий гейт `composerViews && isometricBuffer && cropBuffers.length === 6`. Передавать **только реальные** буферы: реальные ракурсы из `viewBuffers` (без hero-дублей из `pickFourViews`), `isometricBuffer` как `Buffer | null`, фактические `cropBuffers`. Минимальный гейт — `≥1` реальный ракурс и `content`. Шаг остаётся optional (Requirement 14.4 / 3.2 не нарушается).

#### C. Публикационный порог (2.4 — выбранная стратегия)

**Решение по клаузе 2.4: «связная страница из любого подмножества» как основная стратегия + лёгкий публикационный порог для вырожденного случая.**

**Обоснование выбора (а не «не публиковать недозаполненные»):**
- Required-шаги (`Layout_JSON`, `Hero_Render`, `Real_Estimate`, AI-текст) уже гарантируют, что пустых проектов не публикуется (3.2). Нарезка коллажа детерминированная — при успешном hero почти всегда даёт кадры. То есть «разреженность» — редкий хвост, а не норма.
- Перевод уже сгенерированного (оплаченного по `Cost_Ceiling`) проекта в `failed` сжигает бюджет и не даёт пользователю ничего — это хуже UX, чем связная компактная страница.
- Поэтому публикуем связную адаптивную страницу из доступного подмножества, **но** добавляем порог только против патологии (например, `Main_Views` свёлся к одному дублированному hero), чтобы не показывать «флагман» из одного кадра.

**File**: `artifacts/api-server/src/lib/designWorker.ts` — расширить `assertCompletionInvariant`:
- ввести `Flagship_Publication_Threshold`: помимо required-артефактов (layout, hero, content — без изменений), требовать `views.length ≥ FLAGSHIP_MIN_VIEWS` (например, `2` реально нарезанных ракурса). Если порог не достигнут — бросить `RequiredStepFailedError(STEP_ANGLE_RENDERS, "не удалось собрать связный набор ракурсов")` → стандартный fail-путь (`is_public=false`). Значение порога — константа модуля, чтобы PBT мог его варьировать.
- Семантику остальных required-проверок не трогаем (3.2 — preservation).

#### D. Надёжная модель Layout_Planner (2.6)

**File**: `artifacts/api-server/src/lib/designConfig.ts`
1. Добавить `getDesignModel(): string` по образцу `getEditImageProvider()`/`getCostCeilingKopeks()`: read-fresh из `AI_INTEGRATIONS_DESIGN_MODEL` → fallback `AI_INTEGRATIONS_OPENAI_MODEL` → надёжный дефолт (документированная платная/стабильная модель с поддержкой `json_schema` structured outputs). Пустые/мусорные значения → дефолт с предупреждением.

**File**: `artifacts/api-server/src/lib/layoutPlanner.ts`
2. Заменить module-load `const model = ...` на вызов `getDesignModel()` внутри `generateOnce` (read-fresh — оператор меняет модель без рестарта очереди).
3. Обновить `.env.example` (документировать рекомендованное значение `AI_INTEGRATIONS_DESIGN_MODEL`).

#### E. Plausibility-проверка плана (2.7)

**File**: `artifacts/api-server/src/lib/geometricValidator.ts`
1. Добавить новые коды в `ViolationCode`: `MISSING_FUNCTIONAL_ITEM`, `UNREALISTIC_DIMENSIONS`, `FLOATING_FURNITURE`.
2. Новая чистая функция `validatePlausibility(room, furniture): ValidationViolation[]`:
   - наличие ключевой мебели по типу комнаты (для `bedroom` — `bed`; расширяемо через таблицу `FUNCTIONAL_TYPES_BY_ROOM`);
   - габариты в реалистичных диапазонах по типу (например, кровать ≥ 140×190 и ≤ 200×220);
   - ключевая мебель (кровать/шкаф/диван) примыкает к стене в пределах допуска (не «плавает» по центру).
3. В `validateLayout` дописать `violations.push(...validatePlausibility(...))`. Нарушения уже автоматически попадают в `previousViolations` retry-цикла воркера (шаг 1) и в подсказку `Layout_Planner` (Requirement 2.7) — изменений в воркере не требуется.

#### F. Разрешение и identity ракурсов (2.8)

**File**: `artifacts/api-server/src/lib/designWorker.ts` — шаги 2–3.

**Решение: заменить деструктивную нарезку коллажа на identity-preserving edit-image ракурсы нативного разрешения, переиспользуя уже встроенный механизм.**
- Шаг 2 (`Hero_Render`, required) — без изменений по статусу: генерируем общий ракурс (view 1) в нативном 1024.
- Шаг 3 (angle renders, **optional**): для ракурсов 2..4 вызывать `getEditImageProvider()` → `falGenerateGptImageEdit` либо `falGenerateFluxKontextPro` с `image_urls=[heroUrl]`, `quality:"high"`, `input_fidelity:"high"` → 3 кадра нативного 1024 с сохранённой identity. Каждый под `withCostGuard` (учёт стоимости, fail-fast по `Cost_Ceiling`).
- **Деградация (3.2):** если edit-image недоступен/упал после повтора — fallback на текущую коллаж-нарезку (collage 2×2 → sharp). Angle renders остаются optional: их сбой не уводит проект в `failed`. Стоимость: hero(high) + 3×edit(high/flux ~400) укладывается в текущий `DEFAULT_COST_CEILING_KOPEKS = 10000`.
- Убрать апскейл 512→1024 в success-пути (он остаётся только в fallback-ветке нарезки).

#### G. Соответствие стилю и фото (2.9)

**File**: `artifacts/api-server/src/lib/designWorker.ts` + промпт-билдеры.
1. Если у проекта есть пользовательское фото (`design.input_image_url`, user-upload, не seed) — подавать его как reference в генерацию hero/ракурсов через edit-image (`image_urls=[userPhotoUrl]`, `input_fidelity:"high"`), чтобы геометрия и черты исходной комнаты влияли на результат. Для seed-проектов поведение не меняется.
2. Усилить привязку стиля в `buildHeroCollagePrompt` / angle-промптах: явный стилевой клаузис из `STYLE_RU_CLAUSES` в начале промпта + добавить `NEGATIVE_PROMPT`-подобную защиту от ухода в чужой стиль (где это поддерживается провайдером).
3. Это presentation/prompt-уровень; required/optional-классификация шагов не меняется.

## Testing Strategy

### Validation Approach

Двухфазно: сначала зафиксировать контрпримеры на неисправленном коде (показать дыры/пустоты и провалы генерации), затем проверить, что фикс закрывает дефект и сохраняет существующее поведение. Группа A и детерминируемые части Группы B (конфиг модели, plausibility-валидатор, выбор разрешения/референса) проверяются property/unit-тестами; визуальное правдоподобие рендеров (1.8/1.9 в части «реалистичности») — example/integration.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples ДО фикса; подтвердить/опровергнуть root-cause. При опровержении — заново гипотезировать.

**Test Plan**: Для Группы A — рендерить `DesignBoard`/чистые хелперы и сам `composeInfographic` на неполных наборах артефактов и ассертить отсутствие пустых треков/слотов (на неисправленном коде ожидаем провал). Для Группы B — прогон `generateLayoutJson` с мок-клиентом под «слабую» модель и `validateLayout`/`validatePlausibility` на неубедительных планах.

**Test Cases**:
1. **ROW1 holes**: `mainViews.length ∈ {1,2,3}` → текущий `sm:grid-cols-4` даёт пустые ячейки (will fail on unfixed code).
2. **ROW2 collapse**: `isometricView=null, topDownPlanUrl=null` → пустая левая колонка `1fr` (will fail on unfixed code).
3. **Palette placeholder**: `colorPalette=[]` → виден «Палитра уточняется.» (will fail on unfixed code).
4. **Infographic duplication**: `viewBuffers` < 4 → `pickFourViews` дублирует hero → 4 одинаковых кадра (will fail on unfixed code).
5. **Weak model**: `AI_INTEGRATIONS_DESIGN_MODEL` неустановлен/мок «слабой» модели → `generateLayoutJson` исчерпывает retries (may fail on unfixed code).
6. **Implausible layout**: кровать «плавает» по центру bedroom → `validateLayout` сейчас `ok:true` (will fail plausibility on unfixed code).

**Expected Counterexamples**:
- Пустые grid-треки/слоты при неполном наборе; дублированные кадры в инфографике.
- Возможные причины: фиксированные сетки, all-or-nothing композитор, hero-дублирование, module-load дефолт модели, отсутствие plausibility-проверки.

### Fix Checking

**Goal**: Для всех входов, где держится bug condition, фиксированная функция даёт ожидаемое поведение.

**Pseudocode:**
```
FOR ALL state WHERE isBugCondition(state) DO
  rendered := DesignBoard_fixed(state)          // или composeInfographic_fixed
  ASSERT noEmptyGridTracks(rendered)
  ASSERT noEmptyOptionalSections(rendered)
  ASSERT occupiedSlots(rendered) == realArtifacts(state)
END FOR

FOR ALL genState WHERE isBugConditionB(genState) DO
  ASSERT getDesignModel() is reliable default OR honors AI_INTEGRATIONS_DESIGN_MODEL
  ASSERT validateLayout_fixed(implausible).ok == false
  ASSERT chosenViewResolution == NATIVE_VIEW_PX (или optional-деградация)
END FOR
```

### Preservation Checking

**Goal**: Для всех входов, где bug condition НЕ держится, фиксированная функция даёт тот же результат, что и оригинал.

**Pseudocode:**
```
FOR ALL state WHERE NOT isBugCondition(state) DO            // полный Artifact_Set
  ASSERT DesignBoard_fixed(state) == DesignBoard_original(state)   // те же grid-треки/блоки
END FOR

FOR ALL failInput DO
  ASSERT failSemantics_fixed(failInput) == failSemantics_original(failInput)
  // status=failed, is_public=false, user message; cost-ceiling; captcha/limit
END FOR
```

**Testing Approach**: Property-based testing подходит для preservation: автогенерация подмножеств `Artifact_Set` подтверждает, что при полном наборе разметка не изменилась (редукция к текущей сетке), а при неполном — нет пустот.

**Test Plan**: Зафиксировать поведение на неисправленном коде для полного набора (snapshot grid-классов/блоков), затем проверить идентичность после фикса; для fail-путей — что фикс их не трогает.

**Test Cases**:
1. **Full set parity**: полный `Artifact_Set` → grid-классы ROW1/ROW2/ROW3 идентичны текущим (3.5, 3.7).
2. **Required fail unchanged**: сбой `Layout_JSON`/`Hero_Render`/`Real_Estimate`/AI-текст → `failed`, `is_public=false`, то же сообщение (3.1, 3.2).
3. **Cost ceiling unchanged**: превышение → «превышен бюджет генерации» (3.3).
4. **Captcha/limit unchanged**: проверки на `/ai-design` не затронуты (3.4).

### Unit Tests

- Чистые хелперы раскладки (`viewsGridClass`, `row2TemplateClass`, `row3TemplateClass`) на всех комбинациях.
- `getDesignModel()` на корректных/мусорных/пустых env-значениях (fallback-цепочка).
- `validatePlausibility` на каноничных планах (валидный / отсутствует мебель / нереалистичные габариты / «плавающая» мебель).
- `composeInfographic` на 1..4 ракурсах, с/без изометрии, 0..6 кропов — нет исключений и пустых зон.

### Property-Based Tests

- Генерация случайных подмножеств `Artifact_Set` → инвариант «число grid-ячеек == число артефактов, пустых треков нет» (Property 1–3, 5).
- Генерация полных наборов → инвариант «разметка == текущая» (Property 10).
- Генерация планов → `validateLayout`(fixed) отклоняет неубедительные и принимает реалистичные (Property 7).
- Генерация `genState` → выбранное разрешение ракурса == нативное либо optional-деградация (Property 8).

### Integration Tests

- Полный прогон воркера на проекте с деградированными опциональными шагами → `completed` со связной адаптивной страницей либо `failed` при недостижении `Flagship_Publication_Threshold` (Property 4).
- Прогон с пользовательским фото → ракурсы генерятся edit-image с референсом на фото (Property 9, проверка вызова провайдера и параметров).
- Прогон с identity-preserving ракурсами → 4 кадра нативного 1024; при форс-сбое edit-image — fallback на коллаж-нарезку без перевода в `failed` (Property 8, 3.2).
- Визуальная проверка правдоподобия/соответствия стилю и фото (1.7–1.9) — ручная/смотровая на выборке стилей и комнат (не покрывается чистым PBT).
