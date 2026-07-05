# Implementation Plan: Community Phone Registration

## Overview

Замена неработающего SMS-гейта публикации в сообществе «ХочуТакже» на форумную регистрацию по паролю. Реализация ведётся на **TypeScript** (как в design.md), обобщая существующий код (`lib/communityAuth.ts`, `smartCaptcha.ts`, `createRateLimiter`, `express-session`, `lib/auth.ts`) вместо переписывания. План идёт снизу вверх: аддитивная миграция БД → чистые доменные функции → регистрация/вход → HTTP-слой и сессия → гейт публикации → веб-фасад → сквозная интеграция. Property-тесты P1–P10 из design.md реализуются на `fast-check` рядом с доменным кодом, чтобы ловить ошибки как можно раньше.

## Tasks

- [x] 1. Аддитивное расширение схемы `community_accounts`
  - [x] 1.1 Добавить колонку `password_hash` и миграцию
    - Добавить nullable-поле `passwordHash: varchar("password_hash", { length: 100 })` в `lib/db/src/schema/community-accounts.ts`
    - Создать идемпотентную миграцию `artifacts/api-server/migrations/2026-xx-xx-community-password.sql` с `ALTER TABLE community_accounts ADD COLUMN IF NOT EXISTS password_hash varchar(100)`
    - _Requirements: 1.2, 6.1_
  - [x]* 1.2 Интеграционный тест идемпотентности миграции и обратной совместимости
    - Повторный запуск `ADD COLUMN IF NOT EXISTS` не падает; существующие строки и Legacy_Verified_Account сохраняют право публикации
    - _Requirements: 5.2_

- [x] 2. Чистые доменные функции в `lib/communityAuth.ts`
  - [x] 2.1 Реализовать доменные хелперы
    - Добавить `PASSWORD_MIN_LENGTH = 8`, `PASSWORD_MAX_LENGTH = 72` и `validatePassword(raw)` (различает `password_missing` / `password_invalid`)
    - Добавить `PublicCommunityAccount` и `toPublicAccount(account)` — единственная сериализация аккаунта, гарантированно без `password_hash`
    - Обобщить `hasPublishingRights(account)`: непустой `passwordHash` ИЛИ заданный `phoneVerifiedAt`; не зависит от `maxUserId`
    - _Requirements: 1.4, 2.2, 2.3, 3.2, 4.4, 5.1, 5.2, 5.3, 5.6, 6.2_
  - [x]* 2.2 Property test P1 нормализации телефона
    - **Property 1: Нормализация телефона канонична и идемпотентна**
    - **Validates: Requirements 1.5, 2.1, 3.3**
  - [x]* 2.3 Property test P2 валидации пароля
    - **Property 2: Валидация пароля соответствует Password_Policy** (границы 7/8/72/73 обязательны в генераторе)
    - **Validates: Requirements 2.2, 2.3**
  - [x]* 2.4 Property test P7 санитизации DTO
    - **Property 7: Публичный DTO аккаунта никогда не раскрывает password_hash**
    - **Validates: Requirements 1.4, 3.2, 4.4, 6.2**
  - [x]* 2.5 Property test P8 предиката прав публикации
    - **Property 8: Обобщённый предикат прав публикации, независимый от Max_Login**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.6**

- [x] 3. Регистрация и вход в доменном слое `lib/communityAuth.ts`
  - [x] 3.1 Расширить репозиторий и инъектируемые зависимости
    - Добавить в `CommunityAccountRepository` методы `findByPhone(phone)` и `createWithPassword(phone, passwordHash)`
    - Определить `CommunityAuthDeps` (accounts, verifyCaptcha, hashPassword, verifyPassword, now) с дефолтами из `verifyCaptchaToken` и `lib/auth.ts`
    - _Requirements: 1.1, 1.5, 3.1_
  - [x] 3.2 Реализовать `registerAccount`
    - Порядок: обязательные поля → `normalizeRuPhone` → `validatePassword` → captcha (без вызова при пустом токене) → уникальность телефона → `hashPassword` (bcryptjs cost ≥ 10) → `INSERT`
    - Дискриминированный `RegisterResult` с причинами отказа и флагом `retry`; при любом отказе не создавать аккаунт
    - _Requirements: 1.1, 1.2, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 6.1_
  - [x]* 3.3 Property test P3 успешной регистрации
    - **Property 3: Успешная регистрация — полный инвариант**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6**
  - [x]* 3.4 Property test P4 отказа регистрации
    - **Property 4: Отказ регистрации не создаёт состояния** (при пустом captcha-токене проверка captcha не вызывается)
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 7.2**
  - [x] 3.5 Реализовать `loginAccount`
    - Нормализовать телефон → найти аккаунт → проверить непустой `password_hash` → `verifyPassword`; единый структурный отказ без раскрытия фактора; сессия/хеш не мутируются
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6, 3.7, 6.3, 6.4_
  - [x]* 3.6 Property test P6 входа
    - **Property 6: Вход аутентифицирует по паре и не раскрывает фактор**
    - **Validates: Requirements 3.1, 3.3, 3.4, 3.5, 3.6, 3.7, 6.4**
  - [x]* 3.7 Property test P5 round-trip хеширования пароля
    - **Property 5: Хеширование пароля — верифицируемый round-trip** (реальный bcryptjs для `hashPassword`/`verifyPassword`)
    - **Validates: Requirements 6.1, 6.3**

