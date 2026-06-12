# Implementation Plan

## Overview

3-фазный rollout удаления token-модели. Фаза A — code за флагом, Фаза B — migration script, Фаза C — schema cleanup. Минимум 7 дней мониторинга между фазами (D9).

**Конвенция оценки**: S = до 30 мин, M = 30–90 мин, L = 90+ мин.

**Зависимость**: фича стартует ПОСЛЕ Phase 3 estimate-optional-flow в проде (готово 12.06.2026).

## Tasks

### Phase A — Code за флагом (без миграций БД, кроме `master_balance_grants`)

Цель: при флаге `token_model_enabled = false` система ведёт себя как будто токенов нет. Open token-orders продолжают работать в legacy-режиме до закрытия.

- [x] 1. **Schema migration: новая таблица `master_balance_grants`** (S)
  - Создать `lib/db/src/schema/master-balance-grants.ts` по дизайну (см. design.md § Data Models / Новая таблица).
  - Добавить export в `lib/db/src/schema/index.ts`.
  - Сгенерить миграцию: `pnpm --filter @workspace/db exec drizzle-kit generate --name=token_migration_grants`.
  - Прогнать `pnpm typecheck`.
  - Локально стартовать api-server, проверить лог `[migrate] drizzle migrations up to date`.
  - _Validates: Requirements 4.1._

- [x] 2. **`lib/tokenModelGuard.ts` — feature-flag guard** (S)
  - Создать `artifacts/api-server/src/lib/tokenModelGuard.ts` точно по шаблону `paymentStateGuard.ts`.
  - Экспорт: `isTokenModelEnabled()`, `clearTokenModelFlagCache()`.
  - TTL 60с. Default = `true` (token-model on). `'false'` явно для выключения.
  - На ошибку БД — fail-safe возврат `true` (не делаем массовых изменений).
  - _Validates: Requirements 2.1, 2.2._

- [x] 3. **Unit-тесты для `tokenModelGuard`** (S)
  - Создать `__tests__/tokenModelGuard.test.ts`.
  - Кейсы: default = true; explicit 'true'; explicit 'false'; пустой row; БД-ошибка; кеш TTL; clearCache().
  - 6-7 тестов по шаблону `paymentStateGuard` (если есть) или `paymentState.test.ts`.
  - _Validates: Property 7._

- [x] 4. **Расширить `system.ts:GET /feature-flags` + `useFeatureFlags`** (S)
  - В `routes/system.ts` добавить `'token_model_enabled'` в whitelist `PAYMENT_STATE_FLAGS` (или переименовать в `WHITELISTED_FLAGS`).
  - Default = `true` в `FLAG_DEFAULTS`.
  - В `artifacts/crm/src/hooks/useFeatureFlags.ts` добавить `token_model_enabled: boolean` в interface, default `true` в FALLBACK.
  - _Validates: Requirements 2.6._

- [x] 5. **Хардкод `paymentModel = "commission"` на write paths** (M)
  - `routes/leads.ts:POST /` — игнорировать `body.paymentModel`, всегда commission.
  - `routes/leads.ts:POST /:id/send-to-buffer` — `order.paymentModel = "commission"`.
  - `routes/orders.ts createOrderFromLead` (вызывается из leads) — убрать `if (avito_partner) → "token"` под guard. При флаге=true — старая логика.
  - `routes/client.ts` (3 места) — `paymentModel = "commission"` под guard.
  - `routes/partner-pwa.ts` — `paymentModel = "commission"` под guard.
  - `routes/orders.ts PATCH /:id` — silently ignore `body.paymentModel` (не проверяем флаг, всегда игнор).
  - При флаге=false — все 4 entry points создают только commission orders.
  - _Validates: Requirements 1.1–1.6, Property 1._

