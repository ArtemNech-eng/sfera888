# Requirements Document

## Introduction

Это **Стадия 2** согласованного плана развития живого гео-сообщества «ХочуТакже» (см. существующую спецификацию `.kiro/specs/hochu-takzhe-community/`). Действующая функция уже работает в проде: зона «Соседи» (сообщество) и зона «Хочу также ПРО» на базе `api-server` (Express + Drizzle + Postgres, домен `sfera-master.ru/api`) и фасада Next.js 15 (`chestnye-mastera.ru`), который обращается к `api-server` в режиме server-to-server. Общая схема БД лежит в `lib/db/src/schema`.

**Проблема.** Текущая гео-модель сообщества бинарна: `City → ЖК` (жилой комплекс / новостройка). Таблица `zhk` (`lib/db/src/schema/zhk.ts`) неявно представляет только ЖК и не имеет типа локации. Это исключает всех, кто **не** живёт в новостройке: жителей старого фонда (вторичка) и частного сектора (частный дом, посёлок). Продукт не должен быть «только про ЖК».

**Цель.** Обобщить единицу локальности за пределы ЖК так, чтобы сообщество работало для всех жителей города. Согласованное направление:

- Превратить «ЖК» в универсальную сущность **Локация (Место)** с **типом (kind)**: `zhk` (жилой комплекс / новостройка), `district` (район / микрорайон — покрывает старый фонд, например «ФМР», «Черёмушки»), `settlement` (посёлок / частный сектор). Плюс всегда доступный уровень города.
- Реализовать как **обратно совместимое обобщение** существующей таблицы `zhk` (значение типа по умолчанию — `zhk`, чтобы ничего существующее не сломалось), а не как совершенно новую таблицу. Требования фиксируют **поведение**, а не конкретную колонку — итоговое решение принимает дизайн.
- UX сообщества: страница города перечисляет **все** локации (ЖК и районы вперемешку) и содержит форму «добавить место», где житель выбирает тип; страница локации работает одинаково для ЖК и района (локальная лента); житель старого фонда выбирает свой район или пишет в городскую ленту. Никого не заставляют искать несуществующий ЖК.
- SEO: страницы районов / микрорайонов становятся новыми посадочными страницами (например, «сантехник в Черёмушках», «ремонт ФМР Краснодар»). Они обязаны соблюдать существующий гейт порога контента / `is_indexable` и попадать в источник sitemap сообщества (`routes/community/sitemap.ts`) ровно так же, как сегодня попадают ЖК.
- Темы уже поддерживают scope `city | zhk` (`community-threads.ts`). Требования покрывают, как темы района / посёлка привязываются (переиспользуя существующий механизм scope / лент).
- Обратная совместимость и миграция: существующие строки `zhk`, слаги, страницы (`/zhk/[slug]`) и живое поведение функции «hochu-takzhe-community» должны продолжать работать. Требования включают ожидание безопасности данных при миграции (идемпотентный DDL, тип по умолчанию `zhk`).
- Дедупликация в пределах города должна продолжать работать per-локация (сейчас — `name_normalized` в `zhk`).

**Вне области действия (НЕ включать в эту спецификацию):** воронка лидов в стиле Profi.ru и любые изменения аккаунтов / регистрации — это отдельная будущая стадия. Данная спецификация посвящена **только** обобщению модели локальности сообщества и его страницам / SEO.

Реальные города в каталоге: `krasnodar`, `rostov-na-donu`, `volgograd`, `stavropol` (Южный ФО, без Москвы).

## Glossary

