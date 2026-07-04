# Implementation Plan

## Overview

План реализации гео-сообщества «ХочуТакже» поверх существующих активов (`api-server` на Express 5 + Drizzle + Postgres, публичный фасад Next.js 15, AI-дизайн-пайплайн, поток лидов/CRM/dispatch, Max-бот). Задачи сгруппированы по слоям дизайна: схема БД → сервисы предметной области (Geo, Feed, Zone, Moderation, Auth, AI-утилита, Notifications, SEO) → публичный фасад → интеграция и верификация. Property-based тесты (fast-check) покрывают 10 correctness properties из дизайна.

## Tasks

- [x] 1. Схема БД и миграция для гео-сообщества
  - Добавить Drizzle-схемы в `lib/db/src/schema/`: `zhk`, `community_topics`, `community_posts`, `community_accounts`, `moderation_queue`, `moderation_log`, `zhk_activity`
  - Экспортировать новые таблицы из `lib/db/src/schema/index.ts`
  - Создать аддитивную миграцию в `artifacts/api-server/migrations/2026-xx-xx-community-baseline.sql` (все столбцы nullable/с дефолтами, без изменения существующих таблиц)
  - Добавить уникальный индекс `(cityId, nameNormalized)` для дедупликации ЖК и индексы по `(cityId, zone)`, `zhkId`, `specialtyId`
  - _Requirements: 1.1, 1.6, 3.1, 4.5, 8.1, 17.2_

- [x] 2. Утилита генерации slug и её property-тест
- [x] 2.1 Реализовать `generateSlug(name, scope)` в `artifacts/api-server/src/lib/communitySlug.ts`
  - Транслитерация кириллицы → нормализация к `[a-z0-9-]` → усечение до 100 → суффикс `-N` при коллизии (проверка по `cities`, `zhk`)
  - _Requirements: 1.6_
- [x] 2.2 Написать property-тест `__tests__/community/slug.property.test.ts` (fast-check)
  - Свойство: для любого названия результат матчит `^[a-z0-9-]{1,100}$` и уникален
  - _Requirements: 1.6 (Property 1)_

- [x] 3. Geo_Service: города, ЖК, резолвинг slug
- [x] 3.1 Реализовать `GeoService` в `artifacts/api-server/src/lib/geoService.ts`
  - `getCityBySlug`, `getZhkBySlug` (404-семантика при отсутствии), отображение только заполненных атрибутов ЖК
  - _Requirements: 1.2, 1.4, 1.5, 1.7_
- [x] 3.2 Реализовать создание ЖК `createZhk` с дедупликацией и валидацией
  - Валидация имени (2–100), проверка существования City, дедуп по `nameNormalized` в пределах города, доступность Local_Feed сразу после создания
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
- [x] 3.3 Property-тест дедупликации ЖК `__tests__/community/zhk-dedup.property.test.ts`
  - Свойство: эквивалентные по trim/lower названия в одном городе не создают дубликат
  - _Requirements: 4.5 (Property 2)_
- [x] 3.4 Маршруты `/api/community/geo` в `artifacts/api-server/src/routes/community/geo.ts`
  - GET город/ЖК по slug, POST создание ЖК (уровень доступа 3), rate limiting
  - _Requirements: 1.2, 1.4, 1.5, 4.1_

- [x] 4. Feed_Service: City_Feed и Local_Feed
- [x] 4.1 Реализовать `FeedService` в `artifacts/api-server/src/lib/feedService.ts`
  - City_Feed (темы уровня города, сортировка по активности), Local_Feed (темы ЖК, сортировка по дате), пустое состояние без ошибки
  - _Requirements: 1.3, 2.1, 2.2, 2.3, 3.2, 3.3, 3.6_
- [x] 4.2 Валидация создания темы Local_Feed
  - Категория из перечня, заголовок 1–200, тело ≤5000; отклонение с сохранением ввода даже при сбое доставки ошибки; отказ при отсутствии привязки к ЖК
  - _Requirements: 3.1, 3.4, 3.5_