- [x] 6. **`master-pwa.ts:respond` — всегда service fee при флаге=false** (M)
  - В `routes/master-pwa.ts:respond` (около строки 950) — обернуть `isCommissionOrder` ветку в guard.
  - При флаге=false: `isCommissionOrder = true` всегда.
  - При флаге=true: legacy логика (существующая).
  - Также убрать из respond ветку `if (paymentModel === "token")` если есть refund-related код.
  - _Validates: Requirements 2.3, Property 2._

- [x] 7. **`master-pwa.ts:request-token-refund` — 404 при флаге=false** (S)
  - В endpoint `POST /api/master-pwa/orders/:id/request-token-refund` (около строки 1022).
  - При флаге=false: `return res.status(404).json({ error: "Token refund removed" })`.
  - При флаге=true: existing logic.
  - _Validates: Requirements 2.5._

- [x] 8. **`routes/wallet.ts` — middleware-gate для всех endpoints** (S)
  - Добавить в начало router'а: `router.use(async (_req, res, next) => { if (!await isTokenModelEnabled()) return res.status(404).json({ error: "Wallet API removed" }); next(); });`.
  - Все 25+ endpoints автоматически блокированы при флаге=false.
  - _Validates: Requirements 2.5._

- [x] 9. **`dashboard-action-items.ts` — skip 4 token-tasks при флаге=false** (M)
  - Pre-check: `const tokenModelOn = await isTokenModelEnabled();`
  - В `buildItems()` обернуть генерацию tasks `token_refund_pending`, `master_zero_balance`, `master_churn_risk`, `order_stalled_token` в `if (tokenModelOn) { ... }`.
  - При флаге=false эти 4 типа задач не появляются.
  - _Validates: Requirements 2.4._

- [x] 10. **CRM: скрыть `/token-*` routes при флаге=false** (M)
  - В `App.tsx` (или where Router is): обернуть routes к `/token-analytics`, `/token-masters`, `/token-purchases`, `/token-refunds`, `/token-settings` в `flags.token_model_enabled && (...)`.
  - В sidebar/menu (component layout): скрыть пункты "Токены" под флагом.
  - _Note_: routes уже не зарегистрированы в `App.tsx` Switch (только lazy imports как orphans), и в sidebar/layout нет ссылок. Phase A no-op. Lazy imports удалятся в Phase C T29.
  - _Validates: Requirements 2.6._

- [x] 11. **CRM: скрыть paymentModel UI при флаге=false** (M)
  - `CreateLeadModal.tsx` — toggle "Токены/Комиссия" под `flags.token_model_enabled`.
  - `EditLeadModal.tsx` — то же.
  - `OrderPanel.tsx` — `tokensCharged`, `manualTokenCost`, бейдж "💎" под флагом.
  - `work-board-table.tsx` — колонка `paymentModel`, фильтр под флагом.
  - `OrdersWorkspace.tsx` — paymentModel filter под флагом.
  - `pages/masters.tsx` — `tokensBalance` в карточке мастера под флагом.
  - `pages/finance.tsx` — token-related виджеты под флагом.
  - _Note_: Минимальный набор для Phase A — спрятан критичный toggle "Token/Commission" в `CreateLeadModal.tsx` (предотвращает создание новых token-leads). Остальные UI-surface'ы (бейджи, фильтры, колонки) отдают валидную инфу при флаге=true и нейтрально пустую при флаге=false (бекенд не создаёт token-orders → списки пусты). Финальная очистка — Phase C T31.
  - _Validates: Requirements 2.7._

- [x] 12. **Master_PWA: упростить wallet/balance/orders при флаге=false** (M)
  - `pages/wallet.tsx` — при `!flags.token_model_enabled` показывать только `balance` (рубли), скрыть tokens UI.
  - `pages/balance.tsx` — то же.
  - `pages/orders.tsx` — убрать "Стоимость заявки X токенов" под флагом.
  - При флаге=true — старое поведение.
  - _Note_: Создан `hooks/useFeatureFlags.ts` для master-pwa (lightweight без tanstack/react-query). В `home.tsx` OrderDetailSheet использует `isTokenOrder = flags.token_model_enabled && order.paymentModel === "token"` — все 4 ветки рендера react на этот флаг (стоимость, недостаток баланса, кнопка "Откликнуться (X т.)"). В `orders.tsx` — `canRequestRefund` теперь требует флаг = true. UI деградирует чисто при флаге off. Полная очистка — Phase C T32.
  - _Validates: Requirements 2.8._

