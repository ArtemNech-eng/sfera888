# Requirements Document

## Introduction

AI_Design_Flagship — это единый флагманский генератор AI-дизайна интерьера на домене chestnye-mastera.ru. Пользователь загружает фото своей комнаты, задаёт параметры (тип помещения, стиль, палитра, ценовой сегмент/бюджет, площадь) и получает законченный дизайн-проект; для проекта (бизнеса) каждый завершённый проект становится публичной SEO-страницей `/dizajn/{slug}`, которая привлекает органический трафик.

Фича решает накопившийся продуктовый и технический долг: сегодня на сайте существуют ТРИ дублирующих точки входа в один и тот же пайплайн генерации, каждая со своей формой, контрактом и визуальным языком:

1. `/dizajn` (`UploadForm`) — legacy-форма с загрузкой фото через `multipart/form-data`, поля `room/style/area/budget/durationWeeks/citySlug`, без капчи.
2. `/ai-design` (`_AiDesignForm`) — JSON-форма с Cloudflare Turnstile и размерами комнаты (`widthCm/lengthCm/heightCm`), с MVP-замком только на `bedroom`.
3. `/hochu-takzhe` (`DesignConfigurator`) — JSON-форма с Turnstile, визуальными плитками выбора, тёмной premium-темой, клиентской квотой бесплатных генераций в `localStorage` и paywall-модалкой.

Эти три точки входа создают дублирующийся контент, рассинхронизированные контракты и непоследовательный UX. Более того, цепочка запросов сейчас разорвана: Next-прокси `app/api/dizajn/generate/route.ts` читает `req.formData()` и пересылает `multipart`, тогда как backend `POST /api/marketplace/dizajn/generate` принимает ТОЛЬКО JSON (`cf-turnstile-response` + `roomType/style/widthCm/lengthCm/heightCm/budget`) и не имеет обработчика загрузки изображений (`multer`/R2-приём отсутствуют). Worker (`designWorker.ts`) умеет image-to-image, но HTTP-путь не принимает фото пользователя. Этот рассинхрон, вероятно, ломает генерацию сегодня и должен быть устранён.

Флагман консолидирует три точки входа в одну каноническую страницу `/dizajn` (цель навигации «AI-дизайн»), переводит `/ai-design` и `/hochu-takzhe` в 308-редирект на неё (одна канонная URL, без дублирующего контента), и сквозным образом проводит загруженное фото от формы через Next-прокси и backend в хранилище R2 и в worker для image-to-image. При наличии фото генерируется редизайн ТОЙ ЖЕ комнаты с сохранением геометрии; без фото — text-to-image по параметрам.

Фича опирается на существующую инфраструктуру и спеки `.kiro/specs/ai-design-product` (базовый пайплайн) и `.kiro/specs/ai-design-quality-fix` (исправления качества), расширяя их, а не переписывая. Anti-abuse (Turnstile + серверный rate-limit по anon-id и IP) и монетизация (клиентская бесплатная квота + paywall) сохраняются. Авторизация (Telegram и т.п.) в этой фиче не вводится.

## Glossary

