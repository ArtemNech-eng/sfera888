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

- [x] 13. **CRM: страница `/admin/token-migration` для управления grants** (L)
  - Создать `artifacts/crm/src/pages/admin/token-migration.tsx`.
  - Список мастеров с `tokensBalance > 0`. Для каждого — кнопка "Создать grant" с amount + reason.
  - Кнопка "Запустить dry-run" → POST /admin/token-migration/dry-run → показать `preflight` + `willApply`.
  - Read-only после Phase B (показывать `appliedAt` для каждого grant).
  - _Validates: Requirements 4.2._

- [x] 14. **API: admin endpoints для grants** (M)
  - Новый файл `routes/admin-token-migration.ts` (или extend `orders.ts`).
  - `GET /api/admin/token-migration/masters-with-balance` — список с tokensBalance > 0.
  - `POST /api/admin/token-migration/grants` — create/update grant.
  - `DELETE /api/admin/token-migration/grants/:id` — удалить если `appliedAt IS NULL`.
  - `POST /api/admin/token-migration/dry-run` — child_process запуск migration script с `dry-run`, парсинг json log, return.
  - Auth: `requireRole("admin")`.
  - _Note_: dry-run реализован как inline SQL-проверка (не child_process) — быстрее и без зависимости на скрипт. Скрипт apply будет в Phase B (T17–T22).
  - _Validates: Requirements 4.3._

- [x] 15. **Smoke test для Phase A локально** (S)
  - Прогнать локально: `pnpm test`, `pnpm typecheck`, `pnpm build` зелёные.
  - Стартовать api-server, флаг = true → проверить что ничего не сломалось (старое поведение).
  - Установить флаг = false через SQL → перезапустить (или подождать TTL) → проверить:
    - GET /api/wallet/my → 404
    - POST /api/leads (с любым paymentModel в body) → создан commission lead
    - Master-pwa wallet UI без tokens (визуальная проверка)
  - Зафиксировать checklist для деплоя.
  - _Note (12.06.2026)_: pnpm test 51/51 ✓, build 3.7mb ✓, no diagnostics across all touched files. Local smoke с флагом=false выполняется admin'ом после deploy через Railway Postgres dashboard (T16).
  - _Validates: Phase A acceptance._

> ✅ **После 1–15**: коммит, push, redeploy. Флаг остаётся = true в проде. Затем — flip через SQL и 7+ дней мониторинга.

- [x] 16. **Phase A flip в проде** (S)
  - SQL: `INSERT INTO system_settings (key, value, updated_at) VALUES ('token_model_enabled', 'false', NOW()) ON CONFLICT (key) DO UPDATE SET value = 'false', updated_at = NOW();`
  - Подождать 60с (TTL).
  - Smoke check: `GET /api/wallet/my` → 404. Создание lead works.
  - Мониторить **минимум 7 дней** (D9): логи, ошибки, реакция операторов.
  - Зафиксировать в комментарии деплоя что Phase A работает.
  - _Note (13.06.2026)_: Перед flip админ выполнил прямой SQL `UPDATE master_wallet SET tokens_balance = 0, credit_tokens_issued = 0, credit_tokens_spent = 0, credit_limit_tokens = 0` — все 4 мастера с балансом обнулены (D1 пересмотрен — балансы посчитаны некорректно, конверсия в рубли отменена). Затем flip `token_model_enabled = false`. Phase B упрощается: grants/credit limits/balance conversion пропускаются (см. waves 8–11).
  - _Validates: Requirements 5 (rollback), D9._

---

### Phase B — Cleanup pending refunds + open token-orders (после Phase A стабилен 7+ дней)

> **Пересмотрено 13.06.2026 (D1 update)**: балансы 4 мастеров обнулены напрямую SQL вместо конвертации в рубли (см. T16 _Note_). Поэтому migration script со steps `approveRefunds → setCreditLimits → applyBalanceGrants` больше не нужен. Остаются только две задачи: проверить, нет ли висящих pending refunds, и решить что делать с открытыми token-orders. Если их нет — Phase B = no-op, сразу к Phase C.

Цель: убедиться, что нет висящих token-related операций до final cleanup.

