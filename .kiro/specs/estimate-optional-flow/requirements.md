# Requirements Document

## Introduction

В CRM исторически вся бизнес-логика вокруг "денежной части" заказа построена на сущности `receipts` (смета): пока мастер не создал смету, считается, что в заказе нет суммы — и система генерирует уведомления, эскалации и баннеры "Без сметы". На практике значительная часть мастеров смету не составляет: они согласовывают сумму устно с клиентом, сообщают её оператору по телефону, оператор записывает "договорились на N рублей", и от этой суммы дальше считается комиссия (или удерживаются токены).

Эта фича делает сценарий "договорённость без сметы" полноправным наряду со сценарием со сметой. Обе ветки приводят к одному и тому же состоянию заказа ("сумма зафиксирована" → "комиссия рассчитана/оплачена"), и одни и те же правила уведомлений/эскалаций/баннеров. Существующий flow со сметой ломаться не должен — для тех мастеров, кто её создаёт, всё продолжает работать как сейчас.

Главная цель — устранить рассинхронизацию между фактическим состоянием заказа (сумма уже согласована и/или комиссия уже удержана) и тем, что показывает CRM/бот (по-прежнему висит "нет сметы").

## Glossary

- **Order**: запись в таблице `orders`, хранящая поля `orderAmount`, `proposedAmount`, `commission`, `commissionPaid`, `paymentModel`, `tokensCharged`, `manualTokenCost`, `status`.
- **Receipt**: запись в таблице `receipts`; создаётся мастером в Master_PWA. Содержит `lineItems`, `totalAmount`, `prepaymentAmount`, `prepaymentSubmittedAt`, `prepaymentSeenAt`, `prepaymentPaidAt`.
- **Master**: исполнитель заказа. Может создавать Receipt в Master_PWA, либо просто согласовывать сумму с клиентом устно и сообщать её Operator.
- **Operator**: пользователь CRM, ведёт заказ. Принимает звонки от Master, фиксирует согласованную сумму, подтверждает предоплату, закрывает заказ.
- **Manager**: пользователь CRM с расширенными правами; может корректировать поля, недоступные Operator.
- **Master_PWA**: фронтенд для мастера (`artifacts/master-pwa`).
- **CRM**: фронтенд для оператора/менеджера (`artifacts/crm`).
- **API_Server**: бэкенд (`artifacts/api-server`, Express + Drizzle).
- **Manager_Bot**: бот для оператора/менеджера (`managerBot.ts`).
- **Max_Bot**: бот для мастера (`maxBot.ts`).
- **Notification_Engine**: совокупность модулей уведомлений и напоминаний — `lib/operatorPush.ts`, `lib/operatorTasks.ts`, `lib/tasksEscalation.ts`, `lib/dispatcherAI.ts`, `lib/checkinBroadcast.ts`, плюс баннеры на страницах CRM (`OrdersBanners`, work-board).
- **Commission_Engine**: модуль `lib/commission.ts`, рассчитывает комиссию по тарифной сетке.
- **Token_Wallet**: модуль `lib/tokenWallet.ts`, удерживает/возвращает токены мастера в `paymentModel = "token"`.
- **Agreement_Path**: путь, в котором сумма заказа фиксируется Operator со слов Master, без создания Receipt.
- **Receipt_Path**: путь, в котором Master создаёт Receipt, и сумма берётся из Receipt.
- **Agreement_Amount**: сумма, которую Operator фиксирует на заказе со слов Master в Agreement_Path. Хранится на Order.
- **Payment_State**: высокоуровневое состояние "денежной части" заказа, единственное на Order, выводимое из данных. Принимает значения: `no_amount`, `agreed`, `paid`, `cancelled`. (См. Requirement 1 для точных правил вывода.)
- **Closing_Drawer**: компонент CRM `components/orders/ClosingDrawer.tsx`, в котором Operator закрывает заказ (фиксирует сумму, комиссию, оплату).
- **Legacy_No_Estimate_Signal**: любая существующая логика, которая трактует отсутствие Receipt как проблему (баннер "Без сметы более 48 часов", задача оператора "нет сметы", DispatcherAI-эскалация, рассылка через Max_Bot/Manager_Bot, чек-ин-broadcast).

## Requirements

### Requirement 1: Единое состояние оплаты для заказа (Payment_State)

**User Story:** Как Operator, я хочу видеть на каждом заказе одно понятное "состояние оплаты", из которого однозначно понятно, нужно ли что-то делать, чтобы не путаться между Receipt, `orderAmount`, `proposedAmount`, `commissionPaid`.

#### Acceptance Criteria

