# Design Document — City Launch Model

## Обзор

Город на маркетплейсе описывается **двумя независимыми флагами**, а не одним:

| Состояние | Флаги | Что показываем | Индексация |
|---|---|---|---|
| **Launched** | `is_launched=true` | Полный опыт: каталог мастеров, кейсы, обычная форма заявки | Да |
| **Prelaunch/SEO** | `is_geo_covered=true`, `is_launched=false` | Хаб города + контент. CTA: лист ожидания + набор мастеров | Да (хаб) |
| **Hidden** | ни то, ни другое | — | Нет (`noindex`/404) |

`is_active` остаётся «внутренней доступностью» (CRM/PWA), `is_geo_covered` — целевым
SEO-набором, `is_launched` — операционным запуском. Разделение снимает двусмысленность.

## Модель данных

`cities.is_launched boolean NOT NULL DEFAULT false` (schema: `lib/db/src/schema/settings.ts`).

Миграция накатывается идемпотентно при старте api-server (`runRuntimeFixes` в
`artifacts/api-server/src/index.ts`), зеркало — `artifacts/api-server/migrations/2026-07-19-city-launch-model.sql`:

```sql
ALTER TABLE cities ADD COLUMN IF NOT EXISTS is_launched boolean NOT NULL DEFAULT false;
UPDATE cities SET is_launched = true WHERE slug = 'krasnodar';
```

Краснодар форсится безусловно, чтобы флагманский город никогда не «схлопнулся» в 404
из-за дефолта. Остальные города переключаются через БД.

## Точки гейтинга

### Backend (`artifacts/api-server/src/routes/marketplace.ts`)
- `toCityDto` отдаёт `isLaunched` (публичный allow-list).
- `/service-city` и `/cities` продолжают фильтровать по `is_active`; различение
  launched/pre-launch делает фронт по `isLaunched` (данные не скрываются, чтобы пре-лонч
  страницы могли рендериться в контентном режиме).

### Frontend (`artifacts/marketplace`)
- `lib/types.ts` — `isLaunched` в типе `City`.
- `app/sitemap.ts` — пары `/[service]/[city]` только для `cities.filter(c => c.isLaunched)`.
- `app/[serviceSlug]/[citySlug]/page.tsx`:
  - `generateMetadata`: для `!isLaunched` → `robots noindex, follow` + честный тайтл.
  - Компонент: для `!isLaunched` → ранний возврат `PreLaunchServiceCity` (лист ожидания +
    набор мастеров + калькулятор + ссылка на City_Hub). Launched-путь неизменен.
- `components/LeadForm.tsx` — проп `submitLabel` (кнопка «Записаться в лист ожидания»);
  Waitlist_Lead помечается через `commentPrefix`.
- `components/Footer.tsx` — колонка «Города» из Launched_City (async fetch + try/catch).
- `app/uslugi/page.tsx` — рейл городов из Launched_City.

## Пре-лонч → набор мастеров (двигатель запуска)

CTA пре-лонч города конвертирует SEO-трафик в: (1) Waitlist_Lead клиентов (доказательство
спроса) и (2) регистрацию мастеров (`sfera-master.ru/masteram`). Это ровно то, что нужно,
чтобы затем переключить `is_launched=true`.

## Rollout / Rollback

- Обе фазы (бэкенд-флаг + фронт-рендер) мержатся вместе: без Фазы 1 поле `isLaunched`
  было бы `undefined` → пре-лонч включился бы для всех городов, включая Краснодар.
- Rollback: `UPDATE cities SET is_launched = false WHERE slug='...'` (кроме Краснодара)
  или откат PR. Аддитивная колонка данных не разрушает.

## Открытые вопросы / будущее

- Внутренние ссылки на City_Hub пре-лонч городов из футера (усиление SEO) — отдельной задачей.
- Возможный `noindex` для `/mastera?city=<prelaunch>` deep-link — при необходимости.