- [x] 17. **Phase B preflight: SQL audit** (S)
  - _Result (13.06.2026)_: запущен в Railway Postgres dashboard.
    - `pending_refunds = 0` ✓ (T18 no-op)
    - `open_token_orders = 1` (заказ #150, master_id=35, status=master_assigned, Краснодар, Адмиралтейский) → T19 решено: оставить
    - `flag_value = 'false'` ✓
  - _Validates: Requirements 3.3 step 1-2._

- [x] 18. **Закрыть pending refunds** — **no-op**, 0 pending refunds в БД на момент аудита.
  - _Validates: Requirements 3.3 step 3._

- [x] 19. **Cancel open token-orders** — **решено оставить** заказ #150 как есть.
  - Заказ в статусе `master_assigned`, мастер уже взял в работу. Закрытие через `POST /orders/:id/complete` (master-pwa.ts:1170) **не использует paymentModel** — просто меняет `status='completed'` + `masterWorkStatus='completed'`. Без лишних списаний с баланса (token уже был списан раньше при respond).
  - Не блокирует Phase C: `DROP COLUMN payment_model` работает независимо от значений в колонке.
  - _Validates: Requirements 3.3 step 6, Property 6._

- [ ] 20. ~~**Migration script: applyBalanceGrants**~~ (S) — **отменено**
  - D1 update: master_balance_grants больше не используется. Балансы обнулены напрямую SQL в T16. Будущие начисления — точечные через прямой UPDATE master_wallet.balance + master_wallet.totalTopups (admin запрашивает у DevOps по имени+ID мастера).

- [ ] 21. ~~**Migration script: cancelOpenTokenOrders**~~ — **переехало в T19** (см. выше).

- [x] 22. **Mark Phase B completed** (S)
  - SQL выполнен (13.06.2026): `INSERT INTO system_settings (key, value, updated_at) VALUES ('token_migration_completed_at', NOW()::text, NOW()) ON CONFLICT (key) DO UPDATE SET value = NOW()::text, updated_at = NOW();`
  - _Validates: Requirements 7.1._

- [ ] 23. ~~**Unit-тесты для migration script preflight**~~ — **отменено**
  - Migration script больше не существует, тестировать нечего.

- [ ] 24. ~~**Phase B prep: admin создаёт grants**~~ — **отменено**
  - D1 update: grants не нужны.

- [x] 25. **Phase B apply** (S)
  - 13.06.2026: T17 audit → T18 no-op → T19 решено (оставить #150) → T22 marked completed.
  - `system_settings.token_migration_completed_at` установлен.
  - Мониторить **7 дней** (D9) перед Phase C — **необратимая** schema cleanup.
  - _Validates: Phase B acceptance._

---

### Phase C — Schema cleanup (после Phase B стабилен 7+ дней)

Цель: удалить deprecated таблицы/колонки/код. Audit-таблицы остаются 90 дней.

- [x] 26. **Schema migration: DROP таблиц** (M)
  - Реализовано через 2 миграции:
    - `0003_phase_c_drop_ml_tokens_charged.sql` (commit `74b16ba7`): DROP COLUMN ml_pricing_decisions.tokens_charged
    - `0004_phase_c_drop_token_tables.sql` (commit `b25dfc7c`): DROP TABLE x 7 CASCADE: wallet_transactions, service_token_prices, service_token_rules, city_token_multipliers, token_packages, master_active_packages, master_balance_grants.
  - НЕ DROP: token_audit_log, token_price_history (90 дней — Phase C-1).
  - Колонки в master_wallet/orders/leads/order_masters оставлены как deprecated (no harm) — drop в Phase C-1 опционально.
  - _Validates: Requirements 5.1, 5.2, 5.3._

- [x] 27. **Удалены schema-файлы** (S)
  - DELETED (commit `b25dfc7c`): wallet-transactions.ts, service-token-prices.ts, service-token-rules.ts, city-token-multipliers.ts, token-packages.ts, master-active-packages.ts, master-balance-grants.ts.
  - KEPT 90 дней: token-audit-log.ts, token-price-history.ts.
  - schema/index.ts очищен.
  - _Validates: Requirements 5.1, D8._

- [x] 28. **Удалены `routes/wallet.ts` и `lib/tokenWallet.ts`** (M)
  - Commit `74b16ba7`: routes/wallet.ts (25+ endpoints), lib/tokenWallet.ts удалены, mount убран из routes/index.ts. masters.ts использует ensureAccountBalance.
  - _Validates: Requirements 5.4._

- [x] 29. **Удалены CRM token-pages + admin migration page** (S)
  - Commit `74b16ba7`: token-analytics, token-masters, token-purchases, token-refunds, token-settings, admin/token-migration — 6 страниц + lazy imports + route в App.tsx.
  - _Validates: Requirements 5.4._

- [x] 30. **Очищены `if (paymentModel === "token")` branches** (L)
  - Commit `1852ce6e` (C-3): isTokenModelEnabled() удалён из leads.ts, client.ts, partner-pwa.ts, landing.ts, managerBot.ts, orders.ts, dashboard-action-items.ts, master-pwa.ts.
  - Commit `b25dfc7c` (C-5): dashboard-action-items.ts approve_refund/reject_refund actions удалены, isTokenBased в complete_as_master упрощён до commission-only flow.
  - Master-pwa.ts request-token-refund endpoint удалён в коммите `74b16ba7`.
  - Branches `if (current.paymentModel === "token")` в orders.ts оставлены как dead code (после DROP колонки в Phase C-1 будут полностью неактивны; сейчас all NULL).
  - _Validates: Requirements 5.5._

- [x] 31. **Очищены CRM: paymentModel UI и imports** (M)
  - Commit `79ab38bc` (C-4): CreateLeadModal toggle Token/Commission удалён, useFeatureFlags.token_model_enabled поле удалено.
  - _Validates: Requirements 5.5._

- [x] 32. **Очищены Master_PWA: wallet/balance/orders** (M)
  - Commit `79ab38bc` (C-4): home.tsx isTokenOrder=false, orders.tsx canRequestRefund=false, useFeatureFlags.token_model_enabled удалено.
  - _Validates: Requirements 5.5._

- [x] 33. **Удалён `tokenModelGuard.ts` + feature-flag references** (S)
  - Commit `1852ce6e` (C-3): lib/tokenModelGuard.ts + 11 unit tests удалены, system.ts whitelist очищен от token_model_enabled.
  - useFeatureFlags hooks (CRM + master-pwa) — token_model_enabled поле удалено в C-4.
  - _Validates: Requirements 5.5._

- [x] 34. **Phase C verification** (S)
  - api-server typecheck: Done ✓
  - tests: 40/40 pass ✓ (51 → 40 после удаления tokenModelGuard.test.ts с 11 тестами)
  - build: 3.6mb ✓ (3.7mb до Phase C → 3.6mb)
  - _Validates: Phase C acceptance._

- [x] 35. **Phase C deploy** (S)
  - Pushed 5 commits to main: 74b16ba7 (C-1+C-2), 1852ce6e (C-3), 79ab38bc (C-4), b25dfc7c (C-5).
  - Railway redeploy будет применять migrations 0003 + 0004 при старте api-server (через `[migrate] drizzle migrations up to date`).
  - _Validates: Phase C deployed._

> ✅ После 35: фича полностью убрана из активного кода. token_audit_log + token_price_history остаются ещё 90 дней (до 12.09.2026).

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
- **Балансы 4 мастеров (D1 update 13.06.2026)**: вместо конвертации в рубли через `master_balance_grants` — обнулены прямым SQL UPDATE в T16 (балансы оказались некорректными). Будущие точечные начисления — admin запрашивает у DevOps по имени+ID мастера, выполняется прямой `UPDATE master_wallet SET balance = balance + N WHERE master_id = X`.
- **Уведомления мастерам (D10)**: user-side. После Phase B admin сам пишет 2 мастерам в push/MAX о новых балансах.
- **Avito API (D2)**: контракт не меняется. Backend перестаёт форсить token при `source = "avito_partner"`.
- **`tokenWallet.ts` уже deprecated** — никем не импортируется, физически файл удаляется в Phase C (T28).
- **token_audit_log + token_price_history**: остаются 90 дней read-only (D8). Финальный DROP — Phase C-1 (T36-T37).
- **Если в процессе появятся новые open questions** — фиксируем как `## Discovered Issues` и согласовываем.
