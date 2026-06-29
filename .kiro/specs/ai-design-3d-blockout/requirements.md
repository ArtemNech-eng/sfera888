# Requirements Document

## Introduction

AI_Design_3D_Blockout (рабочее название «подход B2») — это новый шаг генерации
ракурсов и плана для дизайн-бордов, который решает фундаментальную проблему
геометрической рассогласованности между ракурсами. Чистая 2D-генерация (FLUX,
gpt-image, Nano Banana 2) на практике не удерживает одинаковую расстановку
мебели при действительно разных углах камеры: между кадрами «плывут» позиции,
размеры и состав мебели. Это доказанное ограничение 2D-подхода, а не вопрос
подбора промпта.

B2 фиксирует геометрию лёгким серым 3D-блокаутом комнаты в Blender (headless),
рендерит карты глубины из набора фиксированных камер (4 фото-ракурса + 1
ортографический вид сверху + 1 изометрический) и прогоняет каждую карту глубины
через depth-ControlNet модель на fal с единым стилевым промптом. Так геометрия
фиксируется блокаутом (одни и те же мировые координаты мебели во всех камерах),
а AI отвечает только за фотореалистичный премиальный вид. Результат подаётся в
СУЩЕСТВУЮЩИЙ композитор `artifacts/api-server/src/lib/infographicComposer.ts`
без изменения его контракта: 3D-пайплайн заменяет только шаг генерации ракурсов,
плана и изометрии. Бонус — ортографическая камера сверху и изометрическая камера
дают пиксельно точные план и изометрию для соответствующих слотов (сейчас они
имитируются отдельно).

Стратегически фича остаётся offline-инструментом для подготовки SEO-страниц
дизайн-проектов: цель — около 100 публичных страниц по городам и районам Южного
федерального округа (ЮФО), первая партия — около 10 проектов. Существующий
2D-путь (`generate-design-board.ts` на Nano Banana 2) сохраняется как fallback и
этим спеком не удаляется.

Главные риски: (1) удержит ли depth-ControlNet расстановку на fal — проверяется
ранним R&D-прототипом до постройки полного пайплайна; (2) среда рендера —
headless Blender + GPU должны быть доступны в окружении (cloud GPU / Railway /
Docker с Blender); (3) стоимость — ориентир $0.2–0.6 на проект (дешёвый
depth-рендер + 4× ControlNet-инференс).

## Glossary

