# Requirements Document

## Remove Token Payment Model

> **Статус**: Detailed (12.06.2026). Все Open Questions закрыты как Decisions D1–D10.
> Зависимость: должно начинаться ПОСЛЕ Phase 3 estimate-optional-flow в проде (готово 12.06.2026).

## Introduction

В системе исторически две модели оплаты заказа:

- **`commission`**: рублёвая модель. Мастер получает заказ, выполняет, оператор подтверждает сумму, рассчитывается комиссия (фикс 5к до 50к, 15% выше). Service fee **500₽** списывается с `master_wallet.balance` при отклике мастера на заказ (см. `lib/accountBalance.ts:deductServiceFee`).
- **`token`**: legacy-модель. Мастер платит N токенов из `master_wallet.tokensBalance` при отклике на заявку. Объём тарифицируется по `service_token_prices` × `city_token_multipliers` (или `manualTokenCost` если установлен оператором).

Token-модель используется в основном для **партнёрских заявок** (`leads.source = "avito_partner"` или `leads.trafficPartnerId != null` → `routes/orders.ts` форсит `paymentModel = "token"`).

### Текущее состояние (до начала фичи)

Рублёвая модель **уже работает в проде**:
- `master_wallet.balance` (рубли) и `creditLimit` живут параллельно с legacy `tokensBalance`/`creditTokens*`
- `service_fee_transactions` обрабатывает deduct/refund/test_waived
- 2 бесплатных тестовых заказа (`master_test_orders`, `FREE_TEST_ORDERS_LIMIT = 2`) для новых мастеров
- `accountBalance.ts` целиком использует только рублёвый баланс

Token-модель остаётся активной параллельно — это и есть источник дублирования.

### Проблемы с дублированием

1. **Двойная бизнес-логика** во всех модулях (CRM, master-pwa, work-board, finance, analytics, dispatcher, fomoBlock, dashboard tasks): везде `if (paymentModel === "token") ... else ...`. Каждое изменение приходится делать в двух местах.
2. **Двойные типы данных**: `orders.tokensCharged` + `orders.commission`; `master_wallet.tokensBalance` + `master_wallet.balance`; `wallet_transactions` (токены) + `service_fee_transactions` + `transactions` (комиссия).
3. **Путаница в UI**: оператор должен решить при создании lead'а — токены или комиссия. Бейдж "Токены" / "Комиссия" в work-board, отдельные фильтры, разные расчёты в analytics. 5 dashboard task-типов завязаны на токены.
4. **Сложность миграций**: новые фичи (например, `estimate-optional-flow`) вынуждены учитывать обе модели на каждом шаге.
5. **Бесполезная гибкость**: бизнес заявил, что одной модели **commission + service fee 500₽** достаточно для всех случаев, включая партнёрских.

Эта фича удаляет token-модель полностью, мигрирует все active-orders на commission, и убирает всю инфраструктуру токенов.

## Glossary

- **Token_Order**: заказ с `payment_model = "token"`.
- **Commission_Order**: заказ с `payment_model = "commission"`.
- **Token_Wallet**: токеновый кошелёк мастера (`master_wallet.tokensBalance` + связанные поля + `wallet_transactions`).
- **Ruble_Wallet**: рублёвый кошелёк мастера (`master_wallet.balance` + `creditLimit` + `service_fee_transactions`). Уже работает.
- **Service_Fee**: фиксированный сбор 500₽ за отклик на заявку, реализован в `lib/accountBalance.ts:deductServiceFee`.
- **Migration**: процесс перевода всех существующих Token_Orders в Commission_Orders + закрытия Token_Wallet.
- **Phase A**: Code cleanup за флагом `token_model_enabled = false`. Никаких новых token-orders, UI скрыт. БД не тронута.
- **Phase B**: Migration script — handle pending refunds, set credit limits, manual balance adjustments by admin.
- **Phase C**: Schema cleanup — DROP таблиц и колонок после 7+ дней стабильности Phase B.

## Decisions (closed Open Questions)

