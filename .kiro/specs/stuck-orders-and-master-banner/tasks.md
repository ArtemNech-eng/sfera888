# Tasks — Зависшие заказы и баннер «нужен результат»

Каждая задача = один логический коммит. Порядок строгий: миграция → схема → lib → endpoints → cron → UI → wire-up.

---

## 1. БД и схема

- [ ] **1.1 Миграция `0012_stuck_orders.sql`**
  - Создать файл `lib/db/migrations/0012_stuck_orders.sql` с DDL из design.md (две колонки + два partial-индекса)
  - Зарегистрировать в `lib/db/migrations/meta/_journal.json` (idx 12, tag `0012_stuck_orders`, текущий timestamp)
  - Проверить: `pnpm exec tsc --build --force lib/db` собирается
  - Refs: R9

- [ ] **1.2 Обновить schema `orders.ts`**
  - В `lib/db/src/schema/orders.ts` добавить:
    - `clientCallReportedAt: timestamp("client_call_reported_at")`
    - `bannerSnoozedUntil: timestamp("banner_snoozed_until")`
  - Пересобрать lib/db (`pnpm exec tsc --build --force lib/db`)
  - Проверить: api-server typecheck зелёный
  - Refs: R9

---

## 2. Core library

- [ ] **2.1 Создать `lib/stuckOrders.ts`**
  - Файл `artifacts/api-server/src/lib/stuckOrders.ts`
  - Экспорт типов: `StuckCategory`, `StuckOrderItem`
  - Функция `classifyOrder(order, ctx): StuckCategory | null` с правилами R0–R4 (приоритет в design.md)
  - Хелперы загрузки контекста: `loadClassifyContext(orderIds)` → `{txByOrderId, partialsByTx, recentMessagesByOrder}`
  - Функции `getPendingActionsForMaster(masterId)`, `getAllStuckOrders()`
  - Constants: `CALL_REPORT_THRESHOLD_HOURS = 24`, `RESULT_THRESHOLD_DAYS = 7`, `COMMISSION_THRESHOLD_DAYS = 7`, `ZOMBIE_THRESHOLD_DAYS = 14`
  - api-server typecheck зелёный
  - Refs: R0, R1, R2, R3, R4

- [ ] **2.2 Юнит-проверка classifyOrder в REPL/scratch**
  - Не пишем тесты (юзер сказал не делать тестов без явного запроса)
  - Просто скриптом в `artifacts/api-server/src/scratch-classify.ts` (потом удалить) — пройти 5 кейсов вручную: только-что-принят / >24ч без отчёта / 8 дней без фото / completed без orderAmount / 15 дней молчания. Удалить файл после проверки.
  - Refs: R0–R4

---

## 3. Endpoints — backend

- [ ] **3.1 `GET /api/orders/stuck`**
  - В `artifacts/api-server/src/routes/orders.ts` добавить роут (использует `getAllStuckOrders`)
  - Поддержка query-параметров: `?category=<key>&masterId=<id>&city=<str>&limit=<n>` (опциональные)
  - Возвращает `{counts, items}` как в design.md
  - api-server typecheck зелёный
  - Refs: R7.1, R6

- [ ] **3.2 `GET /api/master-pwa/pending-actions`**
  - В `artifacts/api-server/src/routes/master-pwa.ts` добавить роут
  - Использует `getPendingActionsForMaster(masterId)`, фильтрует только R0/R1/R3, отсекает заснузленные
  - Возвращает массив DTO `{orderId, type, title, ctaText, daysStuck, city, serviceType, snoozedUntil}`
  - Refs: R7.2, R5

- [ ] **3.3 `POST /api/master-pwa/orders/:id/snooze-banner`**
  - В master-pwa.ts: проверка ownership → `UPDATE orders SET banner_snoozed_until = NOW() + 24h`
  - 404 если заказ не принадлежит мастеру
  - Refs: R7.3, R5.5

- [ ] **3.4 `POST /api/master-pwa/orders/:id/call-report`**
  - В master-pwa.ts:
    - Body: `{ scheduledAt?: ISO date, note?: string }`
    - UPDATE: `client_call_reported_at = NOW()`, опционально `scheduled_at`
    - INSERT в `master_messages` сообщение «📅 Замер согласован: ...» либо «📞 Отчёт о созвоне: ...»
    - 404 если не его заказ
  - Refs: R7.5, R0.2

