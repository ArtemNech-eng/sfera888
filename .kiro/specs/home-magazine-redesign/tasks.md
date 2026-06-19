# Tasks — home-magazine-redesign

> Эта итерация = **визуально-структурный редизайн главной + полировка карточек**.
> Бэкенд-фичи (AI-дизайнер, Q&A платформа, B2B-профили мастеров, Service+City) — отдельные спеки.
>
> Контентная модель — `strategic-input-v3.md`. Концепт — `concept-v2-content-first.md` + поправки v3.

## Acceptance criteria

- [ ] Главная имеет 7 секций в новом порядке (Hero / Popular Now / Popular Objects / Pricing Table / AI Designs / Questions / For Masters), без счётчиков-нулей и без HomeTopMasters/HomeCalculator/HomeHowItWorks/HomeIdeasCategories
- [ ] H1 главной и `/raboty/[slug]` отрисованы Fraunces (display serif), body — Manrope
- [ ] Корневые токены: `--color-background: #FAFAF7`, `--color-border: #EDEAE2`, `--radius-card: 16px`, тёплые тени
- [ ] CaseCard — `rounded-2xl`, заголовок `font-semibold`, heart-badge крупнее
- [ ] HomePricingTable показывает 6 buckets (Ванная/Кухня/Гостиная/Спальня/Прихожая/Квартира) через существующий `/api/marketplace/raboty/market-stats`; bucket с <5 объектов скрыт
- [ ] `/voprosy` — stub-страница с placeholder-контентом, чтобы CTA HomeQuestions не 404
- [ ] `pnpm --filter "@workspace/marketplace" run typecheck` — чисто
- [ ] Один conventional commit, push в main

---

## 1. Tokens & fonts (~30 мин)

- [ ] 1.1 `artifacts/marketplace/app/layout.tsx` — подключить Fraunces через `next/font/google` (variable, weight 400-600), добавить CSS-переменную `--font-display`
- [ ] 1.2 `artifacts/marketplace/app/globals.css` — обновить токены:
  - `--color-background: #FAFAF7`
  - `--color-border: #EDEAE2`
  - `--radius-card: 16px` (или новый `--radius-2xl: 16px` если уже есть `--radius-card`)
  - softer shadows (`0 4px 20px rgb(0 0 0 / 0.04)` вместо текущих)
  - утилита `.font-display { font-family: var(--font-display); }`

## 2. Hero — переписать (~45 мин)

- [ ] 2.1 `artifacts/marketplace/components/home/HomeHero.tsx`:
  - Headline в Fraunces 56px desktop / 36px mobile: «Найдите ремонт, который хотите повторить.»
  - Lead Manrope 18px серый: «Тысячи реальных ремонтов и AI-дизайнов с ценами, сроками и мастерами. Понравился объект — нажмите «Хочу такой же».»
  - Single primary CTA «Смотреть ремонты →»
  - Photo-collage 50-60vh — 3 фото asymmetric (1 большое центральное + 2 узких по бокам), `rounded-2xl`
  - Убрать: search-bar, 4 photo-chips комнат, stats-line «N ремонтов · M городов · K мастеров»
  - Sticky transparent header переход — оставить если уже есть

## 3. HomePopularNow — НОВЫЙ компонент (~30 мин)

- [ ] 3.1 Создать `artifacts/marketplace/components/home/HomePopularNow.tsx`:
  - Заголовок Fraunces «Популярное сейчас»
  - 6-8 filter pills хардкодом:
    - Ванные до 200К → `/raboty?room=bathroom&maxPrice=200000`
    - Кухни в новостройках → `/raboty?room=kitchen&housingType=novostroyka`
    - Санузлы 4-6 м² → `/raboty?room=bathroom&minArea=4&maxArea=6`
    - Лофт → `/raboty?style=loft`
    - Скандинавский → `/raboty?style=scandinavian`
    - Минимализм → `/raboty?style=minimalism`
    - Тёмная палитра → `/raboty?palette=dark`
    - Квартиры до 1 млн → `/raboty?room=apartment&maxPrice=1000000`
  - Pill-styling: тёплый бордер, hover приподнятие, h-11

## 4. HomePopularObjects — обновить (~30 мин)

- [ ] 4.1 `artifacts/marketplace/components/home/HomePopularObjects.tsx`:
  - 4 col на desktop (sm:2, md:3, lg:4)
  - Mixed aspect ratios: для каждой карточки `id % 3` определяет 4:5 / 4:3 / 1:1
  - `rounded-2xl`
  - Заголовок секции `font-semibold` (не bold), Fraunces 40px
  - Убрать count в подписи, если есть

## 5. HomePricingTable — НОВЫЙ компонент (~1 час)

- [ ] 5.1 Создать `artifacts/marketplace/components/home/HomePricingTable.tsx`:
  - Заголовок Fraunces «Сколько стоят ремонты по России»
  - 2×3 grid из 6 buckets: bathroom / kitchen / living_room / bedroom / hallway / apartment
  - Каждый bucket: emoji + название + диапазон p25-p75 в тыс ₽ + count
  - Если count < 5 — скрыть bucket
  - Под grid'ом CTA «Узнать цену для моего ремонта →» → `/kalkulyator`
- [ ] 5.2 Server-component: вызвать `fetchMarketStats` для каждого room на сервере, собрать массив
- [ ] 5.3 Если endpoint `market-stats` не принимает `room` параметр — добавить (см. `artifacts/api-server/src/routes/marketplace.ts`); если уже принимает — просто использовать

## 6. HomeAIDesigns — НОВЫЙ компонент (~30 мин)