| ID | Вопрос | Решение |
|---|---|---|
| **D1** | Курс конверсии `tokensBalance → balance` | НЕ автоматизируется. Только 2 мастера с положительным `tokensBalance` — admin начисляет им рубли вручную через CRM/SQL. Migration script только верифицирует, что других мастеров с `tokensBalance > 0` нет. |
| **D2** | Партнёрская интеграция (Avito и др.) | API-контракт партнёров **не меняется**. Avito-leads перестают форситься в `paymentModel = "token"`. Все leads (включая партнёрские) идут как commission + service fee 500₽. |
| **D3** | Start bonus для мастеров | НЕ выдавать. |
| **D4** | Refund window для pending `wallet_transactions` | **Auto-approve** все pending refunds ДО Phase B. Возвращаем токены в `tokensBalance`, потом обнуляем. После DROP — refund невозможен (нет токенов). |
| **D5** | Rollback план | 3-фазный rollout. Phase A откатывается флагом, Phase B — restore из backup, Phase C — необратима без backup. |
| **D6** | Credit limit при миграции | Все мастера с `creditTokensIssued > 0` получают **`creditLimit = 1500₽`** (≈3 service-fee заявки). Не индивидуальная конверсия. |
| **D7** | `master_active_packages` | Таблица пуста — DROP без миграции данных. |
| **D8** | `token_audit_log`, `token_price_history` | Сохраняем 90 дней read-only после Phase B. После 90 дней — DROP. |
| **D9** | Минимальный интервал между фазами | Phase A → Phase B: **7 дней** мониторинга. Phase B → Phase C: **7 дней** мониторинга. |
| **D10** | Уведомление мастеров | User-side. Команда сама пишет push/MAX тем 2 мастерам. Никаких автоматических broadcast'ов. |

## Requirements

### Requirement 1: Все новые Order создаются как Commission_Order (Phase A)

**User Story:** Как Operator, я не хочу выбирать модель оплаты при создании заявки. Все заказы — commission.

#### Acceptance Criteria

1. THE CRM `CreateLeadModal` SHALL не показывать toggle/select "По токенам / Обычная комиссия".
2. THE API_Server `POST /api/leads` SHALL устанавливать `lead.paymentModel = "commission"` всегда, игнорируя любой переданный `paymentModel` (валидация на edge — игнор, без 400).
3. THE API_Server `routes/orders.ts` (создание Order из Lead, вызывается из `routes/leads.ts:send-to-buffer`) SHALL устанавливать `order.paymentModel = "commission"` всегда. Логика "если avito_partner → token" удаляется.
4. THE API_Server `routes/client.ts` (Order из client_site) SHALL устанавливать `paymentModel = "commission"`. Текущий код хардкодит `"token"` — заменяется.
5. THE API_Server `routes/partner-pwa.ts` (Lead от партнёра) SHALL устанавливать `paymentModel = "commission"`. Текущий код хардкодит `"token"` — заменяется.
6. THE API_Server `PATCH /api/orders/:id` SHALL не принимать `paymentModel` в body (silently ignored, как `paymentModel` field уже на пути к удалению).

### Requirement 2: Phase A — token-code paths за флагом

**User Story:** Как разработчик, я хочу выкатить отключение token-модели через флаг, чтобы можно было откатить без redeploy при проблеме.

#### Acceptance Criteria

1. THE system_settings SHALL содержать ключ `token_model_enabled` (boolean), default `true`.
2. THE API_Server SHALL читать флаг через guard `lib/tokenModelGuard.ts:isTokenModelEnabled()` с TTL 60с (по аналогии с `paymentStateGuard.ts`).
3. THE API_Server `master-pwa.ts:respond-to-order` SHALL когда флаг = false использовать `deductServiceFee()` для ВСЕХ откликов; когда флаг = true — старая логика (token-orders списывают токены, commission-orders 500₽).
4. THE API_Server `dashboard-action-items.ts` SHALL когда флаг = false скрывать tasks типов: `token_refund_pending`, `master_zero_balance`, `master_churn_risk`, `order_stalled_token`. При флаге = true — старое поведение.
5. THE API_Server `routes/wallet.ts` token-методы (token-purchases, token-refunds, etc.) SHALL когда флаг = false возвращать **404** Not Found. При флаге = true — работают.
6. THE CRM `App.tsx` SHALL когда флаг = false скрывать routes к `/token-analytics`, `/token-masters`, `/token-purchases`, `/token-refunds`, `/token-settings`. Через `useFeatureFlags()` — добавить флаг в `feature-flags` endpoint.
7. THE CRM `OrderPanel.tsx`, `work-board-table.tsx` SHALL когда флаг = false скрывать бейджи "💎 Токены", `tokensCharged`, `manualTokenCost`, фильтры по `paymentModel`.
8. THE Master_PWA `pages/wallet.tsx`, `pages/balance.tsx`, `pages/orders.tsx` SHALL когда флаг = false скрывать tokensBalance UI, "Стоимость в токенах", "Запросить возврат".

### Requirement 3: Phase B — Migration script

**User Story:** Как админ, я хочу одной командой подготовить БД к удалению токенов: закрыть pending refunds, перевести флаг, проставить credit limits.

#### Acceptance Criteria