- **Community_Platform**: действующая платформа гео-сообщества «ХочуТакже» — публичный веб-фасад (Next.js на `chestnye-mastera.ru`) плюс серверные сервисы `api-server` (`sfera-master.ru/api`).
- **Geo_Service**: серверный сервис, управляющий гео-иерархией, лентами и созданием записей локаций (`api-server/src/routes/community/geo.ts`, `src/lib/geoService.ts`).
- **City**: населённый пункт в гео-иерархии; верхний уровень над локациями. Реальный набор: `krasnodar`, `rostov-na-donu`, `volgograd`, `stavropol`.
- **Locality**: обобщённая локальная единица внутри City — место, вокруг которого формируется локальное сообщество. Обобщение прежней сущности «ЖК». Каждая Locality принадлежит ровно одному City.
- **Locality_Kind**: тип Locality — одно из значений `zhk` (жилой комплекс / новостройка), `district` (район / микрорайон, включая старый фонд), `settlement` (посёлок / частный сектор).
- **Locality_Record**: запись о Locality в базе (обобщение прежней `ZhK_Record`), содержащая тип, slug, название, город и опциональные атрибуты.
- **Zhk_Kind**: значение Locality_Kind, равное `zhk` — жилой комплекс / новостройка; тип по умолчанию для всех записей, существовавших до Стадии 2.
- **District_Kind**: значение Locality_Kind, равное `district` — район / микрорайон города (например, «ФМР», «Черёмушки»), покрывает старый фонд / вторичку.
- **Settlement_Kind**: значение Locality_Kind, равное `settlement` — посёлок / частный сектор / частный дом.
- **City_Feed**: общегородская лента для широких тем, привязанная к уровню City.
- **Local_Feed**: локальная лента конкретной Locality (соседский чат), независимо от Locality_Kind.
- **Locality_Page**: публичная SEO-страница Locality на фасаде (маршрут `/zhk/[slug]`), отображающая Local_Feed и атрибуты.
- **City_Page**: публичная страница City на фасаде (маршрут `/goroda/[slug]`), перечисляющая локации города и City_Feed.
- **Add_Place_Form**: публичная форма добавления новой Locality, в которой автор выбирает Locality_Kind.
- **Community_Thread**: тема / пост сообщества (таблица `community_threads`) с дискриминатором `scope`.
- **Thread_Scope**: уровень привязки Community_Thread — `city` (уровень City) либо `zhk` (уровень Locality, для любого Locality_Kind).
- **Resident**: житель, использующий Sosedi-зону и локальные ленты (в новостройке, старом фонде или частном секторе).
- **Anonymous_Visitor**: посетитель без учётной записи и без авторизации.
- **Community_Account**: облегчённая учётная запись для публикации в сообществе с завершённой Phone_Verification.
- **Phone_Verification**: подтверждение по телефону, дающее право публикации / создания записей.
- **SEO_Service**: логика индексируемости, sitemap, canonical и защиты от «тонких» страниц.
- **Content_Threshold**: гейт порога контента, определяющий значение `is_indexable` для Locality_Record.
- **Community_Sitemap_Source**: источник индексируемых слагов сообщества для фасадного sitemap (`api-server/src/routes/community/sitemap.ts`).
- **Name_Normalized**: нормализованное имя `lower(trim(name))`, используемое для дедупликации Locality в пределах City.
- **Migration**: DDL-миграция схемы `lib/db/src/schema`, обобщающая таблицу `zhk`.

## Requirements

### Requirement 1: Обобщённая гео-иерархия Город → Локация с типом

**User Story:** Как продукт, я хочу, чтобы локальная единица сообщества имела тип (ЖК, район или посёлок), чтобы жители любого типа застройки находили своё локальное сообщество, а не только жители новостроек.

#### Acceptance Criteria

1. THE Geo_Service SHALL представлять гео-иерархию ровно в двух уровнях (City и Locality), где каждый Locality_Record связан ровно с одним City, ни один Locality_Record не существует без City, а каждый City содержит 0 или более Locality_Record без верхнего предела.
2. THE Geo_Service SHALL присваивать каждому Locality_Record значение Locality_Kind, равное ровно одному из `zhk`, `district` или `settlement`.
3. WHEN Geo_Service создаёт Locality_Record с явно указанным Locality_Kind, равным одному из `zhk`, `district` или `settlement`, THE Geo_Service SHALL присваивать этому Locality_Record именно указанное значение Locality_Kind.
4. WHEN Geo_Service создаёт Locality_Record без явно указанного Locality_Kind, THE Geo_Service SHALL присваивать этому Locality_Record значение Locality_Kind, равное `zhk`.
5. IF запрос на создание Locality_Record содержит значение Locality_Kind вне множества `zhk`, `district`, `settlement`, THEN THE Geo_Service SHALL не создавать Locality_Record и возвращать сообщение, указывающее на недопустимый тип локации.
6. THE Geo_Service SHALL присваивать каждому City и каждому Locality_Record slug, уникальный в едином пространстве имён всех City и Locality_Record (никакие две сущности не имеют одинакового slug), состоящий только из строчных латинских букв (a–z), цифр (0–9) и дефисов, длиной от 1 до 100 символов включительно, для формирования публичного URL.
7. WHEN отображается Locality_Page, THE Geo_Service SHALL отображать на ней каждый атрибут Locality_Record (например, застройщик, срок сдачи или список корпусов), значение которого не равно null и не является пустой строкой после удаления пробельных символов, и не отображать атрибуты с пустым значением.