- [ ] **3.5 `POST /api/orders/:id/remind-master`**
  - В orders.ts: проверка статуса застрял → `sendPushToMaster` с текстом по категории
  - Доступ admin / master_operator
  - 400 если заказ не застрял или нет masterId
  - Refs: R7.4

---

## 4. Cron

- [ ] **4.1 `dailyMasterReminderCron`**
  - Файл `artifacts/api-server/src/lib/dailyMasterReminderCron.ts`
  - Функция `dailyMasterReminder()` — обходит активных мастеров, считает pending-actions, шлёт push если есть незаснузленные
  - Регистрация в существующей cron-инфраструктуре (выяснить в `artifacts/api-server/src/index.ts` — обычно `node-cron` либо `setInterval`). Расписание: `0 7 * * *` UTC = 10:00 МСК
  - Защита от дублей в один день: in-memory Set masterId → последняя дата отправки
  - Refs: R8

---

## 5. CRM — operator-side UI

- [ ] **5.1 Создать `StuckOrdersBlock.tsx`**
  - Файл `artifacts/crm/src/components/dashboard/StuckOrdersBlock.tsx`
  - 5 карточек по категориям (CATEGORY_CONFIG из design.md) — счётчики из `/api/orders/stuck`
  - Клик по карточке → `setLocation('/orders/stuck?category=<key>')`
  - `useQuery` с `refetchInterval: 60_000`
  - Skeleton при isLoading
  - crm typecheck зелёный
  - Refs: R6.1, R6.2

- [ ] **5.2 Заменить ActionItemsBlock на StuckOrdersBlock в dashboard**
  - В `artifacts/crm/src/pages/dashboard.tsx`: убрать импорт `ActionItemsBlock`, вставить `StuckOrdersBlock`
  - `ActionItemsBlock.tsx` оставить на диске (deprecated comment), не удалять — могут быть отсылки откуда-то ещё
  - Refs: R6, R10.1

- [ ] **5.3 Создать страницу `/orders/stuck`**
  - Файл `artifacts/crm/src/pages/orders-stuck.tsx`
  - Tabs/pills вверху для переключения между 5 категориями (`?category=<key>`)
  - Таблица с колонками: `#`, `Мастер`, `Клиент`, `Город`, `Услуга`, `Висит N дн.`, `Действия`
  - Для R0 в строке: «✓ Отчёт: <дата>; замер <дата>» если есть
  - Действия в строке:
    - «Напомнить» → `POST /api/orders/:id/remind-master`
    - «Карточка мастера» → открывает `MasterDrawer` (логика как в `checkins.tsx`)
    - «Открыть заказ» → `setLocation('/leads?tab=work&highlight=<id>')`
    - «Отменить» (только zombie) → prompt причины → `PATCH /api/orders/:id` с `status: cancelled, cancelReason`
  - Фильтры: автокомплит мастера, селект города (берутся из текущей выборки)
  - Сортировка по `daysStuck DESC`
  - Refs: R6.3, R6.4, R6.5, R6.7, R6.8

- [ ] **5.4 Регистрация маршрута `/orders/stuck`**
  - В `artifacts/crm/src/App.tsx` (или routes-файле) добавить `<Route path="/orders/stuck" component={OrdersStuckPage} />`
  - crm typecheck зелёный
  - Smoke: открыть в браузере, увидеть таблицу
  - Refs: R6

---

## 6. PWA — master-side UI

- [ ] **6.1 Найти структуру PWA**
  - Проверить, где живёт master-PWA (отдельный пакет `master-pwa` или внутри `marketplace`/`crm`).
  - Зафиксировать решение в коде комментарием. Дальше — в этом каталоге.
  - Refs: R5