- **AI_Design_Flagship**: единый флагманский генератор AI-дизайна, живущий по канонической URL `/dizajn`, заменяющий собой три прежних точки входа.
- **Flagship_Form**: единая публичная форма флагмана на странице `/dizajn`, через которую пользователь загружает фото и задаёт параметры будущего `Design_Project`.
- **Design_Project**: одна запись в таблице `designs`, представляющая один дизайн-проект для одного помещения, доступная по публичному URL `/dizajn/{slug}`.
- **Design_Worker**: фоновый воркер `artifacts/api-server/src/lib/designWorker.ts`, доводящий запись `designs` со статусом `generating` до `completed` или `failed`.
- **Generate_Endpoint**: backend-обработчик `POST /api/marketplace/dizajn/generate` в `artifacts/api-server/src/routes/dizajn.ts`, создающий `Design_Project` и возвращающий `202 { slug }`.
- **Proxy_Route**: Next-обработчик `POST /api/dizajn/generate` в `artifacts/marketplace/app/api/dizajn/generate/route.ts`, проксирующий запрос на `Generate_Endpoint` и добавляющий `anonId`.
- **Room_Photo**: изображение комнаты пользователя, опционально загружаемое в `Flagship_Form` (JPG или PNG, не больше 8 МБ).
- **Image_To_Image_Mode**: режим генерации, при котором `Design_Worker` использует `Room_Photo` как референс и создаёт редизайн той же комнаты с сохранением геометрии (стены, окна, двери, пропорции).
- **Text_To_Image_Mode**: режим генерации, при котором `Room_Photo` отсутствует и `Design_Worker` создаёт сцену с нуля только по параметрам.
- **Generation_Mode**: одно из двух значений — `Image_To_Image_Mode` или `Text_To_Image_Mode`.
- **Room_Type**: тип помещения, одно из `bedroom`, `kitchen`, `bathroom`, `living_room`, `hallway`, `nursery`, `apartment`.
- **Style**: стиль интерьера, одно из `modern`, `scandinavian`, `loft`, `minimalism`, `neoclassic`, `japandi`, `classic`.
- **Palette**: цветовая палитра, выбираемая пользователем (например, тёплые нейтральные, белый+дерево, холодный серый и т.д.).
- **Price_Segment**: ценовой сегмент проекта (`econom`, `optima`, `premium`), отображаемый в `Budget` в рублях.
- **Budget**: бюджет проекта в рублях, в диапазоне 50 000..5 000 000 ₽.
- **Area**: площадь помещения в м², задаваемая пользователем и преобразуемая в размеры комнаты в см.
- **MVP_Room_Lock**: ограничение текущей фазы, при котором запуск генерации разрешён только для определённого подмножества `Room_Type` (на текущем backend — только `bedroom`), а остальные значения отображаются как «скоро».
- **Request_Contract**: согласованный формат тела запроса генерации, единый на всей цепочке `Flagship_Form` → `Proxy_Route` → `Generate_Endpoint` → `Design_Worker`.
- **Turnstile**: Cloudflare Turnstile — провайдер проверки на бота; токен `cf-turnstile-response` обязателен при отправке `Flagship_Form`.
- **Rate_Limiter**: серверный модуль (`lib/designRateLimit.ts`), ограничивающий число новых `Design_Project` по `Anon_Id` и по IP-адресу.
- **Anon_Id**: UUID v4 в cookie `kiro_anon_id`, идентификатор анонимного посетителя и владельца `Design_Project`.
- **Free_Quota**: клиентская квота бесплатных генераций (по умолчанию 1), хранящаяся в `localStorage`; при исчерпании показывается `Paywall_Modal`.
- **Paywall_Modal**: модальное окно, предлагающее платный пакет при исчерпании `Free_Quota`.
- **Object_Storage**: хранилище R2, в которое сохраняется `Room_Photo` и результаты генерации.
- **Public_Page**: страница `/dizajn/{slug}`, рендерящая завершённый `Design_Project` для всех пользователей.
- **Pending_Page**: состояние страницы `/dizajn/{slug}`, когда `Design_Project` ещё генерируется или завершился ошибкой; опрашивает статус до завершения.
- **Generation_Status**: значение `designs.status`, одно из `generating`, `completed`, `failed` (и др.).
- **SEO_Metadata**: набор SEO-артефактов `Public_Page`: JSON-LD (Article, BreadcrumbList, Service/Offer, ImageObject), OpenGraph, Twitter, canonical.
- **Aggregate_Page**: агрегирующая SEO-страница `/dizajn/{room}-{style}` (а также `/dizajn/{room}` и `/dizajn/{style}`), собирающая завершённые проекты категории.
- **Sitemap**: карта сайта, в которую включаются индексируемые `Public_Page` и `Aggregate_Page`.

## Requirements

### Requirement 1: Единая каноническая точка входа

**User Story:** Как посетитель сайта, я хочу одну понятную страницу AI-дизайна, чтобы не путаться между несколькими дублирующими формами и получать единый опыт.

#### Acceptance Criteria