- [x] 4.3 Property-тест границ валидации темы `__tests__/community/topic-validation.property.test.ts`
  - Свойство: за границами → отклонение + сохранённый ввод; в границах → принятие
  - _Requirements: 3.4 (Property 5)_
- [x] 4.4 Маршруты `/api/community/feeds`
  - GET City_Feed / Local_Feed, POST темы/поста (уровень 3)
  - _Requirements: 2.1, 3.3_

- [x] 5. Zone_Service и изоляция зон
- [x] 5.1 Реализовать `ZoneService` в `artifacts/api-server/src/lib/zoneService.ts`
  - Фильтрация по `zone`, классификация чувствительного PRO-контента, детект рекламы мастера в зоне соседей
  - _Requirements: 5.1, 5.3, 6.1, 7.4, 8.1, 8.3_
- [x] 5.2 PRO-ленты: All_Russia_Feed по умолчанию и My_City_Filter
  - Дефолт All_Russia; фильтр активируется только явно, переопределяет дефолт, показывает только локальный контент; при отсутствии локальных тем — пустая лента без fallback
  - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6_
- [x] 5.3 Property-тест изоляции зон `__tests__/community/zone-isolation.property.test.ts`
  - Свойство: Sosedi-выборка не содержит pro_*, PRO-выборка не содержит sosedi
  - _Requirements: 5.3, 8.3 (Property 3)_
- [x] 5.4 Property-тест эксклюзивности My_City_Filter `__tests__/community/city-filter.property.test.ts`
  - Свойство: при фильтре — только локальные темы города (или пусто), без All_Russia
  - _Requirements: 6.4, 6.5 (Property 6)_
- [x] 5.5 Маршруты `/api/community/pro`
  - GET PRO_Public ленты по Specialty, применение My_City_Filter
  - _Requirements: 6.1, 6.2, 6.4_

- [x] 6. PRO_Protected_Layer и noindex
- [x] 6.1 Контроль доступа к закрытому слою в `ZoneService.canAccessProtected`
  - Доступ только подтверждённым мастерам; авто-выдача доступа при запросе; 403 + предложение подтвердить членство для анонимов
  - _Requirements: 7.1, 7.2, 7.3_
- [x] 6.2 Расширить `NOINDEX_PATH_PATTERNS` в `artifacts/api-server/src/app.ts` для PRO_Protected путей
  - Гарантировать `X-Robots-Tag: noindex` и исключение из sitemap
  - _Requirements: 7.2_
- [x] 6.3 Property-тест noindex закрытого слоя `__tests__/community/protected-noindex.property.test.ts`
  - Свойство: любой ответ Protected несёт noindex и отсутствует в sitemap
  - _Requirements: 7.2 (Property 4)_

- [x] 7. Moderation_Service
- [x] 7.1 Реализовать `ModerationService` в `artifacts/api-server/src/lib/moderationService.ts`
  - Проверка через `obscenity` + правила ПД/диффамации/спама; публикация возможна без модерации; вердикты allow/restrict_to_protected/unpublish/block_spam
  - _Requirements: 19.1, 19.2, 19.5_
- [x] 7.2 Границы зон и очередь модерации
  - Блок рекламы мастера в Sosedi с уведомлением только при успешной блокировке; постановка флагнутого контента в очередь; журнал действий
  - _Requirements: 8.2, 19.3, 19.4_
- [x] 7.3 Маршруты `/api/community/moderation` (для операторов/модераторов)
  - Очередь, применение действий, чтение журнала
  - _Requirements: 19.3, 19.4_

- [x] 8. Auth_Service: трёхуровневый доступ
- [x] 8.1 Публичное чтение без аутентификации
  - GET-эндпоинты лент/галереи/PRO_Public без auth; операционные отказы (rate limit/обслуживание/модерация) допустимы
  - _Requirements: 9.1, 9.2, 9.3, 9.4_