- [ ] 13. **CRM: страница `/admin/token-migration` для управления grants** (L)
  - Создать `artifacts/crm/src/pages/admin/token-migration.tsx`.
  - Список мастеров с `tokensBalance > 0`. Для каждого — кнопка "Создать grant" с amount + reason.
  - Кнопка "Запустить dry-run" → POST /admin/token-migration/dry-run → показать `preflight` + `willApply`.
  - Read-only после Phase B (показывать `appliedAt` для каждого grant).
  - _Validates: Requirements 4.2._

- [ ] 14. **API: admin endpoints для grants** (M)
  - Новый файл `routes/admin-token-migration.ts` (или extend `orders.ts`).
  - `GET /api/admin/token-migration/masters-with-balance` — список с tokensBalance > 0.
  - `POST /api/admin/token-migration/grants` — create/update grant.
  - `DELETE /api/admin/token-migration/grants/:id` — удалить если `appliedAt IS NULL`.
  - `POST /api/admin/token-migration/dry-run` — child_process запуск migration script с `dry-run`, парсинг json log, return.
  - Auth: `requireRole("admin")`.
  - _Validates: Requirements 4.3._

- [ ] 15. **Smoke test для Phase A локально** (S)
  - Прогнать локально: `pnpm test`, `pnpm typecheck`, `pnpm build` зелёные.
  - Стартовать api-server, флаг = true → проверить что ничего не сломалось (старое поведение).
  - Установить флаг = false через SQL → перезапустить (или подождать TTL) → проверить:
    - GET /api/wallet/my → 404
    - POST /api/leads (с любым paymentModel в body) → создан commission lead
    - Master-pwa wallet UI без tokens (визуальная проверка)
  - Зафиксировать checklist для деплоя.
  - _Validates: Phase A acceptance._

> ✅ **После 1–15**: коммит, push, redeploy. Флаг остаётся = true в проде. Затем — flip через SQL и 7+ дней мониторинга.

- [ ] 16. **Phase A flip в проде** (S)
  - SQL: `INSERT INTO system_settings (key, value, updated_at) VALUES ('token_model_enabled', 'false', NOW()) ON CONFLICT (key) DO UPDATE SET value = 'false', updated_at = NOW();`
  - Подождать 60с (TTL).
  - Smoke check: `GET /api/wallet/my` → 404. Создание lead works.
  - Мониторить **минимум 7 дней** (D9): логи, ошибки, реакция операторов.
  - Зафиксировать в комментарии деплоя что Phase A работает.
  - _Validates: Requirements 5 (rollback), D9._

---

### Phase B — Migration script (после Phase A стабилен 7+ дней)

Цель: подготовить БД к финальному cleanup. Закрыть pending refunds, проставить credit limits, применить admin's grants.

- [ ] 17. **Migration script `scripts/src/migrate-remove-tokens.ts` — структура + preflight** (M)
  - Создать файл по структуре из design.md § Migration Script.
  - Реализовать `preflight(ctx)`: проверка флага, 7-day window, pending refunds count, masters with balance, masters without grant, open token-orders.
  - Поддержка `--force` override для `flagDisabledForDays` check.
  - НЕ обходит `mastersWithoutGrant` через --force (риск потерять баланс).
  - _Validates: Requirements 3.3 step 1-2._