1. THE AI_Design_Flagship SHALL предоставлять единственную форму генерации `Flagship_Form` по канонической URL `/dizajn`.
2. THE AI_Design_Flagship SHALL служить целевой страницей пункта навигации «AI-дизайн».
3. WHEN пользователь открывает `/ai-design`, THE AI_Design_Flagship SHALL ответить HTTP-редиректом 308 на `/dizajn`.
4. WHEN пользователь открывает `/hochu-takzhe`, THE AI_Design_Flagship SHALL ответить HTTP-редиректом 308 на `/dizajn`.
5. THE Public_Page SHALL объявлять канонической URL `/dizajn/{slug}` для каждого завершённого `Design_Project`.
6. THE AI_Design_Flagship SHALL объявлять канонической URL `/dizajn` для страницы формы.

### Requirement 2: Загрузка фото и параметров через единую форму

**User Story:** Как пользователь, я хочу загрузить фото своей комнаты и выбрать параметры в одной форме, чтобы запустить генерацию персонального дизайн-проекта.

#### Acceptance Criteria

1. THE Flagship_Form SHALL принимать опциональную загрузку одного `Room_Photo`.
2. THE Flagship_Form SHALL принимать выбор `Room_Type` из множества допустимых значений.
3. THE Flagship_Form SHALL принимать выбор `Style` из множества допустимых значений.
4. THE Flagship_Form SHALL принимать выбор `Palette`.
5. THE Flagship_Form SHALL принимать выбор `Price_Segment` либо ввод `Budget` в рублях.
6. THE Flagship_Form SHALL принимать ввод `Area` в м².
7. WHEN пользователь отправляет `Flagship_Form` и `Generate_Endpoint` возвращает статус 202 со `slug`, THE AI_Design_Flagship SHALL перенаправить пользователя на `/dizajn/{slug}`.
8. WHILE `Design_Project` имеет `Generation_Status` равный `generating`, THE Pending_Page SHALL опрашивать статус проекта до перехода в `completed` или `failed`.

### Requirement 3: Два режима генерации (image-to-image и text-to-image)

**User Story:** Как пользователь, я хочу, чтобы при загрузке фото дизайн создавался для моей же комнаты, а без фото — по моим параметрам, чтобы результат соответствовал моим ожиданиям.

#### Acceptance Criteria

1. WHEN `Flagship_Form` отправлена с приложенным `Room_Photo`, THE AI_Design_Flagship SHALL выбрать `Image_To_Image_Mode` для генерации.
2. WHEN `Flagship_Form` отправлена без `Room_Photo`, THE AI_Design_Flagship SHALL выбрать `Text_To_Image_Mode` для генерации.
3. WHILE генерация выполняется в `Image_To_Image_Mode`, THE Design_Worker SHALL создавать редизайн, сохраняющий геометрию исходной комнаты: расположение стен, окон, дверей и пропорции помещения.
4. WHILE генерация выполняется в `Text_To_Image_Mode`, THE Design_Worker SHALL создавать сцену помещения на основе выбранных `Room_Type`, `Style`, `Palette`, `Price_Segment` и `Area`.
5. WHERE `Generation_Mode` равен `Image_To_Image_Mode`, THE Design_Project SHALL сохранять ссылку на исходный `Room_Photo` как входное изображение.
6. IF в `Image_To_Image_Mode` результат генерации не сохраняет геометрию исходной комнаты, THEN THE Design_Worker SHALL повторить image-to-image генерацию до достижения сохранения геометрии, не переходя в `Text_To_Image_Mode`.
7. WHILE выполняются повторы по сохранению геометрии, THE Design_Worker SHALL ограничивать число повторов заданным верхним пределом, согласованным с действующим ограничением стоимости (cost guard), и при достижении предела устанавливать `Generation_Status` равным `failed`.
8. IF в `Text_To_Image_Mode` создание сцены завершается неудачей из-за недопустимых или неполных параметров, THEN THE Design_Worker SHALL завершить генерацию с `Generation_Status` равным `failed` без повторов и без скрытого восстановления.

### Requirement 4: Сквозная передача фото по цепочке запросов

