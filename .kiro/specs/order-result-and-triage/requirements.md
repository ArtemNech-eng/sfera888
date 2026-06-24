# Requirements Document

## Introduction

В CRM накапливаются активные заказы, по которым непонятно, что делать дальше: одни ждут результата от мастера (фото «после» + сумма), другие ждут подтверждения суммы оператором, третьи закрыты, но комиссия не получена, четвёртые «висят» по 2 месяца без движения. Цель функции — дать оператору одну страницу-триаж в CRM, где зависшие заказы сгруппированы по причине зависания, а мастеру — заметный, не пропускаемый экран в PWA, который требует прислать результат по конкретной заявке. Триггер банера — либо автоматический (заказ старше N дней без результата), либо ручной (оператор нажал «Запросить результат» в триаже).

Функция строится поверх существующих сущностей и не меняет enum статусов заказов. «Результат» — это поля `orders.proposedAmount > 0` и `orders.photosAfter.length >= 1`, которые мастер уже заполняет через существующие эндпоинты `POST /api/master-pwa/orders/:id/photos` и `POST /api/master-pwa/orders/:id/complete`.

## Glossary

- **Triage_Page**: новая страница CRM по пути `/triage`, доступная ролям `admin`, `master_operator`, `lead_operator`. Группирует «зависшие» заказы по 5 категориям.
- **Order_Result**: совокупность `orders.proposedAmount > 0` И `length(orders.photosAfter) >= 1`. Отсутствие любого из двух условий означает «нет результата».
- **Result_Banner**: полноэкранный модальный экран в Master_PWA, перекрывающий навигацию, с заголовком «Пришлите результат по заявке #N», кнопкой «Перейти к заявке» и кнопкой «Закрыть».
- **Auto_Nudge_Threshold**: порог в днях от `orders.assignedAt`, после которого Result_Banner появляется автоматически. Конфигурируется в `app_settings`, дефолт 5 дней.
- **Operator_Nudge**: явный запрос оператора через `POST /api/orders/:id/result-nudge`. Пишет в `orders.resultNudgedAt = now()` и (если есть `masterId`) шлёт push-уведомление мастеру.
- **Master_PWA**: артефакт `artifacts/master-pwa`, React+wouter PWA для мастера.
- **CRM**: артефакт `artifacts/crm`, React+wouter админ-приложение оператора.
- **Triage_Category**: одна из пяти классификаций зависшего заказа: `no_result`, `awaiting_operator`, `no_payment`, `master_debt`, `abandoned_60d`. Категории НЕ взаимоисключающие — один заказ может попадать в несколько.
- **Active_Order**: заказ с `deletedAt IS NULL` И `status NOT IN ('cancelled')`.
- **Abandoned_60d**: Active_Order с `updatedAt < now() - 60 дней` И `status NOT IN ('completed')`.
- **Master_Debt**: значение `masters.debt`. Заказ попадает в категорию `master_debt`, когда у его мастера `debt >= Master_Debt_Threshold` (дефолт 5000 ₽).
- **Stuck_Order**: Active_Order, попавший хотя бы в одну Triage_Category.
- **Result_Nudge_Cooldown**: минимальный интервал между двумя ручными nudge по одному заказу. Дефолт 12 часов.

## Requirements

### Requirement 1 — Определение «результата» по заказу

**User Story:** Как оператор, я хочу единое определение «результата по заказу», чтобы мастер и я одинаково понимали, что именно он должен прислать.

#### Acceptance Criteria

1. THE System SHALL считать `Order_Result` присутствующим у заказа тогда и только тогда, когда `orders.proposedAmount` имеет числовое значение больше нуля И массив `orders.photosAfter` содержит не менее одного непустого URL.
2. WHEN мастер вызывает `POST /api/master-pwa/orders/:id/complete` без хотя бы одной записи в `orders.photosAfter` для этого заказа, THE Master_PWA_API SHALL вернуть HTTP 400 с кодом ошибки `result_photo_required` и не менять `status` заказа.
3. THE System SHALL при загрузке `Order_Result` для оператора возвращать поле `hasResult: boolean`, вычисленное по правилу из критерия 1, в каждом ответе `GET /api/orders` и `GET /api/orders/:id`.

#### Correctness Properties

- **Invariant**: для любого заказа `o` всегда выполняется `hasResult(o) == (Number(o.proposedAmount) > 0 && o.photosAfter.length >= 1)`.
- **Idempotence**: повторный вызов `POST /complete` с теми же параметрами для уже `completed` заказа НЕ изменяет `proposedAmount`, не дублирует строки в `photosAfter` и возвращает HTTP 200 с тем же `hasResult`.