- [ ] **6.2 Создать `PendingActionsBanner.tsx`**
  - Модальный баннер с overlay
  - `useQuery` `/api/master-pwa/pending-actions`
  - Если data.length > 0 — рендер, иначе null
  - Карточки по action: title + daysStuck + кнопка ctaText
  - Кнопка «Напомнить позже» внизу — параллельные `POST /snooze-banner` для всех заказов в баннере
  - Клик по action: для `call_report` — открыть `CallReportModal`; для других — `setLocation('/orders/<id>#<anchor>')`
  - Refs: R5.1, R5.2, R5.3, R5.4, R5.5

- [ ] **6.3 Создать `CallReportModal.tsx`**
  - Radio: «Замер согласован» / «Не дозвонился / нужно ещё созвониться»
  - Если «согласован» — datetime picker → ставит scheduledAt
  - Текстовое поле note (необязательное)
  - Submit → `POST /api/master-pwa/orders/:id/call-report` с `{scheduledAt, note}`
  - Invalidate `pending-actions` на success
  - Refs: R7.5, R0.2

- [ ] **6.4 Подключить баннер на главный экран PWA**
  - Найти `home`-страницу мастер-PWA и вставить `<PendingActionsBanner />` поверх контента
  - Smoke: залогиниться мастером с застрявшим заказом → увидеть баннер
  - Refs: R5

---

## 7. Smoke и финальные правки

- [ ] **7.1 End-to-end smoke**
  - Создать тест-заказ: назначить тест-мастеру, поставить `assigned_at = NOW() - 25 hours`, `client_call_reported_at = NULL`
  - В CRM `/dashboard` увидеть «Нет отчёта о созвоне: 1»
  - Перейти `/orders/stuck?category=needs_call_report` — увидеть заказ в таблице
  - Залогиниться мастером в PWA → увидеть баннер «Отчитаться о созвоне»
  - Заполнить отчёт → сохранить
  - В CRM master-chat появилось «📅 Замер согласован: ...»
  - В CRM `/orders/stuck` категория опустела
  - В master PWA баннер пропал

- [ ] **7.2 Smoke по другим категориям**
  - Поднять `assignedAt = NOW() - 8 days` без фото — проверить «Ждут результата»
  - Создать transaction с `paymentStatus = pending, createdAt = NOW() - 8 days, commission > 0` — проверить «Не оплачена комиссия»
  - Создать `status = completed, proposedAmount > 0, orderAmount = NULL` — проверить «Подтвердите сумму»
  - Создать `status = in_progress, assignedAt = NOW() - 15 days, no movement` — проверить «Зомби»

- [ ] **7.3 Проверить cron вручную**
  - Триггернуть `dailyMasterReminder()` через REPL / эндпоинт-скрипт
  - Убедиться, что пуш приходит на тестового мастера
  - Удалить scratch-скрипт после проверки

- [ ] **7.4 Cleanup**
  - Удалить любые `_*.bat`, `_*-out.txt`, scratch-скрипты
  - Финальный typecheck по всем пакетам: `pnpm --filter @workspace/crm run typecheck && pnpm --filter @workspace/api-server run typecheck`

---

## Порядок коммитов (для согласования)

Группирую задачи в логические коммиты. Перед каждым — твоё «делай»:

1. `feat(db): migration 0012 — stuck-orders columns` (1.1, 1.2)
2. `feat(api): stuckOrders classifier library` (2.1)
3. `feat(api): /api/orders/stuck and /api/orders/:id/remind-master endpoints` (3.1, 3.5)
4. `feat(api): master-pwa pending-actions, snooze-banner, call-report endpoints` (3.2, 3.3, 3.4)
5. `feat(api): daily master reminder cron at 10:00 MSK` (4.1)
6. `feat(crm): StuckOrdersBlock + /orders/stuck page replaces ActionItemsBlock` (5.1, 5.2, 5.3, 5.4)
7. `feat(master-pwa): pending-actions banner + call-report modal` (6.2, 6.3, 6.4)
8. (по ходу smoke) — мелкие фиксы отдельными коммитами

---

## Не входит в этот цикл

- Тесты (если попросишь — добавим)
- Эскалация на руководителя при N днях зомби
- Авто-отмена зомби-заказов
- Конфигурируемые пороги через `system_settings`
- Email-уведомления оператору
- Adaptive-таблица под мобильные операторские (десктоп only по требованиям)