1. THE API_Server SHALL вычислять Payment_State для каждого Order по следующим правилам, проверяемым в перечисленном порядке:
   - IF Order.status = `cancelled`, THEN Payment_State = `cancelled`.
   - IF Order.commissionPaid = true OR Order имеет хотя бы одну Receipt с `prepaymentPaidAt` IS NOT NULL, THEN Payment_State = `paid`.
   - IF Order.orderAmount > 0 OR Order имеет хотя бы одну Receipt с `prepaymentAmount` > 0, THEN Payment_State = `agreed`.
   - ELSE Payment_State = `no_amount`.
2. THE API_Server SHALL возвращать Payment_State в ответах эндпоинтов, использующихся CRM для списка заказов и карточки заказа (`/orders`, `/work-board`, `/work-board-table`, `/leads`).
3. WHEN значение Payment_State меняется, THE API_Server SHALL пересчитать его атомарно в той же транзакции, что и вызвавшее изменение операцию (запись Agreement_Amount, создание Receipt, подтверждение оплаты, отмена заказа).
4. THE CRM SHALL отображать Payment_State одним бейджем в карточке Order и в столбце таблицы заказов с фиксированным набором меток: `no_amount` → "Сумма не зафиксирована", `agreed` → "Сумма согласована", `paid` → "Оплачено", `cancelled` → "Отменён".
5. IF Payment_State не может быть однозначно вычислен из-за противоречивых данных (см. Requirement 4), THEN THE API_Server SHALL вернуть Payment_State = `agreed` и записать предупреждение в лог с `orderId`.

### Requirement 2: Operator фиксирует согласованную сумму без сметы (Agreement_Path)

**User Story:** Как Operator, я хочу зафиксировать на заказе сумму, на которую Master устно договорился с клиентом, без создания фейковой Receipt, чтобы дальше всё (комиссия, токены, уведомления) работало одинаково с Receipt-сценарием.

#### Acceptance Criteria

1. THE CRM SHALL предоставлять Operator действие "Зафиксировать согласованную сумму" в Closing_Drawer для любого Order в статусе, отличном от `cancelled` и `completed`.
2. WHEN Operator подтверждает действие "Зафиксировать согласованную сумму" с числовым значением N, THE API_Server SHALL установить `Order.orderAmount = N` и записать audit-событие с полями `orderId`, `operatorId`, `previousAmount`, `newAmount`, `source = "agreement"`, `timestamp`.
3. THE API_Server SHALL принимать Agreement_Amount при условии N > 0. Жёсткой верхней границы нет. WHEN N > 1 000 000 ₽, THE CRM SHALL показать неблокирующее предупреждение "необычно большая сумма, перепроверьте"; Operator может всё равно сохранить.
4. IF Operator вводит Agreement_Amount = 0 или отрицательное значение, THEN THE API_Server SHALL вернуть ошибку валидации без изменения Order.
5. WHEN Agreement_Amount успешно зафиксирован, THE API_Server SHALL пересчитать комиссию (см. Requirement 7 и 8) и обновить Payment_State до `agreed`.
6. THE CRM SHALL не требовать создания Receipt как обязательного шага для перехода Order в Payment_State = `agreed`.

### Requirement 3: Receipt_Path продолжает работать без изменений в наблюдаемом поведении

**User Story:** Как Master, использующий Master_PWA для составления сметы, я хочу, чтобы существующий сценарий со сметой продолжал работать ровно как сейчас, без новых обязательных полей и шагов.

#### Acceptance Criteria

1. THE Master_PWA SHALL позволять Master создавать Receipt с теми же полями, что сейчас (`lineItems`, `totalAmount`, `prepaymentAmount`).
2. WHEN Master создаёт Receipt с `prepaymentAmount` > 0, THE API_Server SHALL переводить Payment_State Order в `agreed` без участия Operator.
3. WHEN Operator подтверждает предоплату по Receipt (`prepaymentSeenAt` устанавливается), THE API_Server SHALL установить `Order.orderAmount` равным `Receipt.prepaymentAmount`, если `Order.orderAmount` ещё не задан, и не должен переписывать `Order.orderAmount`, если он уже установлен в Agreement_Path.
4. WHEN Receipt получает `prepaymentPaidAt`, THE API_Server SHALL переводить Payment_State Order в `paid`.
5. THE расчёты комиссии и токенов в Receipt_Path SHALL давать те же результаты для одной и той же суммы, что и в Agreement_Path (см. Requirement 7 и 8).

### Requirement 4: Конфликт между Agreement_Path и Receipt_Path

**User Story:** Как Operator, я хочу понимать, что произойдёт, если по заказу одновременно есть и зафиксированная Operator сумма, и Receipt от Master, чтобы не было двойного учёта или потерянных данных.

#### Acceptance Criteria