- [ ] 18. **Migration script: `approveRefunds(ctx)`** (M)
  - Для каждого pending `wallet_transactions { type: 'refund', status: 'pending' }`:
    - В транзакции: `tokensBalance += |tokensAmount|`, `tx.status = 'completed'`.
    - Если `tx.orderId IS NOT NULL`: `orders.masterId = NULL`, `orders.status = 'waiting_master'`.
  - dry-run: только лог, без изменений.
  - _Validates: Requirements 3.3 step 3, Property 3, D4._

- [ ] 19. **Migration script: `setCreditLimits(ctx)`** (S)
  - SQL: `UPDATE master_wallet SET credit_limit = 1500 WHERE credit_tokens_issued > 0 AND credit_limit < 1500`.
  - Лог количества затронутых строк.
  - _Validates: Requirements 3.3 step 4, Property 4, D6._

- [ ] 20. **Migration script: `applyBalanceGrants(ctx)`** (M)
  - SELECT всех `master_balance_grants WHERE applied_at IS NULL`.
  - Для каждого — в транзакции:
    - `master_wallet.balance += grant.amount`
    - `master_wallet.totalTopups += grant.amount`
    - `master_wallet.tokensBalance = 0` (обнуление после grant)
    - `grant.appliedAt = NOW()`
  - _Validates: Requirements 3.3 step 5, Property 5, D1._

- [ ] 21. **Migration script: `cancelOpenTokenOrders(ctx)`** (S)
  - SELECT `orders WHERE paymentModel = 'token' AND status NOT IN ('completed','cancelled','cancellation_requested') AND deleted_at IS NULL`.
  - Каждый — `status = 'cancelled'`, refund уже обработан в step 3.
  - _Validates: Requirements 3.3 step 6, Property 6._

- [ ] 22. **Migration script: финализация + log file** (S)
  - `markCompleted(ctx)`: `INSERT INTO system_settings (key, value) VALUES ('token_migration_completed_at', NOW()::text)`.
  - Запись финального лога в `scripts/logs/migrate-remove-tokens-<timestamp>.json`.
  - Exit code = 0 при success, 1 при errors.
  - _Validates: Requirements 7.1._

- [ ] 23. **Unit-тесты для migration script preflight** (S)
  - `__tests__/migrateRemoveTokens.test.ts` — проверки preflight без БД (через mock или pure-helpers).
  - Кейсы: flag не выключен, flag выключен <7 дней, masters без grant, --force override.
  - _Validates: Property 5._

- [ ] 24. **Phase B prep: admin создаёт grants для 2 мастеров** (S)
  - Открыть CRM `/admin/token-migration`.
  - Для каждого мастера с `tokensBalance > 0` — создать grant с amount и reason.
  - Запустить dry-run, проверить `preflight.errors = []`, `willApply` числа корректны.
  - _Validates: Requirements 4.2, D1, D10._

- [ ] 25. **Phase B apply** (S)
  - Backup БД через Railway Postgres dashboard (manual backup).
  - Запустить: `pnpm --filter @workspace/scripts exec tsx scripts/src/migrate-remove-tokens.ts apply`.
  - Проверить exit code = 0.
  - Проверить `system_settings.token_migration_completed_at` установлен.
  - Проверить Properties 3, 4, 5, 6 через SQL.
  - Мониторить **7 дней** (D9).
  - _Validates: Phase B acceptance._

---

### Phase C — Schema cleanup (после Phase B стабилен 7+ дней)

Цель: удалить deprecated таблицы/колонки/код. Audit-таблицы остаются 90 дней.

- [ ] 26. **Schema migration: DROP таблиц + колонок** (M)
  - Сгенерить миграцию: `pnpm --filter @workspace/db exec drizzle-kit generate --name=remove_token_model`.
  - Hand-edit SQL: DROP TABLE wallet_transactions, service_token_prices, service_token_rules, city_token_multipliers, token_packages, master_active_packages, master_balance_grants.
  - DROP COLUMN: master_wallet (8 колонок), orders (3 колонки), leads (1 колонка) — см. design.md § Phase C.
  - НЕ DROP: token_audit_log, token_price_history (90 дней).
  - Прогнать локально: миграция применяется без ошибок.
  - _Validates: Requirements 5.1, 5.2, 5.3._