1. THE Migration_Script `scripts/src/migrate-remove-tokens.ts` SHALL запускаться через `pnpm tsx scripts/src/migrate-remove-tokens.ts <command>` где `<command> ∈ { dry-run | apply }`.
2. THE Migration_Script SHALL в режиме `dry-run` НЕ изменять БД, только логировать что будет сделано.
3. THE Migration_Script `apply` SHALL выполнять следующие шаги в порядке:
   - **Step 1**: проверить, что флаг `token_model_enabled = false` минимум 7 дней. Если меньше — abort с сообщением (override через `--force`).
   - **Step 2**: проверить, что у всех мастеров с `tokensBalance > 0` есть запись в `master_balance_grants` (manual list). Если кто-то остался — abort, попросить admin'а либо добавить в grants, либо обнулить.
   - **Step 3**: auto-approve все pending `wallet_transactions { type: 'refund', status: 'pending' }`. Возврат идёт в `tokensBalance`, изменение логируется.
   - **Step 4**: для всех мастеров с `creditTokensIssued > 0` установить `creditLimit = 1500` (если ещё не установлен или меньше).
   - **Step 5**: применить manual balance grants из `master_balance_grants` (admin создал заранее) — добавить указанные суммы в `master_wallet.balance`.
   - **Step 6**: убедиться что нет open token-orders с `paymentModel = 'token'` AND `status NOT IN ('completed', 'cancelled')`. Если есть — закрыть как отменённые с автоматическим refund.
   - **Step 7**: записать в `system_settings` ключ `token_migration_completed_at = NOW()`.