1. IF Operator зафиксировал Agreement_Amount, и затем Master создаёт Receipt с `prepaymentAmount` ≠ Agreement_Amount, THEN THE API_Server SHALL сохранить обе записи и поднять задачу оператору типа `reconcile_amount` с обеими суммами.
2. WHILE существует неразрешённая задача `reconcile_amount` для Order, THE CRM SHALL показывать на карточке заказа предупреждение "Сумма из сметы (X) не совпадает с согласованной (Y)" и предлагать действия "Использовать сумму из сметы" и "Оставить согласованную сумму".
3. WHEN Operator выбирает одно из действий разрешения конфликта, THE API_Server SHALL установить `Order.orderAmount` в выбранную сумму, пересчитать комиссию и закрыть задачу `reconcile_amount`.
4. IF Master создаёт Receipt с `prepaymentAmount` = Agreement_Amount, THEN THE API_Server SHALL не создавать задачу `reconcile_amount` и считать Receipt подтверждением Agreement_Amount.
5. THE API_Server SHALL не удалять и не перезаписывать Receipt, созданную Master, при фиксации Agreement_Amount Operator-ом.

### Requirement 5: Изменение Agreement_Amount и audit trail

**User Story:** Как Manager, я хочу видеть историю изменений суммы по заказу, чтобы расследовать спорные ситуации (мастер сказал одну сумму, потом другую, оператор перепутал).

#### Acceptance Criteria

1. THE API_Server SHALL хранить полный audit-журнал изменений `Order.orderAmount`, `Order.commission`, `Order.commissionPaid` с полями `orderId`, `actorId`, `actorRole`, `field`, `previousValue`, `newValue`, `source`, `timestamp`.
2. WHILE Payment_State = `agreed`, THE CRM SHALL разрешать Operator изменять Agreement_Amount через Closing_Drawer.
3. WHILE Payment_State = `paid`, THE CRM SHALL запрещать Operator изменять Agreement_Amount, и SHALL разрешать Manager изменять Agreement_Amount только с обязательным заполнением поля "Причина".
4. WHEN Agreement_Amount изменяется в состоянии `paid`, THE API_Server SHALL пересчитать комиссию и записать audit-событие с `source = "manager_correction"` и текстом причины.
5. THE CRM SHALL отображать историю изменений суммы и комиссии в Closing_Drawer (или связанной панели), доступной Manager.

### Requirement 6: Подавление Legacy_No_Estimate_Signal при Payment_State ∈ {agreed, paid}

**User Story:** Как Operator, я хочу, чтобы система перестала слать мне напоминания "Без сметы более 48 часов", "нет сметы", и не показывала соответствующие баннеры, как только сумма зафиксирована (любым способом) или комиссия уже оплачена.

#### Acceptance Criteria

1. WHILE Payment_State Order ∈ {`agreed`, `paid`, `cancelled`}, THE Notification_Engine SHALL не генерировать новые задачи оператора с типом `no_estimate` для этого Order.
2. WHEN Payment_State Order переходит в `agreed`, `paid` или `cancelled`, THE Notification_Engine SHALL автоматически закрывать существующие открытые задачи оператора типа `no_estimate` для этого Order с пометкой "решено: сумма зафиксирована" / "решено: оплачено" / "решено: заказ отменён".
3. WHILE Payment_State Order ∈ {`agreed`, `paid`}, THE work-board (`routes/work-board.ts`, `routes/work-board-table.ts`) SHALL не помечать Order как "Без сметы более 48 часов".
4. WHILE Payment_State Order ∈ {`agreed`, `paid`}, THE CRM (`OrdersBanners`) SHALL не показывать баннер "нет сметы" для этого Order.
5. WHILE Payment_State Order ∈ {`agreed`, `paid`}, THE Max_Bot SHALL не отправлять Master напоминания о необходимости создать смету по этому Order.
6. WHILE Payment_State Order ∈ {`agreed`, `paid`}, THE Manager_Bot SHALL не отправлять Manager уведомления о "просроченной смете" по этому Order.
7. THE DispatcherAI (`lib/dispatcherAI.ts`) SHALL не учитывать отсутствие Receipt как сигнал проблемы для Order, у которого Payment_State ∈ {`agreed`, `paid`}.
8. THE Checkin_Broadcast (`lib/checkinBroadcast.ts`) SHALL не запрашивать у Master чек-ин по факту "нет сметы" для Order, у которого Payment_State ∈ {`agreed`, `paid`}.
9. WHILE Payment_State Order = `no_amount`, THE Notification_Engine SHALL продолжать работать как сейчас (текущие задачи и эскалации сохраняются по умолчанию).

### Requirement 7: Расчёт комиссии в `paymentModel = "commission"`