---

### Requirement 2 — Полноэкранный Result_Banner в Master_PWA

**User Story:** Как мастер, я хочу видеть заметный экран с указанием конкретной заявки, по которой нужен результат, чтобы я не забыл прислать фото и сумму.

#### Acceptance Criteria

1. WHEN мастер открывает любой маршрут Master_PWA, требующий авторизации, И существует хотя бы один его Active_Order, удовлетворяющий условию Requirement 5 (no_result) или с непустым `orders.resultNudgedAt`, THE Master_PWA SHALL отрисовать Result_Banner поверх содержимого экрана до его закрытия пользователем.
2. THE Result_Banner SHALL содержать заголовок `Пришлите результат по заявке #N`, где `N` — `orders.leadId` если он не null, иначе `orders.id`.
3. THE Result_Banner SHALL содержать кнопку «Перейти к заявке», переходящую на `/orders/:id` Master_PWA, и кнопку «Закрыть», скрывающую банер на текущей сессии.
4. WHEN мастер нажимает «Закрыть», THE Master_PWA SHALL скрыть Result_Banner до следующей перезагрузки страницы или повторного входа в приложение, после чего банер снова появится, если условие из критерия 1 всё ещё выполняется.
5. WHERE у мастера несколько заказов, удовлетворяющих условию из критерия 1, THE Master_PWA SHALL показывать в Result_Banner заказ с самым ранним `coalesce(orders.resultNudgedAt, orders.assignedAt)`.
6. THE Master_PWA SHALL запрашивать список «требующих результата» заказов в составе ответа `GET /api/master-pwa/home` под ключом `resultRequiredOrders: { id, leadId, assignedAt, nudgedAt, reason }[]`.

#### Correctness Properties

- **Invariant**: Result_Banner виден тогда и только тогда, когда `resultRequiredOrders.length > 0` И пользователь не нажал «Закрыть» в этой сессии.
- **Determinism**: при одинаковом наборе заказов выбор «активного для банера» заказа всегда один и тот же (по правилу из критерия 5).

---

### Requirement 3 — Автоматическое срабатывание банера по возрасту

**User Story:** Как руководитель, я хочу, чтобы банер появлялся сам, без участия оператора, когда мастер задерживает результат, чтобы оператору не приходилось вручную напоминать каждому.

#### Acceptance Criteria

1. THE System SHALL включать заказ в `resultRequiredOrders`, когда `orders.deletedAt IS NULL` И `orders.status IN ('master_assigned', 'in_progress')` И `orders.masterId` равен идентификатору авторизованного мастера И `hasResult(orders)` равно `false` И `orders.assignedAt < now() - Auto_Nudge_Threshold`.
2. THE System SHALL хранить значение `Auto_Nudge_Threshold` в таблице `app_settings` под ключом `result_auto_nudge_days` с дефолтом `5` и допустимым диапазоном целых чисел от 1 до 60.
3. WHEN оператор обновляет `result_auto_nudge_days` через `PATCH /api/settings/result-nudge`, THE System SHALL применить новое значение ко всем последующим вычислениям `resultRequiredOrders` без перезапуска сервера.
4. IF `orders.assignedAt IS NULL`, THEN THE System SHALL использовать `orders.createdAt` как точку отсчёта порога `Auto_Nudge_Threshold`.

#### Correctness Properties

- **Monotonicity**: если заказ попал в `resultRequiredOrders` по причине `auto_age` в момент `t`, и его `proposedAmount`, `photosAfter` и `status` не менялись, то и в момент `t+1` он остаётся в `resultRequiredOrders` (возраст только растёт).
- **Threshold property**: для двух заказов с одинаковыми полями кроме `assignedAt`, более старый заказ попадает в выборку не позже более молодого.

---

### Requirement 4 — Ручной Operator_Nudge из CRM

**User Story:** Как оператор, я хочу одним кликом «толкнуть» мастера по конкретному заказу, даже если порог авто-нуджа ещё не достигнут, чтобы быстрее получить результат.

#### Acceptance Criteria

