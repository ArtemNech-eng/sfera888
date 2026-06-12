# Implementation Plan

## Overview

Этот план разбивает работу на инкрементальные кодинговые задачи, каждая ссылается на конкретные requirements. Задачи сгруппированы по фазам — каждая фаза самодостаточна и может быть задеплоена отдельно. Внутри фазы задачи упорядочены так, что каждая опирается на предыдущие.

**Конвенция оценки**: S = до 30 мин, M = 30–90 мин, L = 90+ мин.

**Перед стартом каждой фазы**: jaдаётся вопрос пользователю, реально ли продолжать (даёт время оценить риски). Между фазами — обязательная проверка в проде.

## Tasks

### Phase 1 — Read-only Payment_State

Цель: ввести единое поле `paymentState` и показать его в CRM, не меняя поведение системы. Безопасно — без feature-flag'а, всегда включено.

- [x] 1. **Schema migration: новые поля на `orders` + новая таблица `order_amount_audit`** (M)
  - Изменить `lib/db/src/schema/orders.ts`: добавить колонки `agreement_amount_source` (varchar 32, nullable), `payment_state_changed_at` (timestamp, nullable), `agreement_note` (text, nullable).
  - Создать `lib/db/src/schema/order-amount-audit.ts` по схеме из `design.md` § Data Models.
  - Добавить экспорт в `lib/db/src/schema/index.ts`.
  - Сгенерить миграцию: `pnpm --filter @workspace/db exec drizzle-kit generate --name=payment_state_engine`.
  - Дописать в сгенерированный SQL hand-edited секцию для backfill: `UPDATE orders SET agreement_amount_source = 'unknown' WHERE order_amount IS NOT NULL AND agreement_amount_source IS NULL`.
  - Прогнать `pnpm typecheck`.
  - Локально стартовать api-server, проверить лог `[migrate] drizzle migrations up to date`.
  - _Validates: Requirements 1.1, 5.1, 11 (исторические заказы)._

- [x] 2. **Pure-функция `computePaymentState` + batch-вариант** (S)
  - Создать `artifacts/api-server/src/lib/paymentState.ts`.
  - Экспорт: `type PaymentState`, `computePaymentState(order, receipts)`, `computePaymentStateBatch(orders, receiptsByOrder)`.
  - Логика — точно как в `design.md` § Architecture / State diagram.
  - _Validates: Requirements 1.1, 1.5._

- [x] 3. **Unit-тесты для `computePaymentState`** (M)
  - Создать `artifacts/api-server/__tests__/paymentState.test.ts` (или адекватный путь под существующий test runner — проверить что в проекте уже есть).
  - 12 примерных кейсов из `design.md` § Testing Strategy.
  - Проверить запуск: тесты должны падать если функция случайно регрессирует.
  - _Validates: Property 1, Property 2, Property 3._

- [x] 4. **Feature-flag guard в `lib/paymentStateGuard.ts`** (S)
  - Создать `artifacts/api-server/src/lib/paymentStateGuard.ts`.
  - Экспорт: `isPaymentStateEngineEnabled()`, `shouldNagAboutEstimate(paymentState, hasReceipt)`, `clearFlagCache()`.
  - TTL 60с. Чтение из `system_settings` ключ `payment_state_engine_enabled`. Default `false` (fail-closed).
  - В Phase 1 этот guard ещё никем не используется — мы его готовим заранее.
  - _Validates: Requirements 6.9 (старое поведение когда флаг false)._

- [x] 5. **Добавить `paymentState` и `agreementAmountSource` в JSON ответов order endpoints** (M)
  - `routes/orders.ts GET /api/orders` (список) — после загрузки orders+receipts вызвать `computePaymentStateBatch`, в каждом row добавить поля.
  - `routes/orders.ts GET /api/orders/:id` (одиночный) — то же на одном объекте.
  - Также: `routes/leads.ts` (если на этом эндпоинте отдаются orders).
  - Никаких других изменений — только дополнение JSON.
  - _Validates: Requirements 1.2._