**User Story:** Как Operator, я хочу, чтобы комиссия по заказу с зафиксированной согласованной суммой считалась так же, как по заказу со сметой, без специальных оговорок.

#### Acceptance Criteria

1. WHERE `Order.paymentModel = "commission"` AND Payment_State ∈ {`agreed`, `paid`}, THE Commission_Engine SHALL рассчитывать `Order.commission` через `calculateCommission(Order.orderAmount, settings)` (модуль `lib/commission.ts`), независимо от того, был ли создан Receipt.
2. WHEN `Order.orderAmount` меняется (Agreement_Path или Receipt_Path), THE Commission_Engine SHALL пересчитывать `Order.commission` в той же транзакции.
3. WHILE `Order.commissionPaid = true`, THE API_Server SHALL не пересчитывать `Order.commission` автоматически (только Manager-correction по Requirement 5.4).
4. THE Commission_Engine SHALL давать одинаковое значение `commission` для одного и того же `orderAmount`, независимо от того, пришёл ли он из Receipt или из Agreement.

### Requirement 8: Удержание токенов в `paymentModel = "token"`

**User Story:** Как Master с тарификацией по токенам, я хочу, чтобы списание токенов происходило корректно и однократно, независимо от того, создал я смету или просто согласовал сумму с оператором.

#### Acceptance Criteria

1. WHERE `Order.paymentModel = "token"`, THE Token_Wallet SHALL списывать токены с Master ровно один раз на жизненный цикл Order.
2. WHEN Payment_State Order впервые переходит в `agreed` (через Agreement_Path или Receipt_Path), THE Token_Wallet SHALL списать токены через тот же codepath, что и сейчас выполняется при `acceptProposed` / прямом установлении `orderAmount` в `routes/orders.ts`: количество = `Order.manualTokenCost` если задан, иначе авто-расчёт по существующей формуле. Записать `Order.tokensCharged`.
3. IF `Order.tokensCharged` уже > 0, THEN THE Token_Wallet SHALL не списывать токены повторно при дальнейших изменениях суммы.
4. WHEN `Order.orderAmount` меняется в состоянии `agreed`, THE Token_Wallet SHALL не корректировать `Order.tokensCharged` автоматически. Manager может скорректировать кошелёк мастера вручную через существующие инструменты `accountBalance.ts`.
5. IF Order переходит в `cancelled` ДО того, как Payment_State успел стать `paid`, THEN THE Token_Wallet SHALL вернуть Master списанные токены, если они были списаны (см. также Requirement 12).

### Requirement 9: Единый Closing_Drawer для обоих путей

**User Story:** Как Operator, я хочу один и тот же интерфейс закрытия заказа независимо от того, есть ли смета, чтобы не запоминать два разных сценария.

#### Acceptance Criteria

1. THE Closing_Drawer SHALL отображать текущее Payment_State и текущее значение `Order.orderAmount`.
2. WHERE Order имеет связанный Receipt, THE Closing_Drawer SHALL показывать ссылку/превью Receipt и поле `prepaymentAmount` рядом с Agreement_Amount.
3. THE Closing_Drawer SHALL предоставлять одну форму с полями: сумма заказа, комиссия (read-only, рассчитывается автоматически), флаг "оплачено".
4. WHEN Operator меняет сумму заказа в Closing_Drawer, THE CRM SHALL немедленно показать пересчитанное значение комиссии до сохранения.
5. WHEN Operator нажимает "Сохранить" в Closing_Drawer, THE API_Server SHALL применить изменения атомарно (сумма, комиссия, флаг оплаты, Payment_State).
6. THE Closing_Drawer SHALL быть доступен из тех же мест CRM, где он доступен сейчас (как минимум: страница заказов, work-board, страница leads вкладка "В работе").

### Requirement 10: Баннеры и индикаторы в CRM

**User Story:** Как Operator, я хочу видеть на доске заказов чёткое разделение "сумма не зафиксирована" vs "сумма зафиксирована" vs "оплачено", чтобы быстро находить заказы, требующие моего действия.

#### Acceptance Criteria

1. THE CRM SHALL показывать в `OrdersBanners` отдельный баннер для Order с Payment_State = `no_amount` и возрастом > 48 часов.
2. THE CRM SHALL не показывать баннер "Без сметы" для Order с Payment_State ∈ {`agreed`, `paid`}.
3. THE CRM SHALL показывать в столбце таблицы заказов (`work-board-table`) бейдж Payment_State для каждого Order.
4. THE CRM SHALL предоставлять фильтр заказов по Payment_State в списке заказов.

### Requirement 11: Права доступа

**User Story:** Как владелец продукта, я хочу контролировать, кто может фиксировать и менять Agreement_Amount, чтобы исключить злоупотребления.

#### Acceptance Criteria