**User Story:** Как пользователь, я хочу, чтобы загруженное фото действительно дошло до генератора, чтобы режим image-to-image работал, а не падал из-за рассинхрона форматов.

#### Acceptance Criteria

1. WHEN `Room_Photo` приложен, THE Proxy_Route SHALL передать `Room_Photo` на `Generate_Endpoint` без потери данных изображения.
2. WHEN `Generate_Endpoint` получает запрос с `Room_Photo`, THE Generate_Endpoint SHALL сохранить `Room_Photo` в `Object_Storage` и связать его с создаваемым `Design_Project`.
3. THE Request_Contract SHALL быть единым по формату на всех звеньях цепочки `Flagship_Form` → `Proxy_Route` → `Generate_Endpoint` → `Design_Worker`.
4. WHEN `Generate_Endpoint` получает запрос без поля `Room_Photo`, THE Generate_Endpoint SHALL принять запрос и создать `Design_Project` в `Text_To_Image_Mode`.
5. WHEN `Design_Worker` обрабатывает `Design_Project` со связанным `Room_Photo`, THE Design_Worker SHALL прочитать `Room_Photo` из `Object_Storage` для image-to-image генерации.
6. IF сохранение `Room_Photo` в `Object_Storage` завершается неудачей, THEN THE Generate_Endpoint SHALL всё равно создать `Design_Project` и перевести генерацию в `Text_To_Image_Mode`, не отклоняя запрос целиком.
7. WHEN запрос не содержит `Room_Photo`, THE Generate_Endpoint SHALL применять валидацию остальных полей согласно Requirement 5 и создавать `Design_Project` при условии прохождения этой валидации, рассматривая отсутствие `Room_Photo` как допустимое состояние.

### Requirement 5: Валидация ввода

**User Story:** Как пользователь, я хочу получить понятные сообщения обо всех ошибках ввода сразу, чтобы исправить их за один проход.

#### Acceptance Criteria

1. IF `Room_Type` не входит в множество допустимых значений, THEN THE Generate_Endpoint SHALL отклонить запрос с кодом ошибки валидации.
2. IF `Style` не входит в множество допустимых значений, THEN THE Generate_Endpoint SHALL отклонить запрос с кодом ошибки валидации.
3. IF `Budget` выходит за пределы диапазона 50 000..5 000 000 ₽, THEN THE Generate_Endpoint SHALL отклонить запрос с кодом ошибки валидации.
4. IF производная площадь комнаты меньше минимально допустимой для выбранного `Room_Type`, THEN THE Generate_Endpoint SHALL отклонить запрос с кодом `room_too_small`.
5. IF загруженный `Room_Photo` имеет тип, отличный от JPG или PNG, THEN THE Generate_Endpoint SHALL отклонить запрос с кодом ошибки валидации.
6. IF загруженный `Room_Photo` превышает 8 МБ, THEN THE Generate_Endpoint SHALL отклонить запрос с кодом ошибки валидации.
7. WHEN запрос содержит несколько нарушений валидации одновременно, THE Generate_Endpoint SHALL вернуть список всех нарушений, а не только первого.

### Requirement 6: MVP-ограничение по типу помещения

**User Story:** Как продукт, я хочу зафиксировать, какие типы помещений открыты на текущей фазе, чтобы не выпускать недоведённые до качества режимы.

#### Acceptance Criteria

1. WHILE `MVP_Room_Lock` активен, THE Flagship_Form SHALL отображать заблокированные значения `Room_Type` с пометкой «скоро» без возможности отправки.
2. WHILE `MVP_Room_Lock` активен, IF запрос содержит `Room_Type`, не входящий в разрешённое на MVP подмножество, THEN THE Generate_Endpoint SHALL отклонить запрос с кодом `mvp_room_locked`.
3. THE AI_Design_Flagship SHALL использовать `bedroom` как разрешённый на MVP `Room_Type` в соответствии с текущим backend-ограничением.

### Requirement 7: Anti-abuse защита

**User Story:** Как владелец платформы, я хочу защитить генерацию от ботов и злоупотреблений, чтобы не сжигать бюджет на AI-вызовы.