- [x] 6. **Добавить `paymentState` в work-board кадры** (M)
  - `routes/work-board.ts` `buildBoard()` — для каждой card вычислить и добавить `paymentState`.
  - `routes/work-board-table.ts` — то же для табличного формата.
  - `routes/work-monitor.ts` — то же.
  - Производительность: использовать `computePaymentStateBatch` (один проход по уже загруженным receipts/orders).
  - _Validates: Requirements 1.2._

- [x] 7. **Создать `GET /api/system/feature-flags` endpoint** (S)
  - Новый файл `artifacts/api-server/src/routes/system.ts` (если нет похожего) или extend существующий.
  - Возвращает 3 флага: `payment_state_engine_enabled`, `payment_state_audit_ui_enabled`, `payment_state_master_proposal_oneclick`.
  - Auth: `requireAuth` (любая роль).
  - Регистрация роута в `routes/index.ts`.
  - _Validates: Requirements 6.9 (управление флагами через UI)._

- [x] 8. **CRM компонент `<PaymentStateBadge>`** (S)
  - Создать `artifacts/crm/src/components/orders/PaymentStateBadge.tsx`.
  - Принимает `state: PaymentState`. Лейблы: "Сумма не зафиксирована" / "Сумма согласована" / "Оплачено" / "Отменён".
  - Tailwind стили — нейтральный/желтый/зелёный/красный.
  - _Validates: Requirements 1.4._

- [x] 9. **Интегрировать `<PaymentStateBadge>` в CRM** (M)
  - `OrderPanel.tsx` — рядом с заголовком, показывать `paymentState` из ответа API.
  - `OrdersWorkspace.tsx` — добавить столбец/бейдж в строке таблицы.
  - `work-board-table.tsx` (CRM) — бейдж в колонке Money.
  - `MasterPickerPanel.tsx` — мини-бейдж в карточке.
  - Старые индикаторы НЕ удаляем — Phase 1 only adds.
  - _Validates: Requirements 1.4, 10.3._

- [x] 10. **Smoke test на dev DB + готовность Phase 1 к деплою** (S)
  - Запустить локально → проверить что миграция прошла, в БД есть новые колонки, в `GET /api/orders/:id` есть `paymentState`.
  - Открыть CRM → увидеть бейджи.
  - Прогнать unit-тесты.
  - Зафиксировать список изменений для деплой-PR.
  - _Validates: Phase 1 acceptance — см. design.md._

> ✅ После завершения 1-10: коммит, push, redeploy. Между фазами проверить на проде.

---

### Phase 2 — Agreement_Path + подавление Legacy_No_Estimate_Signal

Цель: запустить новый путь и заглушить шум 5 каналов уведомлений. Управляется флагом `payment_state_engine_enabled` (default `false`).

- [-] 11. **~~Refactor: вынести `chargeTokensForOrder` в `lib/orderTokens.ts`~~ (SKIPPED — discovered issue)** (M)
  - **Discovered**: в текущей архитектуре `acceptProposed` для `paymentModel = "token"` ничего не списывает (см. `routes/orders.ts:386` `if (current.paymentModel !== "token")`). Token-charging происходит на этапе ОТКЛИКА мастера в master-pwa, не в `acceptProposed`. Поле `Order.tokensCharged` в api-server коде никем не обновляется.
  - **Решение**: T11 пропущен. POST /agreement (T13) повторит логику `acceptProposed`: для commission — пересчёт + transaction; для token — просто пишет `orderAmount` (как сейчас).
  - **Связь**: будет полностью устранено в отдельной фиче `.kiro/specs/remove-token-payment-model/` — переход на единую commission модель.
  - _Validates: Requirements 8.1, 8.2 (Q4 уточнён в decisions, см. requirements.md)._

- [x] 12. **Audit-helper `lib/orderAudit.ts`** (M)
  - Экспорт: `recordAmountAudit(tx, params)`, `getAmountAudit(orderId, limit)`, `closeOpenEstimateTasksForOrder(orderId, reason)`.
  - `recordAmountAudit` — insert в `order_amount_audit`.
  - `closeOpenEstimateTasksForOrder` — invalidate cache в `dashboard-action-items.ts` (existing `invalidateBuildItemsCache`).
  - _Validates: Requirements 5.1, 6.2._