1. THE API_Server SHALL разрешать Operator и Manager устанавливать Agreement_Amount.
2. THE API_Server SHALL разрешать Operator устанавливать `Order.commissionPaid = true` только при наличии транзакции с `paymentStatus = paid` ИЛИ суммы `partial_payments`, покрывающей комиссию. THE API_Server SHALL разрешать Manager форсированно устанавливать `Order.commissionPaid = true` без подтверждения оплаты при условии заполненного поля "Reason" (audit-event с `source = "manager_force_paid"`).
3. THE API_Server SHALL разрешать только Manager изменять Agreement_Amount после перехода Payment_State в `paid` (см. Requirement 5.3).
4. IF пользователь без необходимой роли пытается выполнить запрещённую операцию, THEN THE API_Server SHALL вернуть ответ 403 без изменения данных.

### Requirement 12: Отмена заказа

**User Story:** Как Operator, я хочу корректной обработки отмены заказа в любом Payment_State, чтобы не оставались "висящие" комиссии и токены.

#### Acceptance Criteria

1. WHEN Order переходит в `cancelled`, THE API_Server SHALL установить Payment_State = `cancelled`.
2. WHEN Order переходит в `cancelled` из Payment_State = `agreed` AND `Order.commissionPaid = false`, THE API_Server SHALL обнулить `Order.commission` и не списывать комиссию.
3. WHEN Order переходит в `cancelled` из Payment_State = `paid`, THE API_Server SHALL не возвращать комиссию автоматически. Manager принимает решение вручную через существующие инструменты finance/balance; в audit-логе фиксируется отмена, но `transactions.paymentStatus` не откатывается без явного действия Manager.
4. WHERE `Order.paymentModel = "token"` AND Order переходит в `cancelled` AND `Order.tokensCharged` > 0 AND Payment_State не был `paid`, THE Token_Wallet SHALL вернуть `Order.tokensCharged` токенов Master и сбросить `Order.tokensCharged` в 0.
5. WHEN Order переходит в `cancelled`, THE Notification_Engine SHALL закрыть все открытые задачи оператора, связанные с этим Order.

### Requirement 13: Частичная оплата (`prepaymentAmount` < `totalAmount`)

**User Story:** Как Operator, работающий со сметой, где есть и предоплата, и итоговая сумма, я хочу, чтобы Payment_State учитывал оба этапа, и чтобы Agreement_Path не мешал работе с такими сметами.

#### Acceptance Criteria

1. WHERE Receipt имеет `prepaymentAmount` < `totalAmount`, THE API_Server SHALL переводить Payment_State в `agreed`, как только установлен `prepaymentSeenAt`, и в `paid` ИЛИ когда у всех Receipt по заказу установлено `prepaymentPaidAt` (или эквивалентное `prepaymentSeenAt + commissionPaid = true` для существующей схемы), ИЛИ когда Operator/Manager явно ставит `commissionPaid = true` в Closing_Drawer.
2. THE Agreement_Path SHALL не поддерживать понятие "частичной оплаты" в v1: Agreement_Amount фиксируется как одна сумма, и Payment_State идёт `no_amount` → `agreed` → `paid`. Если возникнет потребность в поэтапной оплате — Master составляет Receipt (Receipt_Path), либо используются записи `transaction_payments` (существующий механизм).
3. WHEN Operator подтверждает оплату по Order в Agreement_Path, THE API_Server SHALL установить `Order.commissionPaid = true` и Payment_State = `paid` без обращения к Receipt.

### Requirement 14: Уведомления Master и Manager в Agreement_Path

**User Story:** Как Master, который договорился устно, я хочу понимать, что оператор зафиксировал согласованную сумму, и не получать спам "пришли смету".

#### Acceptance Criteria

1. WHEN Agreement_Amount успешно зафиксирован Operator, THE Max_Bot SHALL отправить Master сообщение "Оператор зафиксировал согласованную сумму N руб. по заказу #ID".
2. WHILE Payment_State Order ∈ {`agreed`, `paid`}, THE Max_Bot SHALL не отправлять Master напоминания "создайте смету" по этому Order (см. также Requirement 6.5).
3. WHEN Payment_State Order переходит в `paid`, THE Max_Bot SHALL отправить Master сообщение о том, что заказ закрыт, с финальной суммой и удержанной комиссией/токенами.
4. WHEN возникает задача `reconcile_amount` (см. Requirement 4), THE Manager_Bot SHALL уведомить Manager о расхождении сумм.

### Requirement 15: KPI и отчётность

**User Story:** Как владелец продукта, я хочу видеть, какая доля заказов закрывается через Agreement_Path vs Receipt_Path, чтобы понимать поведение мастеров.

#### Acceptance Criteria