### Requirement 2: Локальное сообщество для старого фонда и частного сектора

**User Story:** Как житель старого фонда или частного сектора, я хочу выбрать свой район или посёлок, чтобы общаться с соседями, не будучи вынужденным искать несуществующий ЖК.

#### Acceptance Criteria

1. WHEN Anonymous_Visitor открывает Locality_Page с Locality_Kind, равным `district` или `settlement`, по существующему slug, THE Geo_Service SHALL предоставлять Local_Feed, содержащий только Community_Thread, привязанные к этому Locality_Record, отсортированные по дате создания от новых к старым, а при равенстве дат создания — по идентификатору Community_Thread в порядке убывания.
2. THE Geo_Service SHALL обслуживать Local_Feed единообразно для всех значений Locality_Kind, применяя одинаковую логику формирования ленты независимо от типа локации.
3. WHERE Resident не находит подходящей Locality своего типа в City, THE Geo_Service SHALL предоставлять возможность опубликовать Community_Thread в City_Feed текущего City.
4. THE City_Page SHALL перечислять Locality_Record всех значений Locality_Kind, принадлежащие City, в едином списке локаций, отсортированном по Name_Normalized в порядке возрастания, без группировки по Locality_Kind.
5. IF Anonymous_Visitor открывает Locality_Page по slug, которому не соответствует ни один Locality_Record, THEN THE Geo_Service SHALL не предоставлять Local_Feed и возвращать индикацию ошибки «локация не найдена».
6. WHEN Anonymous_Visitor открывает Locality_Page по существующему slug, с которым не связан ни один Community_Thread, THE Geo_Service SHALL предоставлять пустой Local_Feed (содержащий ноль Community_Thread) без возврата ошибки.

### Requirement 3: Регрессия ЖК (обратная совместимость поведения)

**User Story:** Как житель новостройки, я хочу, чтобы страницы и ленты моего ЖК продолжали работать как прежде, чтобы обобщение модели не сломало существующее сообщество.

#### Acceptance Criteria

1. WHEN Anonymous_Visitor открывает Locality_Page с Locality_Kind, равным `zhk`, по существующему slug, THE Geo_Service SHALL предоставлять Local_Feed, содержащий только Community_Thread этого Locality_Record, отсортированные по дате создания от новых к старым.
2. THE Community_Platform SHALL сохранять работоспособность существующего маршрута фасада `/zhk/[slug]` для всех Locality_Record независимо от Locality_Kind.
3. THE Geo_Service SHALL сохранять существующие slug всех Locality_Record, созданных до Стадии 2, в неизменном виде (без изменения символьного значения slug).
4. WHEN Anonymous_Visitor открывает существующую Locality_Page или Local_Feed зоны «Соседи», работавшие до Стадии 2, THE Community_Platform SHALL возвращать результат, функционально эквивалентный поведению до Стадии 2, то есть одновременно: тот же набор Community_Thread, тот же порядок сортировки, те же отображаемые атрибуты, то же значение is_indexable и та же доступность страницы.
5. IF Anonymous_Visitor обращается к маршруту `/zhk/[slug]` с неизвестным slug (не соответствующим ни одному Locality_Record), THEN THE Community_Platform SHALL возвращать результат «страница не найдена» с тем же поведением, что и до Стадии 2.

### Requirement 4: Добавление нового места с выбором типа

**User Story:** Как житель, я хочу добавить своё место (ЖК, район или посёлок) с указанием его типа, чтобы начать локальное сообщество, если его ещё нет.

#### Acceptance Criteria