- [x] 8.2 Лид/оплата: телефон + Captcha, без Max
  - `verifyLeadContext` с Yandex SmartCaptcha; отказ+повтор при провале; Max_Login не требуется ни на одном шаге
  - _Requirements: 10.1, 10.2, 10.3, 10.4_
- [x] 8.3 Community_Account через Phone_Verification
  - Запрос/подтверждение кода, немедленная выдача полных прав, сохранение черновика при незавершённой верификации, опциональная привязка Max
  - _Requirements: 11.1, 11.2, 11.3, 11.4_
- [x] 8.4 Маршруты `/api/community/auth`
  - request/confirm phone code, link-max (optional)
  - _Requirements: 11.1, 11.2_

- [x] 9. AI_Design_Utility и лид в существующий поток
- [x] 9.1 Реализовать `AiDesignUtility` в `artifacts/api-server/src/lib/aiDesignUtility.ts`
  - Сбор параметров (метраж, стиль) до оплаты; генерация только после подтверждения оплаты через существующий пайплайн `dizajn`; визуализации+смета; draft до оплаты
  - _Requirements: 12.2, 12.3, 12.4, 12.5, 12.6, 20.3_
- [x] 9.2 Property-тест гейта оплаты `__tests__/community/payment-gate.property.test.ts`
  - Свойство: статус `generated` ⟺ оплата подтверждена
  - _Requirements: 12.3, 12.5 (Property 8)_
- [x] 9.3 Создание лида утилиты через существующую `leadsTable`
  - `source='ai_utility'`, `marketplaceContext={areaM2,style,estimateId}`, приоритетный сигнал намерения; дальнейшая обработка через Dispatch_Flow
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 20.1, 20.2_
- [x] 9.4 Property-тест единого пути лида `__tests__/community/lead-single-path.property.test.ts`
  - Свойство: каждый порождённый лид присутствует в `leads`, без параллельных путей
  - _Requirements: 20.1, 20.2 (Property 9)_
- [x] 9.5 Маршрут `/api/community/ai-utility` + виджет в шапке фасада
  - startSession, onPaymentConfirmed (через существующий `yandex-pay`), getEstimate
  - _Requirements: 12.1, 12.3_

- [x] 10. Notification_Service
- [x] 10.1 Реализовать каскад каналов в `artifacts/api-server/src/lib/communityNotifications.ts`
  - Max → Web_Push → SMS; недоступность Max не блокирует лид/оплату/индексацию
  - _Requirements: 15.1, 15.2, 15.3, 15.4_
- [x] 10.2 Property-тест детерминизма каналов `__tests__/community/notify-channel.property.test.ts`
  - Свойство: канал однозначно определяется парой (Max подключён?, важность)
  - _Requirements: 15.1, 15.2, 15.3 (Property 10)_
- [x] 10.3 Property-тест независимости денег/SEO от Max `__tests__/community/max-independence.property.test.ts`
  - Свойство: лид/оплата/индексация не отклоняются из-за недоступности Max
  - _Requirements: 10.4, 15.4 (Property 7)_

- [x] 11. SEO_Service и порог контента
- [x] 11.1 Логика порога контента и наполнения сид-данными
  - Сид-данные (застройщик/срок/корпуса), авто-темы, агрегированные цены, AI-сид для страниц ниже порога
  - _Requirements: 16.2_
- [x] 11.2 Индексируемость и sitemap на фасаде (Next.js)
  - Индексировать Sosedi_Zone и PRO_Public; не публиковать «тонкие» страницы; целевой набор ~40 городов ≥400k населения
  - _Requirements: 5.2, 6.5, 16.1, 16.3_

- [x] 12. Слой живого сообщества и метрика Living_ZhK
- [x] 12.1 Cron-агрегация активности и классификация статуса ЖК
  - Еженедельный `node-cron` job: `activeResidents >= N` → `living`, иначе явно `non_living`; приоритет сидирования новостроек стартовых городов
  - _Requirements: 17.1, 17.2, 17.4_