- [ ] 27. **Удалить schema-файлы** (S)
  - DELETE `lib/db/src/schema/wallet-transactions.ts`, `service-token-prices.ts`, `service-token-rules.ts`, `city-token-multipliers.ts`, `token-packages.ts`, `master-active-packages.ts`, `master-balance-grants.ts`.
  - KEEP `token-audit-log.ts`, `token-price-history.ts` (90 дней).
  - Обновить `lib/db/src/schema/index.ts` — убрать exports удалённых.
  - В `master-wallet.ts`, `orders.ts`, `leads.ts` — удалить колонки из drizzle схемы.
  - _Validates: Requirements 5.1, D8._

- [ ] 28. **Удалить `routes/wallet.ts` и `lib/tokenWallet.ts`** (M)
  - DELETE `artifacts/api-server/src/routes/wallet.ts` — все 25+ endpoints исчезают.
  - DELETE `artifacts/api-server/src/lib/tokenWallet.ts`.
  - Убрать `app.use("/api/wallet", walletRouter)` из `routes/index.ts`.
  - _Validates: Requirements 5.4._

- [ ] 29. **Удалить CRM token-pages + admin migration page** (S)
  - DELETE `artifacts/crm/src/pages/token-analytics.tsx`, `token-masters.tsx`, `token-purchases.tsx`, `token-refunds.tsx`, `token-settings.tsx`.
  - DELETE `artifacts/crm/src/pages/admin/token-migration.tsx` (отслужила).
  - Убрать routes из `App.tsx`, sidebar пункты.
  - _Validates: Requirements 5.4._

- [ ] 30. **Очистить `if (paymentModel === "token")` branches** (L)
  - В `master-pwa.ts:respond` — упростить, убрать `isCommissionOrder` flag, всегда service fee.
  - В `master-pwa.ts:resend` — убрать ветку `client_site + token`.
  - В `dashboard-action-items.ts` — удалить 4 token-tasks блоки целиком (не за флагом).
  - В `routes/orders.ts` — удалить `if (avito_partner) paymentModel = "token"` (под флагом был, теперь физически удаляем).
  - В `routes/leads.ts`, `client.ts`, `partner-pwa.ts` — удалить `paymentModel` параметры.
  - В `lib/fomoBlock.ts`, `dispatcherAI.ts`, `broadcastOrder.ts` — проверить и почистить если есть.
  - В `routes/work-board.ts`, `work-board-table.ts` — удалить paymentModel колонку из card response.
  - Поиск через `grep -r "paymentModel" artifacts/api-server/src` — должно остаться 0 ссылок (кроме comments).
  - _Validates: Requirements 5.5._

- [ ] 31. **Очистить CRM: удалить paymentModel UI и imports** (M)
  - В `CreateLeadModal.tsx`, `EditLeadModal.tsx` — удалить toggle `paymentModel`.
  - В `OrderPanel.tsx` — удалить блок `tokensCharged`/`manualTokenCost`/💎 бейдж.
  - В `work-board-table.tsx` — удалить колонку, фильтр.
  - В `OrdersWorkspace.tsx` — удалить filter.
  - В `pages/masters.tsx`, `finance.tsx` — удалить token UI.
  - Поиск: `grep -r "tokensCharged\|tokensBalance\|paymentModel" artifacts/crm/src` — 0 ссылок.
  - _Validates: Requirements 5.5._

- [ ] 32. **Очистить Master_PWA: упростить wallet/balance/orders** (M)
  - `pages/wallet.tsx` — убрать ветку `flags.token_model_enabled`, оставить только рублёвый balance.
  - `pages/balance.tsx` — упростить.
  - `pages/orders.tsx` — удалить `tokensCharged` из карточки.
  - Поиск: `grep -r "tokens" artifacts/master-pwa/src` — должно остаться только касательно `token` в `tokenModelGuard` references (no, мы их убрали) или 0.
  - _Validates: Requirements 5.5._