1. THE Add_Place_Form SHALL предоставлять автору выбор Locality_Kind из значений `zhk`, `district` и `settlement`.
2. WHEN Community_Account с завершённой Phone_Verification отправляет Add_Place_Form с названием длиной от 2 до 100 символов после удаления начальных и конечных пробелов (trim), выбранным Locality_Kind и существующим City, THE Geo_Service SHALL создавать Locality_Record с указанным Locality_Kind в рамках того же запроса и без промежуточной модерации.
3. WHEN Geo_Service создаёт Locality_Record, THE Geo_Service SHALL возвращать подтверждающее сообщение об успешном создании вместе со slug созданной Locality_Record.
4. WHEN Geo_Service создаёт Locality_Record, THE Geo_Service SHALL делать соответствующий Local_Feed доступным по его slug немедленно в рамках того же запроса и без промежуточной модерации.
5. IF автор Add_Place_Form не имеет завершённой Phone_Verification, THEN THE Geo_Service SHALL отклонять создание Locality_Record, не сохранять Locality_Record и возвращать сообщение о необходимости подтверждения телефона.
6. IF название в Add_Place_Form после удаления начальных и конечных пробелов (trim) короче 2 символов или длиннее 100 символов, THEN THE Geo_Service SHALL отклонять создание Locality_Record, не сохранять Locality_Record и возвращать сообщение, указывающее на недопустимую длину названия.
7. IF City, указанный в Add_Place_Form, не существует, THEN THE Geo_Service SHALL отклонять создание Locality_Record, не сохранять Locality_Record и возвращать сообщение, указывающее, что город не найден.
8. WHEN Geo_Service создаёт Locality_Record, THE Geo_Service SHALL вычислять Name_Normalized как `lower(trim(name))` и сохранять его вместе с записью.

### Requirement 5: Дедупликация локаций в пределах города

**User Story:** Как продукт, я хочу предотвращать дублирующиеся места в одном городе, чтобы соседи собирались в одном сообществе, а не в нескольких копиях.

#### Acceptance Criteria

1. WHEN автор отправляет Add_Place_Form, чьё Name_Normalized (`lower(trim(name))`) посимвольно равно Name_Normalized хотя бы одного существующего Locality_Record в том же City, THE Geo_Service SHALL не создавать новый Locality_Record, сохранять существующий Locality_Record и его Local_Feed без изменений и возвращать существующий Locality_Record (его slug и название) вместе с сообщением, указывающим, что место с таким названием в этом City уже существует.
2. THE Geo_Service SHALL определять совпадение при дедупликации как посимвольное равенство значений Name_Normalized двух локаций, вычисленных как `lower(trim(name))`, и выполнять это сравнение только среди Locality_Record, принадлежащих одному и тому же City.
3. THE Geo_Service SHALL применять сравнение Name_Normalized для дедупликации ко всем Locality_Record в пределах City независимо от их Locality_Kind.
4. IF в пределах одного City одновременно поступают две или более Add_Place_Form с совпадающим Name_Normalized, THEN THE Geo_Service SHALL создавать не более одного Locality_Record с этим Name_Normalized, а каждый последующий запрос обрабатывать как совпадение с уже созданным Locality_Record и возвращать этот существующий Locality_Record.

### Requirement 6: Индексируемость страниц районов и посёлков (SEO)

**User Story:** Как SEO-специалист, я хочу, чтобы страницы районов и посёлков становились посадочными страницами (например, «сантехник в Черёмушках», «ремонт ФМР Краснодар»), чтобы привлекать поисковый трафик по локальным запросам старого фонда.

#### Acceptance Criteria

1. THE SEO_Service SHALL вычислять значение `is_indexable` каждого Locality_Record, применяя Content_Threshold по идентичным критериям независимо от значения Locality_Kind этого Locality_Record.
2. WHILE Locality_Record не удовлетворяет Content_Threshold (в том числе только что созданный Locality_Record, ещё не проходивший проверку), THE SEO_Service SHALL сохранять значение `is_indexable` этого Locality_Record равным `false`.
3. WHEN Locality_Record с Locality_Kind, равным `district` или `settlement`, ранее не удовлетворявший Content_Threshold, начинает удовлетворять Content_Threshold, THE SEO_Service SHALL устанавливать значение `is_indexable` этого Locality_Record равным `true`.
4. WHEN Locality_Record, ранее удовлетворявший Content_Threshold, перестаёт удовлетворять Content_Threshold, THE SEO_Service SHALL устанавливать значение `is_indexable` этого Locality_Record равным `false`.
5. WHEN в Local_Feed некоторого Locality_Record добавляется или удаляется Community_Thread, THE SEO_Service SHALL повторно вычислять соответствие этого Locality_Record Content_Threshold.
6. THE Locality_Page SHALL предоставлять для Locality_Record всех значений Locality_Kind непустой title, непустое текстовое описание и абсолютный canonical-URL, соответствующий slug этого Locality_Record.
7. WHILE значение `is_indexable` Locality_Record равно `false`, THE Locality_Page этого Locality_Record SHALL включать директиву запрета индексации (noindex).

### Requirement 7: Включение локаций в sitemap сообщества