- [x] 13. **Новый endpoint `POST /api/orders/:id/agreement`** (L)
  - Добавить в `routes/orders.ts` рядом с PATCH.
  - Auth: `requireRole("admin", "lead_operator", "master_operator")`.
  - Полный flow: `db.transaction` с `forUpdate` lock → validate `amount > 0` → check status ≠ cancelled/completed → update orders → recalculate commission (если paymentModel ≠ token) → audit → token charging (если paymentModel = token и первый раз) → ensure transaction (если paymentModel = commission) → close open estimate tasks → notifyWorkBoardChanged → MAX/push мастеру.
  - Псевдокод полностью в `design.md` § API Contracts.
  - _Validates: Requirements 2.1–2.6, 4.4, 8.2, 14.1._

- [x] 14. **Обернуть существующий `PATCH /api/orders/:id` в audit** (L)
  - В `routes/orders.ts PATCH /:id` все изменения `orderAmount`, `commission`, `commissionPaid` теперь идут через `db.transaction` + `recordAmountAudit`.
  - `pickSource` helper для выбора `source`: `master_proposal` / `manager_correction` / `manager_force_paid` / `system_recalc` / `operator_edit` / `reconcile_*`.
  - Поддержать новые actions в body: `force: true` (Manager force-paid с обязательным `reason`), `acceptReceiptAmount: true`, `keepAgreementAmount: true`.
  - Сохранить полную backward-compat: всё старое поведение работает.
  - _Validates: Requirements 5.1, 5.4, 11.2 (Manager force-paid), 4.2, 4.3._

- [x] 15. **Channel 1: `runOrdersWithoutReceipts` SQL-фильтр через guard** (M)
  - В `routes/ai-office.ts` функция `runOrdersWithoutReceipts` проверяет `await isPaymentStateEngineEnabled()`. Если true — добавляет в SQL `AND COALESCE(o.order_amount, '0')::numeric = 0 AND o.commission_paid = false`. Если false — старая логика.
  - Аналогично `runPaymentReminders` — добавляет `AND o.commission_paid = false`.
  - _Validates: Requirements 6.1, 6.5, 6.6._

- [ ] 16. **Channel 2: `dashboard-action-items.ts no_estimate` через guard** (M)
  - В `buildItems()`: pre-compute `paymentState` для всех загруженных orders.
  - Условие `if (!hasEstimate && estimateAgeH >= 24)` заменить на:
    ```
    const flag = await isPaymentStateEngineEnabled();
    const shouldShow = flag ? paymentState === "no_amount" : !hasEstimate;
    if (shouldShow && estimateAgeH >= 24) ...
    ```
  - _Validates: Requirements 6.1, 6.2._

- [ ] 17. **Channel 3: `work-board.ts` проблема "Без сметы" + колонка `no_estimate`** (M)
  - В `buildBoard()` — pre-compute `paymentState` для каждого order.
  - Условие проблемы: `paymentState === "no_amount" && assignedAt > 48h` вместо `!receipt && ...`.
  - Колонка `no_estimate` фильтруется через `paymentState === "no_amount"`.
  - Текст проблемы изменить: "Сумма не зафиксирована более 48 часов" вместо "Без сметы".
  - При выключенном флаге — старая логика.
  - _Validates: Requirements 6.3._

- [ ] 18. **Channel 3b: `work-board-table.ts` тоже самое** (M)
  - Те же правила, что в работе-board, применить к табличному API.
  - _Validates: Requirements 6.3._

- [ ] 19. **Channel 4: auto-close estimate tasks при переходе в agreed/paid/cancelled** (S)
  - В `POST /agreement` (T13) и в `PATCH /:id` (T14) после commit транзакции — вызвать `closeOpenEstimateTasksForOrder()` (cache invalidate).
  - В `lib/operatorTasks.ts` `getOperatorTasks()` — это уже работает корректно для `price_proposal` (требует `proposedAmount && !orderAmount`); никаких изменений на этом узле не требуется.
  - _Validates: Requirements 6.2, 12.5._

- [ ] 20. **Channel 5: `fomoBlock.ts` priorities 1+3 через `paymentState`** (M)
  - В `getFomoBlock()`:
    - Priority 1: `paymentState === "no_amount" && assignedAt > 48h` (вместо `!proposedAmount`).
    - Priority 3: `paymentState === "agreed" && нет paid receipt && updatedAt > 72h`.
  - При выключенном флаге — старая логика (через guard).
  - Запустить unit-тест `checkFomoTransition` для проверки что unblock notification работает корректно.
  - _Validates: Requirements 6.7._