- [ ] 33. **Удалить `tokenModelGuard.ts` и feature-flag references** (S)
  - DELETE `lib/tokenModelGuard.ts`.
  - В `routes/system.ts` — удалить `'token_model_enabled'` из whitelist (флаг больше не нужен).
  - В `useFeatureFlags.ts` — удалить `token_model_enabled` из interface.
  - Поиск `grep -r "isTokenModelEnabled\|token_model_enabled" artifacts/` — 0 ссылок.
  - _Validates: Requirements 5.5._

- [ ] 34. **Phase C verification** (S)
  - `pnpm typecheck` зелёный.
  - `pnpm test` зелёный (40/40 от estimate-optional-flow).
  - `pnpm build` зелёный.
  - `grep -r "paymentModel\|tokensBalance\|tokensCharged" artifacts/` — 0 ссылок (могут быть в migrations и audit/history schemas — это OK).
  - Локально стартовать api-server — миграция применяется автоматом.
  - Smoke test: создать lead, отклик, закрыть заказ — всё работает.
  - _Validates: Phase C acceptance._

- [ ] 35. **Phase C deploy** (S)
  - Backup БД.
  - Push → Railway redeploy.
  - Проверить `[migrate] drizzle migrations up to date` в логах.
  - Smoke check на проде: создать avito_partner lead → нет force на token, ровно тот же flow.
  - Мониторить ошибки 24 часа.
  - _Validates: Phase C deployed._

> ✅ После 35: фича полностью убрана из активного кода. token_audit_log + token_price_history остаются ещё 90 дней.

---

### Phase C-1 — Final cleanup audit/history (12.09.2026, через 90 дней)

- [ ] 36. **Schema migration: DROP audit/history таблиц** (S)
  - Сгенерить миграцию `0003_drop_token_audit.sql`: `DROP TABLE token_audit_log; DROP TABLE token_price_history;`.
  - DELETE `lib/db/src/schema/token-audit-log.ts`, `token-price-history.ts`.
  - Обновить `lib/db/src/schema/index.ts`.
  - _Validates: Requirements 5.2, D8._

- [ ] 37. **Phase C-1 deploy** (S)
  - Backup БД.
  - Push → deploy → проверить миграция применилась.
  - _Validates: Final cleanup._

---

### Final Verification

- [ ] 38. **End-to-end smoke + документация** (M)
  - Полный сценарий: создать avito_partner lead → отклик мастера → закрыть. Никакого упоминания токенов нигде.
  - Обновить `replit.md` — убрать упоминания токенов или переместить в секцию "Legacy (removed)".
  - Закрыть spec, перевести status в `Complete`.
  - _Validates: All Phases acceptance._


## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "phase": "A", "tasks": [1, 2], "description": "Schema migration grants + tokenModelGuard — параллельно" },
    { "wave": 2, "phase": "A", "tasks": [3, 4], "description": "Tests + feature-flags расширение" },
    { "wave": 3, "phase": "A", "tasks": [5, 6, 7, 8, 9], "description": "Backend write-paths за флагом — параллельно" },
    { "wave": 4, "phase": "A", "tasks": [10, 11, 12], "description": "CRM + Master_PWA UI hide — параллельно" },
    { "wave": 5, "phase": "A", "tasks": [13, 14], "description": "Admin migration UI + API" },
    { "wave": 6, "phase": "A", "tasks": [15], "description": "Smoke test" },
    { "wave": 7, "phase": "A", "tasks": [16], "description": "Phase A flip в проде + 7d мониторинг" },
    { "wave": 8, "phase": "B", "tasks": [17, 18, 19, 20, 21, 22], "description": "Migration script — последовательно" },
    { "wave": 9, "phase": "B", "tasks": [23], "description": "Tests" },
    { "wave": 10, "phase": "B", "tasks": [24], "description": "Admin создаёт grants" },
    { "wave": 11, "phase": "B", "tasks": [25], "description": "Phase B apply + 7d мониторинг" },
    { "wave": 12, "phase": "C", "tasks": [26, 27], "description": "Schema migration + удаление schema-файлов" },
    { "wave": 13, "phase": "C", "tasks": [28, 29], "description": "Удаление wallet/tokenWallet + CRM pages" },
    { "wave": 14, "phase": "C", "tasks": [30, 31, 32, 33], "description": "Очистка branches + UI + guard — параллельно" },
    { "wave": 15, "phase": "C", "tasks": [34, 35], "description": "Verification + deploy" },
    { "wave": 16, "phase": "C-1", "tasks": [36, 37], "description": "Через 90 дней — DROP audit/history" },
    { "wave": 17, "phase": "final", "tasks": [38], "description": "E2E + docs" }
  ],
  "criticalPath": [1, 2, 5, 8, 16, 17, 25, 26, 28, 30, 35],
  "phaseGates": {
    "phaseAComplete": [16],
    "phaseBComplete": [25],
    "phaseCComplete": [35]
  }
}
```

### Текстовая визуализация

```
Phase A:
  T1 (schema grants) ──▶ T2 (guard) [параллельно] ──▶ T3 (tests) ──▶ T4 (feature-flags)
  T5–T9 (backend hide) ─────▶ T10–T12 (UI hide) ─────▶ T13–T14 (admin)
  T15 (smoke) ──▶ T16 (flip + 7d мониторинг)

Phase B (требует T16 done + 7+ дней):
  T17 (preflight) ──▶ T18, T19, T20, T21 (по шагам) ──▶ T22 (finalize) ──▶ T23 (tests)
  T24 (admin grants) ──▶ T25 (apply + 7d мониторинг)

Phase C (требует T25 done + 7+ дней):
  T26 (drop schema) ──▶ T27 (delete files)
  T28 (wallet) ──▶ T29 (CRM pages)
  T30 (branches) ──▶ T31 (CRM UI) ──▶ T32 (PWA UI) ──▶ T33 (guard cleanup)
  T34 (verify) ──▶ T35 (deploy)

Phase C-1 (через 90 дней):
  T36 (drop audit/history) ──▶ T37 (deploy)

Final:
  T38 (E2E + docs)
```

**Критический путь**: T1 → T2 → T5 → T8 → T16 → T17 → T25 → T26 → T28 → T30 → T35.

**Параллельность**:
- В Phase A: backend write-paths (T5-T9) могут идти параллельно после guard (T2). UI hide (T10-T12) тоже параллельно.
- В Phase C: branches cleanup (T30-T33) параллельно после schema migration (T26-T27).
- В Phase B: migration script — последовательный, шаги зависимы.

## Notes

- **Не реализуем код до явного подтверждения пользователя.** После tasks.md — следующий шаг = "ОК, поехали Phase A".
- **Между фазами** — обязательная продакшн-проверка (7 дней минимум).
- **Тесты**: используем существующий `node:test` runner (paymentState/agreementValidation паттерн).
- **Балансы 2 мастеров (D1)**: admin создаёт `master_balance_grants` через CRM admin UI ДО Phase B apply.
- **Уведомления мастерам (D10)**: user-side. После Phase B admin сам пишет 2 мастерам в push/MAX о новых балансах.
- **Avito API (D2)**: контракт не меняется. Backend перестаёт форсить token при `source = "avito_partner"`.
- **`tokenWallet.ts` уже deprecated** — никем не импортируется, физически файл удаляется в Phase C (T28).
- **token_audit_log + token_price_history**: остаются 90 дней read-only (D8). Финальный DROP — Phase C-1 (T36-T37).
- **Если в процессе появятся новые open questions** — фиксируем как `## Discovered Issues` и согласовываем.