- **AI_Design_3D_Blockout**: новый offline-пайплайн (подход B2), генерирующий геометрически согласованные ракурсы, план и изометрию через 3D-блокаут + depth-ControlNet.
- **Blockout_Pipeline**: последовательность шагов B2 для одного проекта: построение блокаута → рендер карт глубины из камер → depth-ControlNet-перекраска → сборка борда композитором → загрузка в R2 → (позже) публикация SEO-страницы.
- **Room_Blockout**: лёгкая серая (gray-box) 3D-модель комнаты в Blender: оболочка помещения (стены, пол, потолок, окно, дверь) плюс примитивная мебель, без текстур и материалов.
- **Blockout_Builder**: headless-скрипт Blender (`blender --background --python`), который строит `Room_Blockout` из входной спецификации сцены.
- **Scene_Spec**: сериализуемая (JSON) спецификация сцены, описывающая параметры комнаты, выбранный `Layout_Preset` и параметры камер; вход для `Blockout_Builder`.
- **Room_Shell**: параметрическая оболочка помещения (стены, пол, потолок, одно окно, одна дверь), построенная из габаритов комнаты W×L×H.
- **Room_Dimensions**: габариты комнаты ширина×длина×высота (W×L×H) в метрах, выведенные из площади и типа помещения.
- **Layout_Preset**: захардкоженная вручную расстановка примитивной (box/простой меш) мебели для конкретного типа помещения, заданная в мировых координатах блокаута.
- **Camera_Rig**: фиксированный набор камер сцены: 4 перспективные фото-камеры (ракурсы), 1 ортографическая камера сверху (для слота плана) и 1 изометрическая/аксонометрическая камера (для слота изометрии).
- **Depth_Map**: изображение карты глубины, отрендеренное одной камерой `Camera_Rig` из `Room_Blockout`.
- **Normal_Map**: опциональная карта нормалей, отрендеренная той же камерой (используется при необходимости как дополнительный управляющий сигнал).
- **Depth_Render_Step**: шаг рендера `Depth_Map` (и опционально `Normal_Map`) из всех камер `Camera_Rig` средствами Blender (EEVEE Next).
- **Depth_ControlNet_Provider**: depth-управляемая модель изображения на fal — `fal-ai/flux-control-lora-depth/image-to-image` (карта глубины задаёт структуру, init-изображение направляет цвет) и/или `fal-ai/flux-general` (полный ControlNet/LoRA/IP-Adapter).
- **Depth_ControlNet_Wrapper**: новая обёртка в `artifacts/api-server/src/lib/falAi.ts`, вызывающая `Depth_ControlNet_Provider` по тому же паттерну, что и существующие обёртки (raw fetch, заголовок `Authorization: Key {FAL_API_KEY}`, базовый URL `https://fal.run/{model}`).
- **Shared_Style_Prompt**: единый стилевой промпт, применяемый ко всем ракурсам одного проекта, чтобы все кадры читались как одна комната в одном стиле.
- **Photoreal_Repaint**: результат прогона `Depth_Map` через `Depth_ControlNet_Provider` с `Shared_Style_Prompt` — фотореалистичный ракурс с геометрией, заданной блокаутом.
- **Geometric_Consistency**: свойство, при котором мебель занимает одни и те же мировые координаты во всех камерах `Camera_Rig`; проверяется по 3D-сцене (`Scene_Spec` / экспортированные позиции), а не по финальным пикселям.
- **Infographic_Composer**: существующий модуль `artifacts/api-server/src/lib/infographicComposer.ts` и его публичный контракт (`composeInfographic`, `InfographicInput`), которые B2 НЕ изменяет.
- **Fallback_2D_Path**: существующий 2D-путь генерации борда (`generate-design-board.ts` на Nano Banana 2), сохраняемый как запасной вариант.
- **Render_Environment**: окружение исполнения с установленным headless Blender и доступным GPU (cloud GPU / Railway-сервис / Docker-образ с Blender).
- **Object_Storage**: R2-хранилище через `artifacts/api-server/src/lib/objectStorage.ts` (env: `FAL_API_KEY`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL`, `DEFAULT_OBJECT_STORAGE_BUCKET_ID`).
- **SEO_Page**: публичная страница дизайн-проекта в БД (`designs`: `status=completed`, `is_public=true`, `views[]`, `resultImageUrl`, `content`), доступная по публичному URL.
- **Batch_Project_Set**: партия проектов (около 10 в первой итерации, цель — около 100) для городов и районов ЮФО.
- **Prototype_Milestone**: ранний R&D-этап, доказывающий, что `Depth_ControlNet_Provider` на fal удерживает расстановку для одной комнаты и одного стиля до постройки полного пайплайна.
- **Cost_Budget**: ориентир суммарной стоимости одного проекта B2 — от $0.2 до $0.6 (дешёвый `Depth_Render_Step` + 4× `Depth_ControlNet_Provider`-инференс).
- **Operator**: инженер, запускающий offline-пайплайн вручную из `artifacts/api-server` (`npx tsx`), имеющий доступ к окружению с нужными env.

## Requirements

### Requirement 1: R&D-прототип удержания расстановки depth-ControlNet

**User Story:** Как оператор, я хочу ранним прототипом доказать, что depth-ControlNet на fal удерживает расстановку мебели по карте глубины, чтобы не строить полный 3D-пайплайн до подтверждения ключевой гипотезы.

#### Acceptance Criteria

1. THE Prototype_Milestone SHALL генерировать Photoreal_Repaint для одной комнаты и одного стиля из заранее подготовленной Depth_Map через Depth_ControlNet_Provider.
2. THE Prototype_Milestone SHALL генерировать Photoreal_Repaint для всех 4 фото-камер Camera_Rig из одного и того же Room_Blockout с одним Shared_Style_Prompt.
3. THE Prototype_Milestone SHALL сохранять каждую входную Depth_Map и соответствующий Photoreal_Repaint в Object_Storage и выводить их публичные URL.
4. WHERE задан флаг сравнения, THE Prototype_Milestone SHALL дополнительно сохранять Photoreal_Repaint, сгенерированный Fallback_2D_Path для той же комнаты, для визуального сопоставления удержания геометрии.
5. IF Depth_ControlNet_Provider возвращает ошибку или пустой результат, THEN THE Prototype_Milestone SHALL завершиться с ненулевым кодом возврата и сообщением, содержащим HTTP-статус и текст ответа провайдера.

### Requirement 2: Параметрическая оболочка комнаты из габаритов

**User Story:** Как оператор, я хочу строить оболочку комнаты из габаритов, чтобы каждая комната имела корректные стены, пол, потолок, окно и дверь без ручного 3D-моделирования.

#### Acceptance Criteria

1. WHEN Blockout_Builder получает Scene_Spec с площадью и типом помещения, THE Blockout_Builder SHALL вычислять Room_Dimensions W×L×H детерминированно из площади.
2. THE Blockout_Builder SHALL строить Room_Shell, включающую четыре стены, пол, потолок, ровно одно окно и ровно одну дверь.
3. THE Blockout_Builder SHALL размещать дверь и окно на стенах согласно позициям, заданным в Scene_Spec.
4. WHEN Room_Dimensions вычислены, THE Blockout_Builder SHALL обеспечивать положительные значения W, L и H в метрах.
5. IF площадь в Scene_Spec меньше минимально допустимой для типа помещения, THEN THE Blockout_Builder SHALL завершаться с ошибкой и сообщением, называющим тип помещения и минимальную площадь.

### Requirement 3: Пресеты расстановки по типу помещения

**User Story:** Как оператор, я хочу иметь готовые пресеты расстановки примитивной мебели по типу помещения, чтобы блокаут содержал правдоподобную мебель без библиотеки платных ассетов.

#### Acceptance Criteria

1. THE Blockout_Builder SHALL размещать мебель в Room_Blockout, используя Layout_Preset, выбранный по типу помещения из Scene_Spec.
2. THE Layout_Preset SHALL задавать каждый предмет мебели примитивной геометрией (box или простой меш) без текстур и без материалов.
3. THE Layout_Preset SHALL задавать позицию, габариты и ориентацию каждого предмета мебели в мировых координатах Room_Blockout.
4. WHEN применяется Layout_Preset, THE Blockout_Builder SHALL размещать каждый предмет мебели полностью внутри границ Room_Shell.
5. IF для типа помещения из Scene_Spec нет Layout_Preset, THEN THE Blockout_Builder SHALL завершаться с ошибкой, называющей запрошенный тип помещения.

### Requirement 4: Сериализация спецификации сцены (round-trip)

**User Story:** Как оператор, я хочу, чтобы спецификация сцены сериализовалась и читалась без потерь, чтобы блокаут, построенный Blender, точно соответствовал заданным параметрам.

#### Acceptance Criteria

1. THE Blockout_Pipeline SHALL сериализовать Scene_Spec в JSON перед передачей в Blockout_Builder.
2. THE Blockout_Builder SHALL разбирать JSON Scene_Spec в структуру сцены перед построением Room_Blockout.
3. FOR ALL валидных Scene_Spec сериализация в JSON с последующим разбором SHALL давать эквивалентный Scene_Spec (round-trip).
4. IF JSON Scene_Spec не соответствует ожидаемой схеме, THEN THE Blockout_Builder SHALL завершаться с ошибкой, называющей первое нарушенное поле.

### Requirement 5: Камеры и рендер карт глубины

**User Story:** Как оператор, я хочу рендерить карты глубины из фиксированного набора камер одной 3D-сцены, чтобы все виды были геометрически согласованы.

#### Acceptance Criteria

1. THE Camera_Rig SHALL содержать ровно 4 перспективные фото-камеры, 1 ортографическую камеру сверху и 1 изометрическую камеру.
2. WHEN Depth_Render_Step выполняется, THE Depth_Render_Step SHALL рендерить ровно одну Depth_Map на каждую камеру Camera_Rig из единственного Room_Blockout.
3. WHERE в Scene_Spec включён рендер нормалей, THE Depth_Render_Step SHALL дополнительно рендерить одну Normal_Map на каждую камеру Camera_Rig.
4. THE Depth_Render_Step SHALL сохранять все Depth_Map с одинаковыми позициями камер для всех проектов, использующих один Camera_Rig.
5. THE Depth_Render_Step SHALL завершать рендер всех Depth_Map для одного проекта в пределах бюджета времени и стоимости Cost_Budget, отведённого на рендер.

### Requirement 6: Фотореалистичная перекраска через depth-ControlNet

**User Story:** Как оператор, я хочу перекрашивать каждую карту глубины фотореалистичным интерьером единым стилевым промптом, чтобы получить премиальный вид при сохранённой геометрии.

#### Acceptance Criteria

1. THE Depth_ControlNet_Wrapper SHALL вызывать Depth_ControlNet_Provider по паттерну существующих обёрток в `falAi.ts` (raw fetch, заголовок `Authorization: Key {FAL_API_KEY}`, базовый URL `https://fal.run/{model}`).
2. WHEN перекрашивается Depth_Map, THE Depth_ControlNet_Wrapper SHALL передавать эту Depth_Map как управляющий сигнал структуры провайдеру.
3. THE Blockout_Pipeline SHALL применять один и тот же Shared_Style_Prompt ко всем Depth_Map одного проекта.
4. WHEN перекрашены все Depth_Map проекта, THE Blockout_Pipeline SHALL получать ровно один Photoreal_Repaint на каждую камеру Camera_Rig.
5. THE Depth_ControlNet_Wrapper SHALL возвращать стоимость каждого вызова в копейках, как это делают существующие обёртки в `falAi.ts`.
6. IF Depth_ControlNet_Provider помечает результат как NSFW, THEN THE Depth_ControlNet_Wrapper SHALL завершаться с ошибкой и не возвращать изображение.
7. IF Depth_ControlNet_Wrapper завершается с ошибкой из-за NSFW-детекции, THEN THE Depth_ControlNet_Wrapper SHALL по-прежнему возвращать стоимость вызова в копейках.

### Requirement 7: Корректность геометрической согласованности

**User Story:** Как оператор, я хочу проверяемой гарантии, что мебель стоит на одних и тех же местах во всех ракурсах, чтобы устранить «дрейф» расстановки между кадрами.

#### Acceptance Criteria

1. THE Blockout_Pipeline SHALL выводить все Photoreal_Repaint проекта из единственного Room_Blockout с неизменной геометрией мебели.
2. FOR ALL камер Camera_Rig каждый предмет мебели SHALL занимать одни и те же мировые координаты, габариты и ориентацию (Geometric_Consistency), проверяемые по Scene_Spec, а не по финальным пикселям.
3. THE Blockout_Pipeline SHALL предоставлять экспорт мировых позиций мебели Room_Blockout в проверяемом виде для контроля Geometric_Consistency.
4. WHEN между двумя камерами Camera_Rig сравниваются мировые позиции мебели, THE Blockout_Pipeline SHALL давать идентичные множества позиций для обеих камер.

### Requirement 8: Интеграция с существующим композитором без смены контракта

**User Story:** Как оператор, я хочу подавать результаты 3D-пайплайна в существующий композитор, чтобы итоговый борд собирался прежним кодом без изменения его контракта.

#### Acceptance Criteria

1. THE Blockout_Pipeline SHALL передавать ровно 4 Photoreal_Repaint фото-камер в поле `views` `InfographicInput`.
2. THE Blockout_Pipeline SHALL передавать Photoreal_Repaint изометрической камеры в поле `isometric` `InfographicInput`.
3. THE Blockout_Pipeline SHALL передавать Photoreal_Repaint ортографической камеры сверху в поле `topDownPlanPng` `InfographicInput`.
4. THE Blockout_Pipeline SHALL вызывать `composeInfographic` без изменения сигнатуры функции и формы типа `InfographicInput`.
5. THE Blockout_Pipeline SHALL заменять только шаг генерации ракурсов, плана и изометрии, оставляя остальные поля `InfographicInput` (тексты, материалы, смета, палитра, решения) формируемыми прежним образом.

### Requirement 9: Сохранение 2D-пути как fallback

**User Story:** Как оператор, я хочу сохранить существующий 2D-путь как запасной, чтобы при недоступности 3D-среды или depth-ControlNet можно было собрать борд прежним способом.

#### Acceptance Criteria

1. THE AI_Design_3D_Blockout SHALL добавлять Blockout_Pipeline как отдельный путь, не удаляя и не изменяя Fallback_2D_Path.
2. WHERE оператор выбирает Fallback_2D_Path, THE AI_Design_3D_Blockout SHALL собирать борд существующим 2D-способом без обращения к Render_Environment.
3. IF Render_Environment недоступна в момент запуска, THEN THE Blockout_Pipeline SHALL сообщать о недоступности и предлагать Fallback_2D_Path.

### Requirement 10: Загрузка результата в R2

**User Story:** Как оператор, я хочу загружать собранный борд в R2, чтобы получать публичный URL для оценки и последующей публикации.

#### Acceptance Criteria

1. WHEN борд собран, THE Blockout_Pipeline SHALL загружать итоговое изображение в Object_Storage через `objectStorage.ts`.
2. WHEN загрузка завершена, THE Blockout_Pipeline SHALL выводить публичный URL загруженного борда.
3. IF любая из переменных окружения Object_Storage не задана, THEN THE Blockout_Pipeline SHALL завершаться с ошибкой, называющей отсутствующую переменную.

### Requirement 11: Публикация SEO-страниц и партия проектов

**User Story:** Как оператор, я хочу публиковать готовые борды как SEO-страницы партиями по городам и районам ЮФО, чтобы наполнить сайт дизайн-проектами.

#### Acceptance Criteria

1. WHERE включена публикация, THE Blockout_Pipeline SHALL создавать запись SEO_Page в `designs` со `status=completed`, `is_public=true`, заполненными `views[]`, `resultImageUrl` и `content`.
2. THE Batch_Project_Set SHALL поддерживать запуск партии проектов для заданного списка городов и районов ЮФО.
3. WHILE `DATABASE_URL` недоступен из локальной машины, THE Blockout_Pipeline SHALL выполнять шаг публикации в БД только в окружении Railway.
4. IF БД недоступна в момент публикации, THEN THE Blockout_Pipeline SHALL пропускать шаг публикации в БД, даже в окружении Railway.
5. IF публикация SEO_Page прервана после загрузки борда в R2, THEN THE Blockout_Pipeline SHALL сохранять уже полученный публичный URL борда в выводе для повторной публикации.

### Requirement 12: Стоимость и среда рендера

**User Story:** Как оператор, я хочу контролировать стоимость и среду рендера, чтобы пайплайн оставался дешёвым и воспроизводимым.

#### Acceptance Criteria

1. THE Render_Environment SHALL предоставлять headless Blender, исполняемый как `blender --background --python`.
2. THE Depth_Render_Step SHALL использовать рендер-движок EEVEE Next для Depth_Map.
3. THE Blockout_Pipeline SHALL удерживать суммарную стоимость одного проекта в пределах Cost_Budget от $0.2 до $0.6.
4. WHEN проект завершён, THE Blockout_Pipeline SHALL выводить суммарную стоимость в копейках по всем вызовам Depth_ControlNet_Provider.
5. IF суммарная стоимость вызовов Depth_ControlNet_Provider превышает верхнюю границу Cost_Budget, THEN THE Blockout_Pipeline SHALL прекращать дальнейшие вызовы провайдера и сообщать о превышении бюджета.

### Requirement 13: Обработка отказов и деградация

**User Story:** Как оператор, я хочу аккуратной деградации при сбоях Blender или depth-ControlNet, чтобы частичный отказ не приводил к потере уже выполненной работы.

#### Acceptance Criteria

1. IF Blockout_Builder завершается с ошибкой при построении Room_Blockout, THEN THE Blockout_Pipeline SHALL прекращать 3D-путь и предлагать Fallback_2D_Path.
2. IF Depth_ControlNet_Provider возвращает ошибку для отдельной Depth_Map, THEN THE Blockout_Pipeline SHALL повторять вызов в пределах фиксированного числа попыток до отказа по этой Depth_Map.
3. IF после исчерпания попыток перекраска изометрической или ортографической камеры не удалась, THEN THE Blockout_Pipeline SHALL передавать соответствующее поле `InfographicInput` как `null` и продолжать сборку борда; при сбое камеры на первой попытке THE Blockout_Pipeline SHALL немедленно продолжать обработку остальных камер и устанавливать поле в `null` только после исчерпания попыток.
4. IF перекраска любой из 4 фото-камер не удалась после исчерпания попыток, THEN THE Blockout_Pipeline SHALL прекращать сборку борда и сообщать, какая камера не удалась, причём прекращение сборки SHALL происходить немедленно независимо от того, удалось ли сформировать отчёт о сбое.
5. WHEN происходит сбой любого шага Blockout_Pipeline, THE Blockout_Pipeline SHALL выводить сообщение, называющее сбойный шаг и причину.