1. THE API_Server SHALL хранить на Order признак "источника финального `orderAmount`" со значениями `agreement`, `receipt`, `unknown` (для исторических заказов).
2. THE CRM (analytics) SHALL предоставлять отчёт за период с разбивкой количества и суммы заказов по `источник финального orderAmount` и по Payment_State.
3. THE API_Server SHALL логировать время перехода Payment_State (timestamp каждого перехода) для последующего анализа TTR (time-to-agreed, time-to-paid).

## Decisions

Все open questions закрыты. Значения ниже считаются обязательной частью requirements.

**Q1. Лейблы Payment_State в UI.**
- `no_amount` → "Сумма не зафиксирована"
- `agreed` → "Сумма согласована"
- `paid` → "Оплачено"
- `cancelled` → "Отменён"

**Q2. Верхняя граница Agreement_Amount.**
Жёсткой верхней границы нет; единственная валидация — N > 0. ЕСЛИ N > 1 000 000 ₽, THEN CRM SHALL показать неблокирующее предупреждение «необычно большая сумма, перепроверьте» — Operator может всё равно сохранить.

**Q3. Порог "сумма не зафиксирована слишком долго".**
48 часов (как сейчас). Триггер — `Payment_State = no_amount AND age(order) > 48h`. Применяется во всех 5 каналах (см. секцию problems в исследовании).

**Q4. Правило списания токенов в Agreement_Path.**
Используется существующая логика, которая уже работает в `routes/orders.ts` при `acceptProposed`/прямом установлении `orderAmount`: списание из кошелька мастера происходит при первом переходе в `Payment_State = agreed`, объём — `Order.manualTokenCost` если задан, иначе авто-расчёт по текущей формуле. Никакой новой формулы Agreement_Path не вводит — он использует тот же codepath, просто триггерится из новой кнопки.

**Q5. Пересчёт токенов при изменении Agreement_Amount.**
Не делается автоматически. Manager может скорректировать кошелёк мастера вручную через существующие инструменты `accountBalance.ts`, если бизнес считает нужным.

**Q6. Возврат комиссии при отмене после оплаты.**
Автоматического возврата нет. Manager решает в каждом случае и оформляет вручную через существующие инструменты finance/balance. В audit-логе фиксируется отмена, но `transactions.paymentStatus` не откатывается без явного действия Manager.

**Q7. Кто может ставить `commissionPaid = true`.**
- Operator: только при наличии подтверждения оплаты — существующая транзакция с `paymentStatus = paid` ИЛИ `partial_payments` суммарно покрывают комиссию. В UI флаг включён автоматически когда условие выполнено; ручной toggle Operator работает только при выполнении условия.
- Manager: может форсированно поставить `commissionPaid = true` без подтверждения оплаты, обязательно с указанием причины (поле "Reason" в Closing_Drawer); audit-event с `source = "manager_force_paid"`.

**Q8. Условие закрытия заказа со сметой при `prepaymentAmount` < `totalAmount`.**
`Payment_State = paid` достигается ИЛИ когда у всех Receipt по заказу установлено `prepaymentPaidAt` (если такое поле существует — иначе через `prepaymentSeenAt` + `commissionPaid = true`), ИЛИ когда Operator/Manager явно ставит `commissionPaid = true` в Closing_Drawer. Это даёт CRM возможность закрыть «частично-оплаченные сметы», не дожидаясь полной оплаты по смете.

**Q9. Частичная оплата в Agreement_Path.**
Не поддерживается в v1. Agreement_Amount — одна сумма. Если возникнет потребность в поэтапной оплате — мастер составляет Receipt (Receipt_Path) либо создаются записи `transaction_payments` (существующий механизм частичных оплат комиссии).

**Q10. Что показывать Master и клиенту.**
- Master в Master_PWA видит только финальное состояние: "сумма X зафиксирована", "оплачено / не оплачено". Различие Agreement_Path vs Receipt_Path не отображается.
- Клиент (публичная страница `/api/receipt/:token`) — без изменений; отображается только если по заказу есть Receipt.

**Q11. Поведение исторических заказов.**
Без миграции данных. Все исторические заказы получают `agreement_amount_source = unknown`, и Payment_State вычисляется по тем же правилам (Requirement 1). Заказы с `orderAmount > 0` сразу становятся `agreed` (или `paid`, если выполнены условия) — спам-каналы автоматически перестают по ним стрелять после фазы 2.

**Q12. Обязательность комментария при фиксации Agreement_Amount.**
В v1 опционально. В Closing_Drawer — поле "Источник" (selector: "Со слов мастера" / "По чату с клиентом" / "Другое") + свободный комментарий. Заполнение не блокирует сохранение. В audit-логе сохраняется выбранный источник.