- [ ] 21. **CRM: `<AgreementForm>` компонент** (M)
  - Создать `components/orders/AgreementForm.tsx`.
  - Поля: `amount` (number input), `noteSource` (select: `from_master | from_chat | other`), `note` (text optional).
  - Submit → `POST /api/orders/:id/agreement`.
  - Обработка ошибок (400/401/403/500) через toast.
  - _Validates: Requirements 2.1, 9.3, 12 (Q12 — опциональный комментарий)._

- [ ] 22. **CRM: интегрировать `<AgreementForm>` в `ClosingDrawer`** (M)
  - Если `paymentState === "no_amount"` — показывать AgreementForm как первичное действие.
  - Если `paymentState === "agreed"` — показывать существующий submit + опция "Изменить сумму" (тоже AgreementForm).
  - Если `paymentState === "paid"` — для Manager оставить редактирование (force-correction); для Operator — read-only.
  - _Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 5.2, 5.3._

- [ ] 23. **CRM: кнопка "Принять предложение мастера"** (S)
  - В `OrderPanel.tsx` — если `proposedAmount > 0 && paymentState === "no_amount"` AND флаг `payment_state_master_proposal_oneclick` включён — показать кнопку.
  - Клик → `POST /api/orders/:id/agreement { amount: proposedAmount, source: "master_proposal" }`.
  - _Validates: Requirements 13 (Q13)._

- [ ] 24. **CRM: новый баннер "Сумма не зафиксирована более 48ч"** (M)
  - В `OrdersBanners.tsx` добавить четвёртый баннер: запрос `GET /api/orders?paymentState=no_amount&staleHours=48` (новый query-param на `routes/orders.ts GET /`).
  - Бэкенд изменения: parse `paymentState` query-param + `staleHours` в `routes/orders.ts GET /`.
  - Текст: "N заказов с незафиксированной суммой более 48 часов" + клик → переход к `OrdersWorkspace` с фильтром.
  - _Validates: Requirements 10.1, 10.4._

- [ ] 25. **Master_PWA: подсказка "Оператор зафиксировал сумму"** (S)
  - В `master-pwa/src/pages/orders.tsx` карточка заказа — если `paymentState === "agreed" && agreementAmountSource ∈ ['agreement', 'master_proposal']` AND нет своего receipt — показать зелёную подсказку.
  - Backend: в response `master-pwa.ts` GET orders — добавить `paymentState` и `agreementAmountSource` (использовать те же helpers).
  - _Validates: Requirements 14.1, 10 (Q10 — что видит мастер)._

- [ ] 26. **Notifications: MAX/push мастеру при Agreement** (S)
  - В `POST /agreement` (T13) после commit транзакции — `sendMaxAgreementNotice()` + `sendPushToMaster()`.
  - Текст: "✅ Оператор зафиксировал согласованную сумму N ₽ по заказу #ID. Дополнительно создавать смету не нужно."
  - Errors не валят запрос (catch + log).
  - _Validates: Requirements 14.1._

- [ ] 27. **Integration tests для `POST /agreement`** (M)
  - Файл `artifacts/api-server/__tests__/paymentState.endpoint.test.ts` (или используем существующий test pattern).
  - 6 кейсов из `design.md` § Testing Strategy.
  - Использовать pg test database или мокать через драйвер.
  - _Validates: Property 1, 2, 4, 5, Requirements 2.4, 4.1, 4.4._

- [ ] 28. **Phase 2 manual verification (на staging/dev перед prod включением)** (M)
  - Прогнать чек-лист из `design.md` § Testing Strategy / Manual verification.
  - Проверить регрессии: receipt-flow, token-orders, auto-completed, cancellation, existing operator tasks.
  - Зафиксировать в комментарии деплоя что готово к включению флага.
  - _Validates: Phase 2 acceptance._