- [x] 4. HTTP-слой аутентификации и сессия
  - [x] 4.1 Расширить тип сессии
    - Добавить `communityAccountId?: number` в `SessionData` (`types/express-session.d.ts`)
    - _Requirements: 1.3, 4.2_
  - [x] 4.2 Реализовать `createAuthRouter` и смонтировать маршруты
    - `POST /register` (201, сессия + `cookie.maxAge = 30 дней`), `POST /login` (200), `POST /logout` (`session.destroy`), `GET /me` (200/401) в `routes/community/auth.ts`
    - Rate-лимитеры: регистрация `createRateLimiter({windowMs: 60*60_000, maxAttempts: 5})`, вход `{windowMs: 15*60_000, maxAttempts: 10}` → 429
    - Все ответы с данными аккаунта проходят через `toPublicAccount`; убедиться, что роутер подключён в `routes/index.ts`
    - _Requirements: 1.3, 1.4, 3.2, 4.1, 4.3, 4.4, 4.5, 4.6, 4.7, 7.1, 7.3_
  - [x]* 4.3 Property test P10 скользящего лимитера
    - **Property 10: Скользящий лимитер отклоняет сверх лимита без сайд-эффектов и сбрасывается по окну** (фейк-время)
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
  - [x]* 4.4 Пример-тесты жизненного цикла сессии
    - logout уничтожает сессию (следующий `/me` → 401); logout без сессии → `{ok:true, noSession:true}`; captcha недоступна → `captcha_unavailable`, `retry:true`
    - _Requirements: 2.7, 4.1, 4.6_
  - [x]* 4.5 Пример-тест отсутствия секретов в журнале
    - Перехват логгера при ошибке входа/регистрации — значения Password и Password_Hash отсутствуют в записях
    - _Requirements: 6.5_
  - [x]* 4.6 Smoke-тест срока сессии
    - При установке community-сессии `cookie.maxAge == 30 * 24 * 60 * 60 * 1000`
    - _Requirements: 4.5_

- [x] 5. Гейт публикации через сессию вместо заголовка
  - [x] 5.1 Переключить `resolvePublisher` / `resolveAccountId` на сессию
    - Читать `req.session.communityAccountId` в `routes/community/feeds.ts` и `routes/community/auth.ts`; 401 при отсутствии валидного id, 403 при отсутствии `hasPublishingRights`
    - _Requirements: 4.2, 4.3, 4.7, 5.4, 5.5_
  - [x]* 5.2 Property test P9 гейта публикации
    - **Property 9: Гейт публикации допускает только аутентифицированные аккаунты с правами**
    - **Validates: Requirements 4.2, 4.3, 4.7, 5.4, 5.5**

- [x] 6. Checkpoint — доменный и HTTP-слой
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Формы регистрации и входа в Web_Facade (Next.js 15 App Router)
  - [x] 7.1 Форма регистрации со SmartCaptcha
    - Поля телефона (10–15 цифр), пароля (8–72), виджет Yandex SmartCaptcha; клиентская валидация до запроса; `fetch(..., { credentials: "include" })`; при отказе — причина, все поля сохраняются, поле пароля очищается
    - _Requirements: 8.1, 8.3, 8.4, 8.5, 8.6_
  - [x] 7.2 Форма входа
    - Поля телефона (10–15 цифр) и пароля (8–72); `credentials: "include"`; при отказе — очистка пароля, сохранение остальных полей
    - _Requirements: 8.2, 8.3, 8.5, 8.6_
  - [x] 7.3 Гейт публикации в UI
    - При инициировании публикации без валидной Community_Session — предложение регистрации/входа
    - _Requirements: 8.7_
  - [x]* 7.4 Тест чистого клиентского валидатора формы
    - Телефон 10–15 цифр, пароль 8–72 (property-тест на `fast-check`, если доступен; иначе пример с границами)
    - _Requirements: 8.3_
  - [x]* 7.5 Компонентные/рендер-тесты форм
    - Наличие полей и виджета captcha, очистка поля пароля при отказе, редирект к формам при публикации без сессии
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 8.6, 8.7_

- [x] 8. Сквозная интеграция
  - [x]* 8.1 Интеграционный тест полного потока
    - `POST /register` → cookie `connect.sid` установлена → `POST /community/feeds/zhk` публикует от аккаунта из сессии; `POST /logout` → повторная публикация → 401
    - _Requirements: 1.3, 4.1, 4.3, 5.4, 8.5_

- [x] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Реализация на TypeScript; переиспользуются существующие `verifyCaptchaToken`, `createRateLimiter`, `express-session` + `connect-pg-simple`, `lib/auth.ts` (bcryptjs).
- Задачи, помеченные `*`, необязательны и могут быть пропущены для ускоренного MVP; core-реализация никогда не помечается `*`.
- Property-тесты (P1–P10) реализуются на `fast-check` с ≥ 100 итераций, зависимости инъектируются (fake-репозиторий, spy-captcha, фейк-время) — реальные БД/сеть/SMS не задействуются.
- Каждый property-тест ссылается на конкретное свойство из design.md и требования, которые оно проверяет.
- Checkpoints обеспечивают инкрементальную валидацию.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "1.2"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "3.1"] },
    { "id": 3, "tasks": ["3.2"] },
    { "id": 4, "tasks": ["3.5", "3.3", "3.4"] },
    { "id": 5, "tasks": ["3.6", "3.7", "4.1", "5.1"] },
    { "id": 6, "tasks": ["4.2"] },
    { "id": 7, "tasks": ["4.3", "4.4", "4.5", "4.6", "5.2"] },
    { "id": 8, "tasks": ["7.1", "7.2", "7.3"] },
    { "id": 9, "tasks": ["7.4", "7.5"] },
    { "id": 10, "tasks": ["8.1"] }
  ]
}
```