**Q13. Реакция на `proposedAmount` от Master.**
В CRM на карточке заказа доступна кнопка "Принять предложение мастера" одним кликом, которая выполняет Agreement_Path с `agreement_amount_source = "master_proposal"`. Operator может также ввести другую сумму вручную (Agreement_Path с `source = "agreement"`).

**Q14. Совместная работа Receipt и Agreement.**
Operator-override Receipt-суммы — это Agreement_Path (Requirement 4 описывает поведение). При явном override Operator (нажал "Использовать согласованную сумму") задача `reconcile_amount` НЕ создаётся, потому что конфликт уже разрешён действием Operator. Если же Receipt появляется ПОСЛЕ Agreement_Amount и не совпадает, `reconcile_amount` создаётся (Requirement 4.1).

**Q15. Тип задачи `reconcile_amount`.**
Создаётся как отдельная задача в `lib/operatorTasks.ts` и появляется в дашборде `dashboard-action-items.ts` + в `OrdersBanners` на карточке заказа. Задача переходит в `critical` через 30 минут (стандартный SLA по аналогии с `confirm_prepayment`).

## Implementation Phases

Реализация разбита на 3 поэтапные фазы. Каждая фаза самодостаточна и может быть задеплоена отдельно. Фазы 2 и 3 управляются feature-flag'ами в `system_settings`, чтобы можно было откатить без деплоя.

### Phase 1 — Read-only Payment_State (без изменений в поведении)

**Цель**: ввести единое поле `Payment_State` и сделать его наблюдаемым, не меняя ни одного канала уведомлений.

**Изменения**:
- Миграция БД (через `drizzle-kit generate`):
  - `orders` ← `agreement_amount_source` ENUM `'agreement' | 'master_proposal' | 'receipt' | 'manager_correction' | 'unknown'` DEFAULT `'unknown'`
  - `orders` ← `payment_state_changed_at` TIMESTAMP NULL
  - `orders` ← `agreement_note` TEXT NULL (короткий комментарий-источник)
  - Новая таблица `order_amount_audit` (orderId, actorId, actorRole, field, previousValue, newValue, source, reason, createdAt)
- API:
  - `lib/paymentState.ts` — pure-функция `computePaymentState(order, receipts): PaymentState`
  - В ответе `GET /api/orders`, `GET /api/work-board*`, `GET /api/orders/:id` добавить поле `paymentState: 'no_amount' | 'agreed' | 'paid' | 'cancelled'`
- CRM:
  - Бейдж Payment_State в `OrderPanel`, `OrdersWorkspace`, `work-board-table` — только отображение, рядом с существующими полями (не вместо)

**Acceptance Phase 1**:
- THE API_Server SHALL возвращать корректный `paymentState` во всех order-эндпоинтах для всех существующих заказов (включая исторические).
- THE CRM SHALL отображать бейдж Payment_State без удаления старых индикаторов.
- THE Notification_Engine SHALL не менять поведение (никакие пороги/сценарии не трогаем).

**Риски**: минимальные. Только добавление, без изменения существующих условий.

### Phase 2 — Agreement_Path + подавление Legacy_No_Estimate_Signal

**Цель**: запустить путь "оператор фиксирует сумму со слов мастера" и заглушить шум по заказам с зафиксированной суммой.

**Управление**: feature-flag `payment_state_engine_enabled` в `system_settings` (по умолчанию `false`; включается после прохождения тестов).

**Изменения**:
- API:
  - `POST /api/orders/:id/agreement { amount, source, note }` — атомарно: записать `orderAmount`, `agreement_amount_source`, `agreement_note`, пересчитать `commission` (если `paymentModel = "commission"`), вызвать существующую логику списания токенов (если `paymentModel = "token"`), записать audit, перевести `paymentState`, вызвать `notifyWorkBoardChanged()`, отправить MAX мастеру
  - `routes/orders.ts PATCH /:id` — оборачиваем существующее изменение `orderAmount` в audit-запись, считаем `paymentState` атомарно
  - `lib/operatorTasks.ts` — новый тип task `reconcile_amount` (Requirement 4); существующие `no_estimate` для `paymentState ∈ {agreed, paid, cancelled}` фильтруются на уровне SQL
  - `routes/dashboard-action-items.ts` — фильтр `no_estimate` подавляется при `paymentState ≠ no_amount`
  - `routes/work-board.ts`, `work-board-table.ts`, `work-monitor.ts` — единый чек `paymentState` вместо разнобойных условий по `receipt`/`commissionPaid`/`transactions`
  - `routes/ai-office.ts` — в SQL `runOrdersWithoutReceipts` и `runPaymentReminders` добавить фильтр `paymentState = 'no_amount'` соответственно `paymentState != 'paid'`
  - `lib/fomoBlock.ts` — `no_estimate` блокировка только при `paymentState = no_amount`; `no_payment` блокировка только при `paymentState = agreed AND age > 72h`