- [ ] 29. **Включение флага `payment_state_engine_enabled` на проде** (S)
  - SQL: `INSERT INTO system_settings (key, value, updated_at) VALUES ('payment_state_engine_enabled', 'true', NOW()) ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW();`
  - Мониторить 30 мин: логи `[scenarios]`, MAX-сообщения, ошибки.
  - При проблеме — `UPDATE ... value = 'false'`. Через 60с возврат к старому поведению.
  - _Validates: Phase 2 deployed._

> ✅ После 29: 24h мониторинг → если ок, переходим к Phase 3.

---

### Phase 3 — Reconcile, Audit-UI, KPI

Цель: дать Manager инструменты для разбора конфликтов и просмотра истории. Управляется флагом `payment_state_audit_ui_enabled`.

- [ ] 30. **Новый тип task `reconcile_amount` в `operatorTasks.ts`** (M)
  - Добавить в `TaskType` union.
  - SLA: 30 минут (`TASK_SLA.reconcile = 30`).
  - SQL обнаружения — точно как в `design.md` § LLD § 3.1.
  - В `getOperatorTasks()` — шестой блок task-loading.
  - _Validates: Requirements 4.1, 15 (Q15)._

- [ ] 31. **Новый endpoint `GET /api/orders/:id/audit`** (S)
  - Добавить в `routes/orders.ts`.
  - Auth: `requireRole("admin")`.
  - Возвращает rows из `order_amount_audit` orderBy createdAt DESC, limit 100.
  - _Validates: Requirements 5.5._

- [ ] 32. **CRM: `<ReconcileBanner>` component** (M)
  - Создать `components/orders/ReconcileBanner.tsx`.
  - Принимает `order` + `receipts` (последняя). Показывает обе суммы и две кнопки: "Использовать сумму из сметы" / "Оставить согласованную сумму".
  - Submit → `PATCH /api/orders/:id { acceptReceiptAmount: true }` или `{ keepAgreementAmount: true, reason: "..." }` (reason обязателен для keepAgreement).
  - _Validates: Requirements 4.2, 4.3._

- [ ] 33. **CRM: интегрировать `<ReconcileBanner>` в OrderPanel + OrdersWorkspace** (M)
  - Detect: для каждого order проверить если есть active reconcile_task (через `operator_tasks_state` или передавать в order JSON).
  - Лучший подход: добавить в response `routes/orders.ts` поле `hasReconcileConflict: bool` + `conflictReceiptAmount: number | null`.
  - Banner показывается только если `hasReconcileConflict === true`.
  - _Validates: Requirements 4.2._

- [ ] 34. **CRM: `<AmountAuditHistory>` collapsible в ClosingDrawer (Manager only)** (M)
  - Создать `components/orders/AmountAuditHistory.tsx`.
  - Запрос: `GET /api/orders/:id/audit`.
  - Render: collapsible `<details>` с таблицей timestamp / actor / field / prev → new / source / reason.
  - Показывается только для роли admin AND флаг `payment_state_audit_ui_enabled === true`.
  - _Validates: Requirements 5.5._

- [ ] 35. **KPI endpoint `GET /api/analytics/payment-state-mix`** (M)
  - Запросы по `agreement_amount_source` за период.
  - Auth: `requireRole("admin")`.
  - Response — структура из `design.md` § LLD § 3.5.
  - _Validates: Requirements 15.2, 15.3._

- [ ] 36. **CRM: страница analytics — добавить блок payment-state mix** (M)
  - В существующий analytics page добавить таблицу + bar chart за выбранный период.
  - Группировка: day/week/month.
  - _Validates: Requirements 15.2._

- [ ] 37. **Включение флага `payment_state_audit_ui_enabled` на проде** (S)
  - SQL: тот же шаблон что для Phase 2.
  - После включения проверить:
    - В CRM появляется кнопка "История" в Closing_Drawer для Manager.
    - При расхождении сумм появляется `<ReconcileBanner>`.
    - Аналитика показывает корректные числа.
  - _Validates: Phase 3 deployed._

> ✅ После 37: фича полностью доступна. Phase 3.5 — опциональный отдельный релиз.

---

### Phase 3.5 — Master.debt cleanup (опционально, отдельный релиз)

Может быть запущен в любой момент после Phase 2. Не блокирует основные фазы. Изолированный risky шаг — потому отдельная phase.

