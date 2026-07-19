# Tasks — City Launch Model

## Фаза 1 — модель данных + гейтинг (бэкенд) ✅
- [x] 1.1 Добавить `is_launched` в схему `cities` (`lib/db/src/schema/settings.ts`). (Req 1.1)
- [x] 1.2 Идемпотентная миграция при старте + запуск Краснодара (`api-server/src/index.ts`). (Req 1.2, 1.3)
- [x] 1.3 Файл-зеркало `migrations/2026-07-19-city-launch-model.sql`. (Req 1.2)
- [x] 1.4 `isLaunched` в публичном DTO города (`marketplace.ts` → `toCityDto`). (Req 1.4)

## Фаза 2 — пре-лонч страницы + честный CTA (фронтенд) ✅
- [x] 2.1 `isLaunched` в типе `City` (`lib/types.ts`). (Req 1.4)
- [x] 2.2 sitemap: пары «услуга×город» только для запущенных городов. (Req 2.1)
- [x] 2.3 `LeadForm` — проп `submitLabel`. (Req 3.1)
- [x] 2.4 Service_City_Page: `noindex` + пре-лонч экран для `!isLaunched`. (Req 2.2, 3.1, 3.3)
- [x] 2.5 Waitlist_Lead помечается через `commentPrefix`. (Req 3.2)

## Фаза 3 — чистка и консистентность ✅
- [x] 3.1 Footer: колонка «Города» из запущенных городов (async + fallback). (Req 5.1, 5.3)
- [x] 3.2 `/uslugi`: рейл городов только из запущенных. (Req 5.2)
- [x] 3.3 Полноценная спека `.kiro/specs/city-launch-model/` (requirements/design/tasks).

## Проверка перед мержем
- [ ] `pnpm --filter @workspace/marketplace run build`
- [ ] `pnpm --filter @workspace/api-server run typecheck`
- [ ] Прогнать миграцию на стейджинге, убедиться, что Краснодар `is_launched=true`.

## Будущее (вне текущего PR)
- [ ] Внутренние ссылки на City_Hub пре-лонч городов (усиление SEO).
- [ ] `noindex` для `/mastera?city=<prelaunch>` deep-link при необходимости.
- [ ] Аналитика Waitlist_Lead по городам как сигнал к запуску.