- [ ] 6.1 Создать `artifacts/marketplace/components/home/HomeAIDesigns.tsx` (адаптация `CaseAIDesigns` если переиспользуется):
  - Eyebrow «✨ AI-дизайн»
  - Заголовок Fraunces «Создайте свой дизайн комнаты»
  - Lead «Загрузите фото своей комнаты — покажем, как она будет выглядеть в выбранном стиле.»
  - 3 style examples в строку: Современный / Минимализм / Лофт (placeholder фото)
  - CTA «Попробовать AI-дизайн →» → `/dizajn`
  - `/dizajn` пока существующий stub (отдельный спек)

## 7. HomeQuestions — НОВЫЙ компонент (~30 мин)

- [ ] 7.1 Создать `artifacts/marketplace/components/home/HomeQuestions.tsx`:
  - Eyebrow «💬 Спроси мастера»
  - Заголовок Fraunces «Вопросы и ответы про ремонт»
  - 4-5 mock-вопросов в виде списка с короткими превью-ответами:
    - «Можно ли клеить плитку на плитку?»
    - «Как выровнять стены без штукатурки?»
    - «Сколько сохнет стяжка перед ламинатом?»
    - «Какой минимальный бюджет на ванную 4 м²?»
    - «Можно ли совместить ванну и санузел в хрущёвке?»
  - CTA «Все вопросы →» → `/voprosy`

## 8. HomeForMasters — НОВЫЙ компонент (~30 мин)

- [ ] 8.1 Проверить какая master-landing активна (`master-landing-v4` vs `master-landing-v5`) — взять текущую
- [ ] 8.2 Создать `artifacts/marketplace/components/home/HomeForMasters.tsx`:
  - Тёмный/контрастный фон (`bg-slate-900` или `bg-emerald-900`)
  - Заголовок Fraunces белый «Вы мастер?»
  - Bullets:
    - ✓ Создайте бесплатное портфолио
    - ✓ Без авансов и блокировок
    - ✓ Договор на каждом заказе
    - ✓ Оплата после выполнения
  - Primary CTA «Создать портфолио →» → master-landing URL
  - Secondary text-link «Узнать о платформе» → `/dlya-masterov` (если есть)

## 9. Stub-страница `/voprosy` (~15 мин)

- [ ] 9.1 Создать `artifacts/marketplace/app/voprosy/page.tsx`:
  - Простая placeholder-страница: заголовок Fraunces «Вопросы и ответы про ремонт», текст «Раздел в разработке. Скоро тут появятся ответы мастеров на ваши вопросы.», back-link на главную
  - SEO: minimal `<head>` с title

## 10. Главная — реструктуризация (~30 мин)

- [ ] 10.1 `artifacts/marketplace/app/page.tsx`:
  - Новый порядок: HomeHero → HomePopularNow → HomePopularObjects → HomePricingTable → HomeAIDesigns → HomeQuestions → HomeForMasters
  - Удалить из render'а (импорты тоже): HomeIdeasCategories, HomeTopMasters, HomeCalculator, HomeHowItWorks
  - **Файлы компонентов оставить** (просто не рендерить) — на случай возврата

## 11. /raboty header упростить (~20 мин)

- [ ] 11.1 `artifacts/marketplace/app/raboty/page.tsx`:
  - H1 в Fraunces
  - Убрать stats-line «1 240 ремонтов · стр. 1 из 52»
  - Sticky chip-rails оставить
  - Pinterest masonry оставить

## 12. /raboty/[slug] полировка (~20 мин)

- [ ] 12.1 `artifacts/marketplace/app/raboty/[slug]/page.tsx`:
  - H1 в Fraunces
  - Все `rounded-xl` → `rounded-2xl` в файле и его дочерних компонентах (`components/raboty/*`)
  - Heart-badge крупнее (h-7 px-2.5 py-1 → h-9 px-3 py-1.5) — править в `CaseCard.tsx` (см. шаг 13)

## 13. CaseCard полировка (~15 мин)

- [ ] 13.1 `artifacts/marketplace/components/CaseCard.tsx`:
  - `rounded-xl` → `rounded-2xl`
  - Title `font-bold` → `font-semibold`
  - Heart-badge увеличить (`h-7 px-2.5 py-1 → h-9 px-3 py-1.5`)

## 14. Verify & ship (~30 мин)

- [ ] 14.1 `pnpm --filter "@workspace/marketplace" run typecheck` — fix all errors
- [ ] 14.2 Visual review через `pnpm dev` (вручную пользователем)
- [ ] 14.3 Conventional commit:
  ```
  feat(marketplace): home magazine redesign — content-first 7-section flow
  ```
  Файлы (явно):
  - `artifacts/marketplace/app/layout.tsx`
  - `artifacts/marketplace/app/globals.css`
  - `artifacts/marketplace/app/page.tsx`
  - `artifacts/marketplace/app/voprosy/page.tsx`
  - `artifacts/marketplace/app/raboty/page.tsx`
  - `artifacts/marketplace/app/raboty/[slug]/page.tsx`
  - `artifacts/marketplace/components/home/HomeHero.tsx`
  - `artifacts/marketplace/components/home/HomePopularNow.tsx`
  - `artifacts/marketplace/components/home/HomePopularObjects.tsx`
  - `artifacts/marketplace/components/home/HomePricingTable.tsx`
  - `artifacts/marketplace/components/home/HomeAIDesigns.tsx`
  - `artifacts/marketplace/components/home/HomeQuestions.tsx`
  - `artifacts/marketplace/components/home/HomeForMasters.tsx`
  - `artifacts/marketplace/components/CaseCard.tsx`
  - `.kiro/specs/home-magazine-redesign/*.md`
- [ ] 14.4 Push в main (Railway autodeploy)

---

## Предполагаемое время

~5-6 часов кода + verify, единый коммит. Бэкенд-фичи AI-дизайнер / Q&A / B2B-профили мастеров — отдельные спеки.