1. THE CRM SHALL отображать на каждой карточке заказа в Triage_Page кнопку «Запросить результат», доступную, когда `orders.masterId IS NOT NULL` И `hasResult(orders) == false`.
2. WHEN оператор нажимает «Запросить результат», THE CRM SHALL вызвать `POST /api/orders/:id/result-nudge` без тела.
3. WHEN `POST /api/orders/:id/result-nudge` вызван, И с момента предыдущего nudge по этому заказу прошло не меньше `Result_Nudge_Cooldown`, THE Order_API SHALL установить `orders.resultNudgedAt = now()`, отправить push-уведомление мастеру с типом `result_nudge` и текстом `Пришлите результат по заявке #N`, записать строку в `order_audit` с `action='result_nudged'`, и вернуть HTTP 200 с телом `{ ok: true, nudgedAt }`.
4. IF с момента предыдущего nudge по этому заказу прошло меньше `Result_Nudge_Cooldown`, THEN THE Order_API SHALL вернуть HTTP 429 с телом `{ error: 'nudge_cooldown', retryAfterSeconds: <секунд>, lastNudgedAt }` и не менять состояние заказа.
5. THE Order_API SHALL принимать `POST /api/orders/:id/result-nudge` только от ролей `admin`, `master_operator`, `lead_operator`.
6. WHEN `orders.resultNudgedAt` обновлён, THE System SHALL включать заказ в `resultRequiredOrders` для соответствующего мастера независимо от Auto_Nudge_Threshold.
7. WHEN мастер устанавливает `Order_Result` (через `complete` или загрузку фото «после») для заказа с непустым `resultNudgedAt`, THE Order_API SHALL обнулить `orders.resultNudgedAt` в той же транзакции.

#### Correctness Properties

- **Idempotence (semantic)**: вызов nudge внутри окна Cooldown не меняет состояние; повторный вызов после Cooldown устанавливает новое `nudgedAt`, но не дублирует push-уведомления (одно сообщение на один успешный вызов).
- **Inverse**: если перед nudge `hasResult == false` и `nudgedAt = T`, то после установки Order_Result `nudgedAt` обязан стать `null` (round-trip nudge → resolve).
- **Authorization invariant**: ни один вызов с ролью вне `admin/master_operator/lead_operator` не может изменить `resultNudgedAt`.

---

### Requirement 5 — Triage_Page: категория `no_result`

**User Story:** Как оператор, я хочу видеть на Triage_Page блок «Нет результата от мастера», чтобы быстро понять, по каким заказам мастер не прислал фото и сумму.

#### Acceptance Criteria

1. THE Triage_API SHALL включать заказ в категорию `no_result`, когда `orders.deletedAt IS NULL` И `orders.status IN ('master_assigned', 'in_progress')` И `orders.masterId IS NOT NULL` И `hasResult(orders) == false` И `coalesce(orders.assignedAt, orders.createdAt) < now() - Auto_Nudge_Threshold`.
2. THE Triage_API SHALL возвращать для каждого заказа в `no_result` поля `id`, `leadId`, `city`, `district`, `serviceType`, `masterId`, `masterAlias`, `assignedAt`, `daysSinceAssigned`, `lastNudgedAt`, `hasPhotosAfter`, `hasProposedAmount`.
3. THE Triage_Page SHALL сортировать карточки в `no_result` по убыванию `daysSinceAssigned`.
4. THE Triage_Page SHALL отображать на каждой карточке `no_result` кнопки `Запросить результат`, `Открыть заказ`, `Отменить заказ`.

#### Correctness Properties

- **Mutual consistency**: множество заказов в `no_result` совпадает с множеством заказов в `resultRequiredOrders` для соответствующего мастера, кроме случая `resultNudgedAt IS NOT NULL` И возраст < порога (ручной nudge показывает мастеру, но в `no_result` попадёт только при достижении порога).
- **Filter monotonicity**: если у заказа появляется хотя бы одна запись в `photosAfter` И `proposedAmount > 0`, заказ исчезает из `no_result` до следующего полного пересчёта.

---

### Requirement 6 — Triage_Page: категория `awaiting_operator`

**User Story:** Как оператор, я хочу видеть заказы, по которым мастер уже прислал сумму, но я ещё не подтвердил `orderAmount`, чтобы они не терялись среди завершённых.

#### Acceptance Criteria

1. THE Triage_API SHALL включать заказ в категорию `awaiting_operator`, когда `orders.deletedAt IS NULL` И `orders.status = 'completed'` И `orders.proposedAmount > 0` И `orders.orderAmount IS NULL` И `orders.completedAt < now() - 24 часа`.
2. THE Triage_Page SHALL отображать на карточке `awaiting_operator` сумму `proposedAmount`, имя мастера и кнопки `Принять сумму` (вызов `PATCH /api/orders/:id { acceptProposed: true }`), `Открыть заказ`, `Изменить сумму`.
3. THE Triage_API SHALL сортировать карточки `awaiting_operator` по возрастанию `completedAt` (самые «старые» висящие сверху).