#### Acceptance Criteria

1. THE Flagship_Form SHALL включать виджет `Turnstile` и передавать токен `cf-turnstile-response` при отправке.
2. IF токен `Turnstile` отсутствует или не проходит проверку, THEN THE Generate_Endpoint SHALL отклонить запрос с кодом `invalid_captcha`.
3. WHEN запрос проходит проверку `Turnstile`, THE Rate_Limiter SHALL проверить и учесть лимит по `Anon_Id` и по IP-адресу.
4. IF лимит по `Anon_Id` или по IP-адресу превышен, THEN THE Generate_Endpoint SHALL отклонить запрос с кодом `rate_limited` и значением времени до повторной попытки.
5. WHEN запрос отклонён любой проверкой валидации после успешного учёта в `Rate_Limiter`, THE Generate_Endpoint SHALL откатить учтённые счётчики `Rate_Limiter`.

### Requirement 8: Монетизация через бесплатную квоту и paywall

**User Story:** Как пользователь, я хочу попробовать генерацию бесплатно, а как продукт — предложить платный доступ при исчерпании лимита.

#### Acceptance Criteria

1. THE Flagship_Form SHALL отображать остаток `Free_Quota` до отправки.
2. WHILE остаток `Free_Quota` равен нулю, THE Flagship_Form SHALL отображать остаток как «0 осталось», не скрывая исчерпанную квоту.
3. IF `Free_Quota` исчерпана, THEN THE AI_Design_Flagship SHALL показать `Paywall_Modal` вместо запуска генерации.
4. WHEN генерация успешно стартовала (статус 202), THE AI_Design_Flagship SHALL списать одну единицу из `Free_Quota`.
5. THE AI_Design_Flagship SHALL рассматривать `Free_Quota` как UX-триггер, а реальной границей anti-abuse SHALL оставаться серверный `Rate_Limiter`.

### Requirement 9: SEO-страница завершённого проекта

**User Story:** Как владелец платформы, я хочу, чтобы каждый завершённый проект становился индексируемой SEO-страницей, чтобы привлекать органический трафик.

#### Acceptance Criteria

1. WHEN `Design_Project` достигает `Generation_Status` равного `completed`, THE Public_Page SHALL отрендерить его по URL `/dizajn/{slug}`.
2. THE Public_Page SHALL включать `SEO_Metadata`: JSON-LD типов Article, BreadcrumbList, Service/Offer и ImageObject.
3. THE Public_Page SHALL включать теги OpenGraph и Twitter, а также canonical-ссылку.
4. THE Public_Page SHALL применять ISR-кэширование с заданным интервалом ревалидации.
5. WHERE интервал ревалидации ISR равен 0, THE Public_Page SHALL становиться полностью статической после первой генерации.
6. THE AI_Design_Flagship SHALL поддерживать `Aggregate_Page` по адресам `/dizajn/{room}-{style}`, `/dizajn/{room}` и `/dizajn/{style}`.
7. THE Sitemap SHALL включать индексируемые `Public_Page` и `Aggregate_Page`.

### Requirement 10: Исключение незавершённых проектов из индексации

**User Story:** Как владелец платформы, я хочу, чтобы поисковики не индексировали недоготовые или сломанные проекты, чтобы не портить SEO дублирующимся или пустым контентом.

#### Acceptance Criteria

1. WHILE `Design_Project` имеет `Generation_Status`, отличный от `completed`, THE Public_Page SHALL отдавать метатег `noindex`.
2. THE Sitemap SHALL исключать `Design_Project`, чей `Generation_Status` не равен `completed`.
3. THE Aggregate_Page SHALL включать только `Design_Project` со статусом `completed`.
4. IF запрошенный `slug` не соответствует существующему `Design_Project` и не является валидной агрегирующей комбинацией, THEN THE Public_Page SHALL вернуть ответ 404 с метатегом `noindex`.
5. WHILE `Design_Project` имеет `Generation_Status` равный `completed`, THE Sitemap SHALL сохранять его независимо от последующих проблем доступности, не удаляя его при временной недоступности.