**User Story:** Как SEO-специалист, я хочу, чтобы индексируемые районы и посёлки попадали в sitemap сообщества так же, как ЖК, чтобы поисковые системы находили новые посадочные страницы.

#### Acceptance Criteria

1. THE Community_Sitemap_Source SHALL включать в выдачу slug каждого Locality_Record любого значения Locality_Kind, у которого текущее значение `is_indexable` равно `true`, ровно один раз, без дубликатов.
2. IF значение `is_indexable` Locality_Record равно `false`, THEN THE Community_Sitemap_Source SHALL исключать slug этого Locality_Record из выдачи.
3. THE Community_Sitemap_Source SHALL возвращать слаги индексируемых Locality_Record в едином плоском списке, без разделения по Locality_Kind и без группировки по City, в детерминированном порядке (по возрастанию значения slug), пригодном для потребления фасадным sitemap.
4. WHEN Community_Sitemap_Source формирует выдачу и ни один Locality_Record не имеет `is_indexable`, равного `true`, THE Community_Sitemap_Source SHALL возвращать пустой список без ошибки.

### Requirement 8: Привязка тем района и посёлка через существующий механизм scope

**User Story:** Как житель района или посёлка, я хочу публиковать темы в локальной ленте моего места, чтобы обсуждения переиспользовали тот же механизм лент, что и ЖК.

#### Acceptance Criteria

1. WHEN Resident, аутентифицированный через Community_Account с завершённым Phone_Verification, публикует Community_Thread на существующем Locality_Page с Locality_Kind, равным `district` или `settlement`, THE Geo_Service SHALL сохранять Community_Thread с Thread_Scope, равным `zhk`, и привязывать её к идентификатору данного Locality_Record.
2. WHEN Resident открывает Local_Feed Locality_Page, THE Geo_Service SHALL отображать только Community_Thread, привязанные к идентификатору данного Locality_Record, независимо от Locality_Kind, отсортированные по дате создания от новых к старым.
3. WHEN Resident, аутентифицированный через Community_Account с завершённым Phone_Verification, публикует Community_Thread в City_Feed существующего City, THE Geo_Service SHALL сохранять Community_Thread с Thread_Scope, равным `city`, и привязывать её к текущему City.
4. IF Resident публикует Community_Thread через Community_Account без завершённого Phone_Verification, THEN THE Geo_Service SHALL отклонять публикацию, не сохранять Community_Thread и возвращать индикацию ошибки, указывающую на необходимость завершения Phone_Verification.
5. IF Resident публикует Community_Thread с указанием несуществующего Locality_Record или несуществующего City, THEN THE Geo_Service SHALL отклонять публикацию, не создавать Locality_Record или City, не сохранять Community_Thread и возвращать индикацию ошибки, указывающую на отсутствие целевого места.

### Requirement 9: Обратно совместимая миграция и безопасность данных

**User Story:** Как оператор системы, я хочу, чтобы обобщение таблицы локаций применялось без потери данных и простоя, чтобы живое сообщество продолжало работать во время и после миграции.

#### Acceptance Criteria

1. WHEN Migration применяется к базе, где обобщение локаций ещё не применено, THE Migration SHALL присваивать Locality_Kind, равный `zhk`, каждому Locality_Record, существовавшему до применения Migration, не оставляя ни одного такого Locality_Record без значения Locality_Kind.
2. THE Migration SHALL сохранять все существующие Locality_Record, их slug, названия и атрибуты без изменения значений, а также сохранять количество Locality_Record в каждом City неизменным (0 удалённых и 0 добавленных Locality_Record).
3. WHEN Migration применяется к базе, где обобщение локаций уже применено, THE Migration SHALL завершаться успешно без ошибки и оставлять все Locality_Record, их Locality_Kind, slug, названия и атрибуты без изменения значений (идемпотентность).
4. IF применение Migration завершается ошибкой на любом шаге, THEN THE Migration SHALL откатывать все частичные изменения, оставлять базу в состоянии, идентичном состоянию до запуска Migration (0 удалённых, 0 добавленных и 0 изменённых Locality_Record), и возвращать сообщение, указывающее на неуспешное применение миграции.
5. WHILE Migration выполняется, THE Community_Platform SHALL продолжать обслуживать Locality_Page и Local_Feed всех существовавших до Migration Locality_Record без простоя.
6. WHERE Locality_Record не имеет явно заданного Locality_Kind на уровне хранения, THE Geo_Service SHALL интерпретировать его Locality_Kind как `zhk`.