- CRM:
  - `ClosingDrawer` — кнопка "Зафиксировать согласованную сумму" + selector "Источник" + поле "Комментарий"
  - `OrderPanel` — кнопка "Принять предложение мастера" одним кликом (если есть `proposedAmount` и `paymentState = no_amount`)
  - `OrdersBanners` — баннер "Без сметы" заменяется на "Сумма не зафиксирована" (только для `paymentState = no_amount`)
  - SQL-фильтр в work-board подменяется на новые условия
- Master_PWA:
  - В карточке заказа подсказка "Оператор зафиксировал сумму X — смета не обязательна", когда `paymentState = agreed AND нет receipt`
- Уведомления:
  - При успешной фиксации Agreement_Amount — MAX мастеру "Оператор зафиксировал согласованную сумму N руб. по заказу #ID" (Requirement 14.1)
  - При `reconcile_amount` task — Manager_Bot уведомление (Requirement 14.4)

**Acceptance Phase 2**:
- THE Notification_Engine SHALL не генерировать новые `no_estimate` сигналы для `paymentState ∈ {agreed, paid, cancelled}` (Requirement 6, всех 5 каналов).
- THE Existing tasks `no_estimate` для таких заказов SHALL быть автоматически закрыты с пометкой "решено: сумма зафиксирована/оплачено/отменён" (Requirement 6.2).
- THE `Agreement_Path` SHALL работать end-to-end: Operator фиксирует сумму → MAX-уведомление мастеру → бейдж в CRM = "Сумма согласована" → комиссия рассчитана.
- THE Receipt_Path SHALL продолжать работать без изменений в наблюдаемом поведении (Requirement 3).

**Риски**:
- При первом включении флага все исторические заказы с `orderAmount > 0` мгновенно "обнулят" свой шум → ожидаемо большой `[escalation]`/`[scenarios]` дроп. Это фича, не баг. Мониторим логи 24 часа после релиза.
- `master.debt` остаётся не консистентным — это отдельная боль, фаза 3.

### Phase 3 — Reconcile, audit-UI, KPI

**Цель**: дать Manager инструменты разбора конфликтов и отчётности.

**Управление**: те же flag'и; добавляется `payment_state_audit_ui_enabled` для UI-фич аудита.

**Изменения**:
- API:
  - `GET /api/orders/:id/audit` — лента изменений суммы и комиссии (Requirement 5.1)
  - `POST /api/orders/:id/agreement` — поддержка `force = true` для Manager-correction после `paid` (Requirement 5.3, 5.4)
  - `lib/operatorTasks.ts` — задача `reconcile_amount` с `critical` SLA 30 минут
- CRM:
  - В `ClosingDrawer` (для Manager) — раскрывающаяся история изменений
  - Кнопки "Использовать сумму из сметы" / "Оставить согласованную сумму" в баннере на карточке заказа (Requirement 4.2)
  - `OrdersBanners` — баннер `reconcile_amount` (наряду с существующими)
  - Аналитический отчёт agreement vs receipt в разделе analytics (Requirement 15.2)
- Опционально (Phase 3.5, отдельный релиз):
  - Миграция `master.debt` — пересчитать на основе `transactions` + `partial_payments`; устранить рассинхрон
  - `dispatcherAI` `commission_debt` reminder переключается с `master.debt` на агрегат `transactions.paymentStatus = 'pending' OR 'overdue'`

**Acceptance Phase 3**:
- THE Manager SHALL видеть полную историю изменений суммы и комиссии для любого заказа.
- THE `reconcile_amount` task SHALL появляться в дашборде и эскалироваться по стандартному SLA.
- THE CRM analytics SHALL показывать долю Agreement_Path vs Receipt_Path за период.

**Риски**:
- `master.debt` миграция — потенциально шумит на старте (если расхождения большие). Делаем dry-run и отчёт для Manager перед апгрейдом.

## Notes for Reviewer

- Документ намеренно не описывает реализацию (миграции, схему таблиц, конкретные эндпоинты, компоненты). Конкретные DDL, имена эндпоинтов и сигнатуры функций — в design.
- Основная архитектурная гипотеза: `Order.orderAmount` остаётся единым источником правды для финальной суммы; Agreement_Path и Receipt_Path — два способа её установить. `agreement_amount_source` хранит, через какой путь сумма попала на заказ; `Payment_State` — derived из суммы и состояния Receipt/transactions.
- Связи с другими модулями (DispatcherAI, Checkin_Broadcast, work-board) перечислены только в той мере, в какой они влияют на наблюдаемое поведение системы.