#### Correctness Properties

- **Round-trip**: при успешном `acceptProposed: true` заказ исчезает из `awaiting_operator` И появляется (если `commissionPaid = false` и `completedAt + 7 дней < now()`) в `no_payment` через цикл агрегации.

---

### Requirement 7 — Triage_Page: категория `no_payment`

**User Story:** Как оператор, я хочу видеть заказы, где сумма уже подтверждена, но комиссия мастером не оплачена, чтобы понимать актуальный долг.

#### Acceptance Criteria

1. THE Triage_API SHALL включать заказ в категорию `no_payment`, когда `orders.deletedAt IS NULL` И `orders.status = 'completed'` И `orders.orderAmount > 0` И `orders.commissionPaid = false` И `orders.completedAt < now() - 7 дней`.
2. THE Triage_Page SHALL отображать на карточке `no_payment` ожидаемую сумму комиссии (через `calculateCommission(orderAmount, settings)`), имя мастера и кнопки `Открыть заказ`, `Написать мастеру`.

#### Correctness Properties

- **Idempotence**: пересчёт списка `no_payment` дважды подряд без изменений в `orders` и `transactions` возвращает идентичные множества заказов.

---

### Requirement 8 — Triage_Page: категория `master_debt`

**User Story:** Как оператор, я хочу отдельным блоком видеть мастеров с накопленным долгом, чтобы понимать, кто должен сколько и принять решение по нему.

#### Acceptance Criteria

1. THE Triage_API SHALL возвращать для категории `master_debt` агрегаты по мастеру: `masterId`, `masterAlias`, `city`, `debt`, `unpaidOrdersCount`, `oldestUnpaidOrderId`, `oldestUnpaidOrderCompletedAt`.
2. THE Triage_API SHALL включать мастера в `master_debt`, когда `masters.debt >= Master_Debt_Threshold` (дефолт 5000 ₽, конфигурируется в `app_settings.master_debt_threshold_rub`, диапазон 0..1000000) И `masters.deletedAt IS NULL`.
3. THE Triage_Page SHALL сортировать строки `master_debt` по убыванию `debt`.
4. THE Triage_Page SHALL отображать на строке `master_debt` кнопки `Открыть мастера` (master-drawer), `Написать мастеру`, `Заблокировать` (только для роли `admin`).

#### Correctness Properties

- **Sum invariant**: `unpaidOrdersCount` для каждого мастера в выборке равен количеству активных заказов того же мастера в категории `no_payment`.

---

### Requirement 9 — Triage_Page: категория `abandoned_60d`

**User Story:** Как оператор, я хочу одним списком видеть все заказы, которые висят без движения дольше 2 месяцев, чтобы зачистить их одним пакетом.

#### Acceptance Criteria

1. THE Triage_API SHALL включать заказ в категорию `abandoned_60d`, когда `orders.deletedAt IS NULL` И `orders.status NOT IN ('completed', 'cancelled')` И `orders.updatedAt < now() - 60 дней`.
2. THE Triage_Page SHALL отображать рядом с каждой карточкой `abandoned_60d` чек-бокс выбора и сводный счётчик `Выбрано: K`.
3. THE Triage_API SHALL принимать конфигурацию порога `abandoned_days_threshold` (дефолт 60, диапазон 14..365) через `app_settings`.

#### Correctness Properties

- **Disjointness with completed**: ни один заказ со `status = 'completed'` не может находиться в `abandoned_60d`.

---

### Requirement 10 — Bulk-отмена заказов из `abandoned_60d`

**User Story:** Как оператор, я хочу одним кликом отменить выбранные заброшенные заказы, чтобы освободить очередь без перехода в каждый из них.

#### Acceptance Criteria