- [ ] 38. **Скрипт `scripts/src/recompute-master-debt.ts` (dry-run)** (M)
  - Для каждого master: пересчитать `debt = Σ (commission - prepaymentDeducted - Σ partial_payments) FROM transactions WHERE paymentStatus IN ('pending', 'overdue')`.
  - Вывести таблицу: master_id, alias, current_debt, computed_debt, diff.
  - Не писать в БД (dry-run).
  - _Validates: backfill correctness pre-check._

- [ ] 39. **Manager review + apply** (S)
  - Manager смотрит report → решает применять.
  - Применить: тот же скрипт с флагом `--apply`.
  - Сделать backup `masters.debt` колонки перед apply.
  - _Validates: Risk 6 mitigation._

- [ ] 40. **Переключить `dispatcherAI.ts` `commission_debt` reminder** (S)
  - Условие срабатывания меняется с `master.debt > 0` на `EXISTS transaction WHERE master_id = X AND paymentStatus IN ('pending', 'overdue')`.
  - Это устранит ложные срабатывания.
  - _Validates: устранение шума при рассинхронизации debt._

---

### Final Verification

После всех фаз — финальная проверка:

- [ ] 41. **End-to-end smoke** (M)
  - Полный сценарий: создать заказ → назначить мастера → оператор фиксирует сумму через AgreementForm → видит бейдж "Сумма согласована" → ставит commissionPaid → бейдж "Оплачено".
  - Альтернативный: создать заказ → назначить мастера → мастер создаёт receipt → клиент платит → оператор подтверждает → видит "Оплачено" автоматически.
  - Конфликтный: после Agreement_Amount мастер делает Receipt с другой суммой → появляется reconcile_amount → Manager выбирает разрешение.
  - _Validates: All Phase 1, 2, 3 acceptance criteria._

- [ ] 42. **Документация**
  - Обновить `replit.md` или README — описать Payment_State и feature flags.
  - Краткая инструкция для оператора: "Что делать если заказ висит в 'no_amount'".
  - _Validates: разработческая поддержка._


## Task Dependency Graph

Задачи внутри фазы линейные (каждая опирается на предыдущие). Между фазами есть жёсткие зависимости.

```json
{
  "waves": [
    { "wave": 1, "phase": 1, "tasks": [1], "description": "Schema migration — критическая foundation" },
    { "wave": 2, "phase": 1, "tasks": [2, 4], "description": "Pure compute + feature-flag guard, могут параллельно" },
    { "wave": 3, "phase": 1, "tasks": [3], "description": "Unit tests для computePaymentState" },
    { "wave": 4, "phase": 1, "tasks": [5, 6, 7], "description": "Read-side endpoints добавляют paymentState в ответы — параллельно" },
    { "wave": 5, "phase": 1, "tasks": [8], "description": "PaymentStateBadge компонент" },
    { "wave": 6, "phase": 1, "tasks": [9], "description": "Интеграция badge в CRM views" },
    { "wave": 7, "phase": 1, "tasks": [10], "description": "Smoke test — финальная проверка фазы" },
    { "wave": 8, "phase": 2, "tasks": [11, 12], "description": "Refactor tokens + audit helper" },
    { "wave": 9, "phase": 2, "tasks": [13, 14], "description": "Write paths — POST /agreement и PATCH wrapping; 14 опирается на 12" },
    { "wave": 10, "phase": 2, "tasks": [15, 16, 17, 18, 19, 20], "description": "Подавление 5 каналов — параллельно после write paths" },
    { "wave": 11, "phase": 2, "tasks": [21, 22, 23, 24, 25, 26], "description": "CRM UI + Master_PWA + notifications — параллельно" },
    { "wave": 12, "phase": 2, "tasks": [27], "description": "Integration tests" },
    { "wave": 13, "phase": 2, "tasks": [28], "description": "Manual verification на staging" },
    { "wave": 14, "phase": 2, "tasks": [29], "description": "Production toggle флага" },
    { "wave": 15, "phase": 3, "tasks": [30, 31, 35], "description": "Reconcile task + audit endpoint + KPI endpoint — параллельно" },
    { "wave": 16, "phase": 3, "tasks": [32, 34, 36], "description": "UI компоненты — после API" },
    { "wave": 17, "phase": 3, "tasks": [33], "description": "Интеграция ReconcileBanner в OrderPanel" },
    { "wave": 18, "phase": 3, "tasks": [37], "description": "Production toggle флага" },
    { "wave": 19, "phase": "3.5", "tasks": [38], "description": "Master.debt dry-run — опционально" },
    { "wave": 20, "phase": "3.5", "tasks": [39, 40], "description": "Apply + переключение dispatcherAI — после Manager review" },
    { "wave": 21, "phase": "final", "tasks": [41, 42], "description": "End-to-end verification + документация" }
  ],
  "criticalPath": [1, 2, 11, 13, 14, 29, 30, 37, 41],
  "phaseGates": {
    "phase1Complete": [10],
    "phase2Complete": [29],
    "phase3Complete": [37]
  }
}
```