4. THE Migration_Script SHALL писать **полный лог** каждого шага в `scripts/logs/migrate-remove-tokens-<timestamp>.json`.
5. THE Migration_Script SHALL делать **PRE-FLIGHT backup** через Railway-API (или предупреждать user'а о необходимости backup в режиме `apply`).

### Requirement 4: Phase B — manual balance grants

**User Story:** Как admin, я хочу заранее задать "сколько рублей начислить каждому мастеру при миграции", чтобы скрипт автоматически применил это.

#### Acceptance Criteria

1. THE schema SHALL содержать новую таблицу `master_balance_grants` (одноразовая, удалится в Phase C):
   - `id` serial PK
   - `masterId` integer FK to masters
   - `amount` numeric(10,2) — сумма в рублях
   - `reason` text — комментарий админа ("конверсия 500 токенов по 50₽")
   - `appliedAt` timestamp nullable — выставляется migration script'ом
   - `createdBy` text — admin alias
   - `createdAt` timestamp default now
2. THE CRM SHALL предоставлять admin-only страницу `/admin/token-migration` где admin может:
   - Видеть список мастеров с `tokensBalance > 0`
   - Создать/редактировать grant entries
   - Запустить migration dry-run прямо из UI
   - Видеть лог последнего dry-run
3. THE API_Server SHALL предоставлять endpoints:
   - `GET /api/admin/token-migration/masters-with-balance` — список мастеров с tokensBalance > 0
   - `POST /api/admin/token-migration/grants` — создать/обновить grant
   - `DELETE /api/admin/token-migration/grants/:id` — удалить grant
   - `POST /api/admin/token-migration/dry-run` — запустить миграцию в dry-run режиме, вернуть лог

### Requirement 5: Phase C — Schema cleanup

**User Story:** Как разработчик, я хочу удалить deprecated/неиспользуемый код, чтобы система была проще для поддержки.

#### Acceptance Criteria

1. THE schema migration SHALL удалить таблицы (через DROP TABLE IF EXISTS):
   - `wallet_transactions` (после auto-approve refunds в Phase B)
   - `service_token_prices`
   - `service_token_rules`
   - `city_token_multipliers`
   - `token_packages`
   - `master_active_packages` (пустая по D7)
   - `master_balance_grants` (одноразовая, отслужила)
2. THE schema migration SHALL **НЕ удалять** ещё 90 дней (D8):
   - `token_audit_log`
   - `token_price_history`
   После 90 дней — отдельной миграцией DROP.
3. THE schema migration SHALL удалить колонки:
   - `master_wallet.tokensBalance`, `totalTokensPurchased`, `totalTokensSpent`, `totalTokensRefunded`, `totalRubSpent`
   - `master_wallet.creditTokensIssued`, `creditTokensSpent`, `creditLimitTokens`
   - `orders.tokensCharged`, `manualTokenCost`, `paymentModel`
   - `leads.paymentModel`
4. THE code SHALL удалить файлы:
   - `lib/tokenWallet.ts` (если существует)
   - `routes/wallet.ts` token-методы (полностью, не stub'ы)
   - CRM pages: `pages/token-analytics.tsx`, `token-masters.tsx`, `token-purchases.tsx`, `token-refunds.tsx`, `token-settings.tsx`
   - Все ветки `if (paymentModel === "token")` — упрощаются до commission-логики
5. THE code SHALL **НЕ оставлять stub'ов** имитирующих удалённую функциональность.

### Requirement 6: Регрессия — существующее поведение НЕ ломается

**User Story:** Как мастер с активной заявкой во время миграции, я не должен потерять заказ или возможность работы.

#### Acceptance Criteria

1. THE Phase_A SHALL **НЕ удалять данные**. Только скрывает UI и переключает write paths на commission. Все open token-orders продолжают работать в legacy-режиме до закрытия.
2. THE Phase_B SHALL **НЕ блокировать работу мастеров** во время выполнения. Если мастер делает отклик в момент работы скрипта — оставляем его на legacy path до конца транзакции migration.
3. THE Phase_C SHALL запускаться только когда `token_migration_completed_at` старше 7 дней AND нет open orders с `paymentModel = 'token'` AND нет ошибок в `[migration]` логах.
4. THE Service_Fee_Flow SHALL продолжать работать в Phase A/B/C ровно как до фичи: 500₽ списывается на отклик, refund при отмене заказа, test_waived для тестовых.
5. THE Estimate-Optional-Flow SHALL продолжать работать. Token-related ветки в `lib/paymentState.ts`, `lib/paymentStateGuard.ts` (если есть) — упрощаются до single-model. Тесты 40/40 остаются зелёными.

### Requirement 7: Observability и rollback

**User Story:** Как dev, я хочу видеть статус миграции и иметь возможность откатить.

#### Acceptance Criteria

1. THE system_settings SHALL хранить ключи:
   - `token_model_enabled` (Phase A guard, default `true`)
   - `token_migration_completed_at` (timestamp, выставляется Phase B)
2. THE Phase_A_Rollback SHALL быть простым: `UPDATE system_settings SET value = 'true' WHERE key = 'token_model_enabled'`. Через 60с все инстансы возвращаются к token-flow.
3. THE Phase_B_Rollback SHALL требовать восстановления БД из backup. Migration_Script SHALL писать предупреждение в начале `apply`.
4. THE Phase_C_Rollback SHALL быть **невозможен** без backup. Migration перед DROP делает финальный snapshot + предупреждает.
5. THE Logging SHALL писать в `[token-migration]` префиксом для легкой grep'абельной фильтрации в Railway logs.

## Implementation Phases

### Phase A — Code за флагом (1-2 дня кода + 7+ дней мониторинга)

**Цель**: новый код не создаёт token-orders, UI скрыт. Open token-orders продолжают работать.

Задачи: schema flag, guard, hardcode commission в 5 routes, скрытие UI/pages в CRM и Master_PWA, флаг feature-flag endpoint.

**Acceptance**: pnpm test green, deploy SUCCESS, флаг = false на проде, новые leads создаются как commission, dashboard tasks без token, master-pwa wallet простой.

### Phase B — Migration (1 день)

**Цель**: подготовить БД к финальному cleanup.

Задачи: migration script, admin UI for grants, manual balance grants by admin, auto-approve pending refunds, set credit limits.

**Acceptance**: `master_wallet.tokensBalance` = 0 у всех мастеров (с grants применены), `wallet_transactions` без pending, `master_balance_grants` отработала.

### Phase C — Schema cleanup (0.5 дня + 90 дней до финального DROP audit/history)

**Цель**: удалить deprecated.

Задачи: DROP таблиц, DROP колонок, удалить файлы кода, обновить replit.md.

**Acceptance**: tsc green, 0 references к token-полям/таблицам в коде (кроме отложенных audit/history).

## Notes

- **Зависимость**: фича стартует ПОСЛЕ Phase 3 estimate-optional-flow (готово 12.06.2026). Иначе пересечение огромных изменений.
- **Объём работы**: ~30-50 файлов, ~10 таблиц/колонок схемы. Phase A — 1-2 дня. Phase B — 1 день + admin UI. Phase C — 0.5 дня. Итого ~3 дня кода, **2-3 недели календарных** с мониторингом между фазами.
- **Master_PWA wallet.tsx**: уже частично использует рублёвый баланс. Phase A упростит до single-balance UI.
- **Avito партнёрская интеграция (D2)**: API не меняется. Single point of truth — `routes/leads.ts` и `routes/orders.ts` перестают форсить `paymentModel = "token"` при `source = "avito_partner"`.
- **Балансы 2 мастеров (D1)**: admin вручную создаёт `master_balance_grants` через CRM admin page. Migration script просто применяет grants как `UPDATE master_wallet SET balance = balance + grant.amount`.