1. THE Triage_API SHALL принимать `POST /api/triage/bulk-cancel` с телом `{ orderIds: number[], reason: string }`, доступный только ролям `admin`, `master_operator`.
2. THE Triage_API SHALL отклонять запрос с HTTP 400 и сообщением `not_abandoned: [ids]`, если хотя бы один из `orderIds` НЕ удовлетворяет условию из Requirement 9 на момент обработки.
3. WHEN запрос валиден, THE Triage_API SHALL для каждого `orderId` в одной транзакции установить `orders.status = 'cancelled'`, `orders.cancelType = 'abandoned'`, `orders.cancelReason = reason`, `orders.updatedAt = now()`, записать строку в `order_audit` с `action='bulk_cancel_abandoned'`, и (если `masterId IS NOT NULL`) уменьшить рейтинг через `recordOrderCancelled` для соответствующего мастера.
4. THE Triage_API SHALL вернуть HTTP 200 с телом `{ cancelledIds: number[], skippedIds: number[] }`.
5. THE Triage_Page SHALL запрашивать у оператора подтверждение модальным диалогом перед вызовом `bulk-cancel` и показывать в нём количество заказов и текст причины (минимум 5 символов, не более 500).

#### Correctness Properties

- **Atomicity**: либо все заказы из валидного запроса переходят в `cancelled`, либо ни один (при ошибке БД).
- **Idempotence**: повторный вызов `bulk-cancel` с тем же набором `orderIds` после успеха возвращает `cancelledIds: []` и `skippedIds: <все>`, состояние БД не меняется.
- **Audit completeness**: `count(order_audit where action='bulk_cancel_abandoned' for batch B) == |cancelledIds|` для каждого успешного батча `B`.

---

### Requirement 11 — Triage_Page: единая загрузка и счётчик в навигации

**User Story:** Как оператор, я хочу видеть на главной навигации число «зависших» заказов, чтобы понять, нужна ли мне страница триажа сейчас.

#### Acceptance Criteria

1. THE Triage_API SHALL предоставлять `GET /api/triage` для ролей `admin`, `master_operator`, `lead_operator`, возвращая структуру `{ no_result: Item[], awaiting_operator: Item[], no_payment: Item[], master_debt: MasterRow[], abandoned_60d: Item[], counts: { no_result, awaiting_operator, no_payment, master_debt, abandoned_60d, total } }`.
2. THE Triage_API SHALL кэшировать результат `GET /api/triage` в памяти на 30 секунд для конкретного процесса и инвалидировать кэш при `POST /api/orders/:id/result-nudge`, `POST /api/triage/bulk-cancel`, `PATCH /api/orders/:id` с изменением `status`, `orderAmount`, `proposedAmount` или `commissionPaid`.
3. THE CRM SHALL показывать в боковом меню рядом с пунктом «Триаж» бейдж со значением `counts.total`, окрашенный в красный, если `counts.total > 0`, и скрытый, если `counts.total == 0`.
4. THE Triage_Page SHALL принимать query-параметр `?city=` для фильтрации всех категорий по полю `city` И query-параметр `?masterId=` для фильтрации по мастеру.

#### Correctness Properties

- **Sum consistency**: `counts.total == counts.no_result + counts.awaiting_operator + counts.no_payment + counts.abandoned_60d` (master_debt не суммируется в total, это агрегат по мастерам, а не по заказам).
- **Filter consistency**: при `?city=X` каждый заказ во всех категориях ответа удовлетворяет `order.city == X`.

---

### Requirement 12 — Эндпоинт `result-nudge` и схема БД

**User Story:** Как разработчик, я хочу новые поля и эндпоинт были описаны заранее, чтобы миграция и интеграция прошли без сюрпризов.

#### Acceptance Criteria

1. THE Schema SHALL добавить колонку `orders.result_nudged_at TIMESTAMP NULL` миграцией `add-result-nudged-at`.
2. THE Schema SHALL добавить колонку `orders.result_nudge_count INTEGER NOT NULL DEFAULT 0` той же миграцией.
3. WHEN `POST /api/orders/:id/result-nudge` успешно завершён вне Cooldown, THE Order_API SHALL увеличить `orders.result_nudge_count` на 1 в той же транзакции, что и `result_nudged_at`.
4. THE Schema SHALL добавить ключи `app_settings.result_auto_nudge_days`, `app_settings.master_debt_threshold_rub`, `app_settings.abandoned_days_threshold`, `app_settings.result_nudge_cooldown_hours` с дефолтами `5`, `5000`, `60`, `12` соответственно через идемпотентный seed.
5. WHEN заказ переведён в `cancelled` или `completed` с установленным `Order_Result`, THE Order_API SHALL сбросить `orders.result_nudged_at = NULL` в той же транзакции (но не сбрасывать `result_nudge_count`).

#### Correctness Properties

- **Counter monotonicity**: `result_nudge_count` строго не убывает в течение жизни заказа.
- **Reset invariant**: если заказ имеет `status IN ('completed','cancelled')`, то `result_nudged_at IS NULL` после любой завершённой транзакции изменения статуса.