### Текстовая визуализация

```
Phase 1 (foundation):
  T1 (migration) ──▶ T2 (paymentState.ts) ──▶ T3 (unit tests)
                  ▶ T4 (guard.ts) [параллельно T2-T3]
  T2 ──▶ T5, T6, T7 [можно параллельно после T2]
  T8 (PaymentStateBadge) ──▶ T9 (CRM integration)
  T10 (smoke) — финальная проверка фазы, требует все выше

Phase 2 (требует Phase 1 в проде):
  T11 (refactor tokens) ──▶ T13 (POST /agreement) — критическая зависимость
  T12 (audit helper) ──▶ T13, T14
  T13, T14 (write paths) ──▶ T15-T20 (channels) — каналы должны видеть audit
  T19 (auto-close) — выполняется внутри T13/T14 транзакций
  T21 (AgreementForm) ──▶ T22 (ClosingDrawer integration), T23 (proposal button)
  T24 (banner) — независимо от UI задач, нужен только новый query-param на API
  T25 (Master_PWA подсказка) — нужны T13 + paymentState в master-pwa response
  T26 (notifications) — выполняется внутри T13
  T27 (integration tests) — после T13, T14
  T28 (manual verification) — финальная проверка перед T29
  T29 (production toggle) — после всех T11-T28

Phase 3 (требует Phase 2 в проде):
  T30 (reconcile task) ──▶ T32 (ReconcileBanner) ──▶ T33 (integration)
  T31 (audit endpoint) ──▶ T34 (AuditHistory UI)
  T35 (KPI endpoint) ──▶ T36 (analytics UI)
  T37 (production toggle) — после T30-T36

Phase 3.5 (опционально, после Phase 2):
  T38 (dry-run) ──▶ T39 (apply) ──▶ T40 (switch dispatcherAI)

Final:
  T41 (E2E) — после всех остальных
  T42 (docs) — параллельно или после T41
```

**Критический путь**: T1 → T2 → T11 → T13 → T14 → T29 → T30 → T37 → T41.

**Параллельность**:
- В Phase 1: T5/T6/T7 можно делать параллельно после T2.
- В Phase 2: каналы T15-T20 можно делать параллельно после T13/T14.
- В Phase 2: UI задачи T21-T25 параллельно с каналами.
- В Phase 3: T30-T31-T35 параллельны после Phase 2.

## Notes

- **Не реализуем код до явного подтверждения пользователя.** После tasks.md — следующий шаг = "ОК, поехали Phase 1". Только после этого начинается работа над миграцией.
- **Между фазами** — продакшн-проверка обязательна. Даже если код merged, флаг включается отдельным шагом и мониторится 30+ мин.
- **Тесты**: используем существующий test runner проекта (если нет — настраиваем простой `node --test` или vitest в Phase 1 task 3).
- **Property-based tests** упомянуты в design.md — реализация в Phase 1 (Property 1, 2, 3) и Phase 2 (Property 4, 5, 6, 7) если в проекте появится `fast-check`. Если нет — заменяем на example-based тесты с покрытием тех же edge cases.
- **Открытые риски на момент tasks.md**: ни одного блокирующего. Все 10 рисков из design.md имеют митигацию.
- **Если в процессе реализации появятся новые open questions** — фиксируем как `## Discovered Issues` в этом файле и согласовываем с пользователем.