- [x] 12.2 Метрика Living_ZhK и общероссийский доступ мастеров
  - Отображение числа Living_ZhK отдельно от трафика; полный доступ к All_Russia_Feed мастерам вне стартовых городов
  - _Requirements: 17.3, 18.1, 18.2, 18.3_

- [x] 13. Публичный веб-фасад (Next.js 15 на chestnye-mastera.ru)
- [x] 13.1 Страницы Sosedi_Zone: `/goroda/[city]`, `/zhk/[zhk]`
  - SSR/ISR, City_Feed/Local_Feed, чистый портал без PRO-разделов, форма создания ЖК/темы
  - _Requirements: 5.1, 5.3, 8.1_
- [x] 13.2 Страницы PRO_Zone: `/pro/[specialty]` с фильтром «Мой город»
  - All_Russia по умолчанию, переключатель My_City_Filter, доступ к Protected для подтверждённых мастеров
  - _Requirements: 6.1, 6.2, 6.4_
- [x] 13.3 Слой доверия и позиционирование AI-контента
  - Признаки живого сообщества как основной слой доверия; AI-контент как вдохновение с явной пометкой «вспомогательный»; без AI-only галереи как основного доверия
  - _Requirements: 14.1, 14.2, 14.3_
- [x] 13.4 Интеграция фасада с api-server через server-to-server API
  - Никакого прямого доступа фасада к БД; все данные через API
  - _Requirements: 20.5, 20.6_

- [x] 14. Регистрация маршрутов и проверка переиспользования
- [x] 14.1 Подключить все `/api/community/*` роутеры в `artifacts/api-server/src/routes/index.ts`
  - _Requirements: 20.6_
- [x] 14.2 Тесты reuse-контракта
  - Лиды только через `leadsTable`; AI только через существующий пайплайн; Max не обязателен для денег/SEO; Master_PWA/Dispatch_Flow без изменений backend-логики
  - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.7_
- [x] 14.3 Прогнать `npm run typecheck` и весь тестовый набор `npm test` в `artifacts/api-server`
  - Убедиться, что property-тесты и unit/integration проходят
  - _Requirements: все_

## Task Dependency Graph

Волны исполнения: задачи внутри одной волны независимы и могут выполняться параллельно; каждая волна зависит от предыдущих. Волна 0 — фундамент (схема БД + миграция).

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "5.1", "6.1", "6.2", "7.1", "8.1", "8.2", "10.1", "12.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.2", "5.2", "5.3", "6.3", "7.2", "8.3", "9.1", "10.2", "10.3", "11.1", "12.2"] },
    { "id": 3, "tasks": ["3.3", "3.4", "4.3", "4.4", "5.4", "5.5", "7.3", "8.4", "9.2", "9.3"] },
    { "id": 4, "tasks": ["9.4", "9.5", "11.2", "13.1", "13.2"] },
    { "id": 5, "tasks": ["13.3", "13.4", "14.1"] },
    { "id": 6, "tasks": ["14.2"] },
    { "id": 7, "tasks": ["14.3"] }
  ]
}
```

## Notes

- Все новые таблицы аддитивны: миграция не изменяет существующие `cities`, `service_types`, `leads`, `designs`, поэтому текущая CRM/PWA-логика не ломается.
- Property-тесты используют уже присутствующий `fast-check` и раннер `tsx --test`; файлы кладём в `artifacts/api-server/__tests__/community/*.property.test.ts` по существующему паттерну.
- Задачи фасада (13.x) выполняются в артефакте marketplace Next.js 15; они потребляют server-to-server API и не обращаются к БД напрямую.
- Значение порога активности `N` для Living_ZhK и целевой список городов — конфигурируемые параметры (env/`settings`), уточняются на этапе 12.1.

