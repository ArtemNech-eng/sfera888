# Design — Object-first redesign of `/raboty/[slug]`

## 1. Architecture overview

Страница остаётся Next.js App Router server component (`force-dynamic`, fetch-on-request с ISR-кешем 5 мин в `lib/api.ts`). Внутри — композиция секций; интерактивные части (галерея/lightbox, sticky-CTA, save/share) — child client components с минимальным state.

**High-level data flow:**

```
Browser GET /raboty/sovremennyy-remont-vannoy-krasnodar
         │
         ▼
RabotyCasePage (server)                                       
  ├─ fetchRabotyCase(slug)        → GET /api/marketplace/raboty/:slug
  ├─ fetchCities()                 → GET /api/marketplace/cities  (cached)
  ├─ fetchServices()               → GET /api/marketplace/services (cached)
  ├─ [Iter 3] fetchMarketStats({…}) → GET /api/marketplace/raboty/market-stats
  └─ [Iter 4] fetchSavedState(slug, anon_id) — для иконки ❤️
         │
         ▼
SSR HTML (sections in fixed order, Req 11.1)
         │
         ▼
hydrate islands:
  • <CaseGallery>      (client, lightbox state)
  • <CasePrimaryCTA>   (client, save toggle + share)
  • <StickyMobileCTA>  (client, IntersectionObserver)
```

**Render pipeline:** server-side собирает все данные в один pass, рендерит SSR. Клиентские острова мини, без больших stores. Стейт лайтбокса — локальный `useState`, save-toggle — оптимистичный fetch на `/api/raboty/[slug]/save`.

## 2. Page composition

Новый файл сценария в **том же** `app/raboty/[slug]/page.tsx`. Удаляем старые helper-компоненты (`ArticleCover`, `ArticleStatsBar`, `BeforeAfterPair`, `MasterAuthorCard`, `CalculatorTeaser`, локальный `SimilarCard`) — заменяем композицией новых.

```
RabotyCasePage
├── <ArticleHeader>           — без изменений (breadcrumbs + h1 + service eyebrow)
├── <CaseGallery>             — Req 1, NEW (client, lightbox)
├── <CaseChips>               — Req 2, NEW (server)
├── <CasePrimaryCTA>          — Req 4 + 9.1, NEW (client wrapper)
│   ├── «Хочу такой же» button → scrollIntoView('#lead-form')
│   ├── <SaveButton>          (Iter 4, заглушка в Iter 1)
│   └── <ShareButton>         (client, navigator.share)
├── <BeforeAfterPair>         — оставляем как сейчас, но УПРОЩАЕМ (без секционного header'а сверху, просто 2 фото с лейблами)
├── <ArticleDescription>      — без изменений
├── <ClientReview>            — без изменений (рендерится если есть)
├── <CaseEstimate>            — Req 3, NEW (server, рендерится если portfolio.estimate != null) — Iter 2
├── <CaseMasterSummary>       — Req 5, NEW (server, заменяет MasterAuthorCard)
├── <SimilarCases>            — оставляем, но карточки теперь <CaseCard> (Req 6.2)
├── <CaseMarketStats>         — Req 7, NEW (server) — Iter 3
├── <CaseAIDesigns>           — Req 8, NEW (server, 3 stub-карточки)
├── <CaseLeadBlock>           — Req 10, NEW (полноширинный, replaces aside) ← anchor #lead-form
└── <StickyMobileCTA>         — Req 4.4, NEW (client) — рендерится in document but hidden by default
```

Files и движения:

| Файл | Действие |
|---|---|
| `app/raboty/[slug]/page.tsx` | Радикальный рефактор: удалить 6 локальных компонентов, импортировать новые из `components/raboty/` |
| `components/raboty/CaseGallery.tsx` | new client component |
| `components/raboty/CaseGalleryLightbox.tsx` | new client component (split для tree-shake) |
| `components/raboty/CaseChips.tsx` | new server component |
| `components/raboty/CasePrimaryCTA.tsx` | new client component (содержит SaveButton + ShareButton) |
| `components/raboty/SaveButton.tsx` | new client (Iter 4) |
| `components/raboty/ShareButton.tsx` | new client (Iter 1) |
| `components/raboty/CaseEstimate.tsx` | new server (Iter 2) |
| `components/raboty/CaseMasterSummary.tsx` | new server |
| `components/raboty/CaseMarketStats.tsx` | new server (Iter 3) |
| `components/raboty/CaseAIDesigns.tsx` | new server |
| `components/raboty/CaseLeadBlock.tsx` | new server (wraps existing `<LeadForm/>`) |
| `components/raboty/StickyMobileCTA.tsx` | new client (Iter 1) |

`components/raboty/` — новый namespace под case-page-специфичные компоненты. Тесты (когда дойдём до них в tasks) — рядом, `*.test.tsx`.

## 3. Component design — props + responsibilities

### 3.1 `<CaseGallery>` (client)

```ts
interface CaseGalleryProps {
  title: string;                  // alt-fallback
  city: { name: string } | null;  // alt-context
  beforePhotos: string[];
  afterPhotos: string[];
}
```

**Layout:** desktop = grid `2fr 1fr`; левая колонка — главная hero-фотка (первое из `afterPhotos`, fallback `beforePhotos`), правая — стак из 4-5 миниатюр (последующие after + первый before). Mobile = горизонтальный snap-scroll контейнер с `overflow-x-auto scroll-snap-type-x mandatory`.

**Lightbox:** клик на любую миниатюру открывает `<CaseGalleryLightbox>`. State — `useState<{open: boolean, index: number}>`. Закрытие — Escape, клик в фон, кнопка ✕. Next/prev — стрелки + клавиши ←/→. Никакого zoom/pinch (D-5 решено).

**Pre-warm rule:** первое фото `loading="eager" fetchPriority="high"`, остальные `loading="lazy"`.

**Empty case:** если `afterPhotos.length === 0 && beforePhotos.length === 0` — компонент возвращает `null`, страница рендерится без галереи.

### 3.2 `<CaseChips>` (server)

```ts
interface CaseChipsProps {
  city: string | null;
  area: number | null;          // м²
  durationDays: number | null;  // Iter 2
  priceRange: string | null;    // pre-formatted
  serviceName: string | null;
  housingType: HousingType | null;  // Iter 2
}

type HousingType = 'novostroyka' | 'vtorichka' | 'chastnyy_dom' | 'kommerciya';

const HOUSING_LABEL: Record<HousingType, string> = {
  novostroyka: 'Новостройка',
  vtorichka: 'Вторичка',
  chastnyy_dom: 'Частный дом',
  kommerciya: 'Коммерция',
};
```

**Render:** `<ul className="flex flex-wrap gap-2">` с inline-flex chip-элементами. Каждый chip = иконка (inline SVG, не emoji — для крепкой кросс-платформенной отрисовки) + значение. Высота 40px, фон `var(--color-cream-deep)`, без border.

**Никакого «—»** — отсутствующие чипы скрываются (Req 2.2).

### 3.3 `<CasePrimaryCTA>` (client)

```ts
interface CasePrimaryCTAProps {
  slug: string;            // для save-toggle
  initialSaved: boolean;   // SSR-resolved (Iter 4)
  saveCount: number;       // SSR-resolved (Iter 4)
  shareUrl: string;        // полный canonical URL
  shareTitle: string;      // portfolio.title
}
```

**Layout:**
```
┌─────────────────────────────────────────┐
│  [   🏠 Хочу такой же   →  ]   ❤  📤   │
│  Подберём мастеров, которые сделают…    │
└─────────────────────────────────────────┘
```

**Behavior:**
- Главная кнопка: тег `<a href="#lead-form">` с `onClick` — `e.preventDefault(); document.getElementById('lead-form')?.scrollIntoView({behavior:'smooth'})`. Использует `<a>`, не `<button>`, чтобы при отключённом JS работала навигация по якорю.
- Save-кнопка: иконка ❤️ в кружке, в Iter 1 — `disabled` с tooltip «Скоро», в Iter 4 — реальная toggle (`<SaveButton>`).
- Share-кнопка: иконка 📤. `onClick` → `navigator.share?.({url, title}).catch(() => copyToClipboard(url))`.

### 3.4 `<SaveButton>` (client, Iter 4)

```ts
interface SaveButtonProps {
  slug: string;
  initialSaved: boolean;
  initialCount: number;
}
```

**State:** `useState<{saved: boolean, count: number, busy: boolean}>`. Optimistic update — toggle сразу, fetch в фоне; на ошибку — rollback + error toast.

**Endpoint:** `POST /api/raboty/[slug]/save` (proxy на marketplace Next.js → api-server). Возвращает `{ ok: true, saved: boolean, count: number }`.

**Anon ID:** cookie `kiro_anon_id` (HTTP-only, lax, expires 1 year). Если cookie нет — Next.js route handler выставляет на первом запросе. Идентификатор — UUID v4.

### 3.5 `<ShareButton>` (client, Iter 1)

```ts
interface ShareButtonProps {
  url: string;
  title: string;
}
```

**Behavior:**
1. Если `navigator.share` доступен (мобильные и часть десктопов) → `navigator.share({url, title, text: title})`. Перехватываем `AbortError` (пользователь закрыл диалог) — без toast'а.
2. Fallback → `navigator.clipboard.writeText(url)` + toast «Ссылка скопирована».

Без серверного state. Стрелка сразу feedback'ает (icon checkmark на 1.5 сек после копирования).

### 3.6 `<CaseEstimate>` (server, Iter 2)

```ts
interface CaseEstimateProps {
  estimate: PortfolioEstimate | null;
}

interface PortfolioEstimate {
  works: number;
  materials: number;
  total?: number;            // вычисляется на фронте если null
  breakdown?: { label: string; cost: number }[];
}
```

**Render:** если `estimate` null → не рендерится. Иначе — карточка с тремя строками:
```
Стоимость работ      85 000 ₽
Материалы            52 000 ₽
─────────────────────────────
Итого              137 000 ₽
```

Если `breakdown` есть — раскрывающийся `<details>` под итогом «Подробная смета» с pre-formatted списком. В Iter 2 минимально — просто три строки, breakdown не рендерим (но колонка готова в JSONB).

### 3.7 `<CaseMasterSummary>` (server)

```ts
interface CaseMasterSummaryProps {
  master: Master;                    // из RabotyDetailResponse
  stats: {
    portfolioCount: number;          // NEW в API response
    completedOrders: number;         // already in /master/[slug] response, нужно подтянуть в /raboty/[slug]
  };
}
```

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ [Avatar] Артём Петров          ⭐ 4.8 (132 отзыва) │
│          Краснодар              [Все работы →]     │
│ ─────────────────────────────────────────────────── │
│  📸 27 работ    🏠 18 завершённых    📍 Краснодар  │
└─────────────────────────────────────────────────────┘
```

**Логика hide-empty:** ячейки с `0` скрываются, имя+рейтинг+город всегда видны.

**Кнопка «Все работы»** — `<Link href={`/master/${master.slug}`}>`.

### 3.8 `<CaseMarketStats>` (server, Iter 3)

```ts
interface CaseMarketStatsProps {
  serviceName: string;            // «Ремонт ванной»
  areaSqm: number;
  cityName: string | null;
  data: MarketStatsResponse;      // см. §5.2 контракт endpoint'а
}
```

**Render:**
```
┌──────────────────────────────────────────────────────┐
│ Сколько стоят такие ремонты                          │
│                                                       │
│ Ремонты ванной 4-6 м² по России                      │
│ от 120 000 ₽ до 190 000 ₽                            │
│ На основе 248 объектов                               │
│                                                       │
│ В Краснодаре                                          │
│ от 110 000 ₽ до 165 000 ₽                            │
│ На основе 31 объекта                                 │
└──────────────────────────────────────────────────────┘
```

**Visibility:** если `data.russia.count < 5` — секция возвращает null. Если `data.city.count < 3` — городская строка скрывается, остаётся только Россия. Запрос идёт параллельно основному `fetchRabotyCase` через `Promise.all`.

### 3.9 `<CaseAIDesigns>` (server)

```ts
interface CaseAIDesignsProps {
  roomSlug: string | null;        // 'vannaya', 'kuhnya' etc — для preset URL
}
```

**Render:** 3-карточная сетка (Современный / Минимализм / Лофт) с фото-stub из Unsplash + кнопкой «Попробовать» → `/dizajn/new?style=…&room=…`.

В Iter 1 — статичные изображения; в Phase 8 (Fal.ai) — реальные превью под room/style комбинацию.

### 3.10 `<CaseLeadBlock>` (server)

```ts
interface CaseLeadBlockProps {
  fallbackCity: City | null;
  fallbackService: Service | null;
  sourcePageUrl: string;
  master: Master;
  masterName: string;
  serviceName: string | null;
  cityName: string | null;
  areaNum: number | null;
}
```

**Layout:** полноширинный блок на cream-deep фоне; внутри grid `lg:grid-cols-[1fr_1fr]` — слева eyebrow + h2 + объяснение и контекст-чек-лист, справа `<LeadForm>` с теми же props что сейчас (включая `attachedMasterId={master.id}`). Якорь `id="lead-form"` на root.

### 3.11 `<StickyMobileCTA>` (client)

```ts
interface StickyMobileCTAProps {
  // нет — компонент сам определяет видимость
}
```

**Behavior:**
- Использует `IntersectionObserver` для отслеживания `<CasePrimaryCTA>` (по data-атрибуту `data-cta-anchor`) и `<CaseLeadBlock>` (`#lead-form`).
- Видимый когда: основная CTA вышла из viewport (`!ctaInView`) И лид-форма ещё не в viewport (`!leadInView`).
- На mobile (`< sm`) — bottom bar; на desktop — top-right pill.
- Click → smooth scroll to `#lead-form`.

**Implementation note:** компонент рендерится в DOM на сервере, но скрыт `opacity-0 pointer-events-none`; клиент подключает observer и переключает в `opacity-100 pointer-events-auto` по условиям.

## 4. Data model (Drizzle migrations)

### 4.1 Iteration 2 — характеристики кейса + смета

**Migration: `migrations/2026-06-XX-portfolio-rich-fields.sql`**

```sql
-- Тип жилья — enum (D-1 решено)
CREATE TYPE housing_type AS ENUM (
  'novostroyka',
  'vtorichka',
  'chastnyy_dom',
  'kommerciya'
);

ALTER TABLE master_portfolio
  ADD COLUMN duration_days INTEGER NULL CHECK (duration_days IS NULL OR (duration_days BETWEEN 1 AND 365)),
  ADD COLUMN housing_type housing_type NULL,
  ADD COLUMN estimate JSONB NULL;

-- Index для будущей сортировки/фильтра по итоговой сумме сметы
CREATE INDEX master_portfolio_estimate_total_idx
  ON master_portfolio (((estimate->>'total')::int))
  WHERE estimate IS NOT NULL;
```

**Drizzle schema update (`@workspace/db/src/schema.ts`):**

```ts
export const housingTypeEnum = pgEnum('housing_type', [
  'novostroyka',
  'vtorichka',
  'chastnyy_dom',
  'kommerciya',
]);

export const masterPortfolioTable = pgTable('master_portfolio', {
  // ... existing
  durationDays: integer('duration_days'),
  housingType: housingTypeEnum('housing_type'),
  estimate: jsonb('estimate').$type<PortfolioEstimate>(),
});

export type PortfolioEstimate = {
  works: number;
  materials: number;
  total?: number;
  breakdown?: { label: string; cost: number }[];
};
```

**Zod валидация estimate (api-server):**

```ts
const estimateSchema = z.object({
  works: z.number().int().min(0).max(10_000_000),
  materials: z.number().int().min(0).max(10_000_000),
  total: z.number().int().min(0).max(20_000_000).optional(),
  breakdown: z.array(z.object({
    label: z.string().min(1).max(100),
    cost: z.number().int().min(0).max(10_000_000),
  })).max(50).optional(),
}).refine(
  (e) => e.total == null || Math.abs(e.total - (e.works + e.materials)) < 100,
  { message: 'total должен совпадать с works + materials (±100 ₽)' },
);
```

### 4.2 Iteration 4 — сохранения

**Migration: `migrations/2026-06-XX-user-saves.sql`**

```sql
ALTER TABLE master_portfolio
  ADD COLUMN save_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE user_saves (
  id            BIGSERIAL PRIMARY KEY,
  -- Один из двух обязателен (CHECK constraint ниже)
  anon_id       UUID NULL,
  user_id       INTEGER NULL REFERENCES masters(id) ON DELETE SET NULL,  -- мастер-side для будущего; client-side accounts ещё нет
  portfolio_id  INTEGER NOT NULL REFERENCES master_portfolio(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_saves_owner_chk CHECK (anon_id IS NOT NULL OR user_id IS NOT NULL),
  CONSTRAINT user_saves_unique_anon UNIQUE NULLS NOT DISTINCT (anon_id, portfolio_id),
  CONSTRAINT user_saves_unique_user UNIQUE NULLS NOT DISTINCT (user_id, portfolio_id)
);

CREATE INDEX user_saves_anon_idx ON user_saves (anon_id) WHERE anon_id IS NOT NULL;
CREATE INDEX user_saves_user_idx ON user_saves (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX user_saves_portfolio_idx ON user_saves (portfolio_id);
```

**Save count integrity:** инкремент `master_portfolio.save_count` через DB trigger при INSERT в `user_saves` и декремент при DELETE — атомарно. Альтернатива (приложением): транзакция `INSERT user_saves; UPDATE master_portfolio SET save_count = save_count + 1`. Trigger надёжнее против race.

### 4.3 Изменения уже-существующих DTO

**`RabotyDetailResponse` расширение:**

```ts
// types.ts (marketplace) — соответствие api-server
export interface RabotyDetailResponse {
  portfolio: {
    // ... existing
    durationDays: number | null;        // NEW Iter 2
    housingType: HousingType | null;    // NEW Iter 2
    estimate: PortfolioEstimate | null; // NEW Iter 2
    saveCount: number;                  // NEW Iter 4
  };
  master: Master;
  // master enrich:
  masterStats: {
    portfolioCount: number;             // NEW
    completedOrders: number;            // NEW (или внутри master, но так чище)
  };
  similar: RabotySimilarItem[];
  // SSR-resolved save state for current anon_id:
  isSavedByCurrentUser: boolean;        // NEW Iter 4
}
```

`master_portfolio` SQL уже джойнится в текущем `/raboty/:slug` endpoint — добавляем `LEFT JOIN` с count'ом портфолио мастера и саб-запросом completed orders. Один лишний агрегатный запрос — приемлемо.

## 5. API contracts

### 5.1 Modified — `GET /api/marketplace/raboty/:slug`

Файл: `artifacts/api-server/src/routes/marketplace.ts` (расширение существующего route).

**Response добавляются:**

```ts
{
  portfolio: {
    // ... existing fields
    durationDays: number | null,
    housingType: 'novostroyka' | 'vtorichka' | 'chastnyy_dom' | 'kommerciya' | null,
    estimate: PortfolioEstimate | null,
    saveCount: number,  // 0 до Iter 4 миграции
  },
  master: { /* without changes */ },
  masterStats: {
    portfolioCount: number,
    completedOrders: number,
  },
  similar: [ /* without changes */ ],
  isSavedByCurrentUser: boolean,  // false до Iter 4
}
```

**Implementation notes:**
- `portfolioCount` — `COUNT(*) FROM master_portfolio WHERE master_id = X AND is_published = true`. Один SELECT.
- `completedOrders` — `COUNT(*) FROM orders WHERE master_id = X AND status = 'completed' AND deleted_at IS NULL`. Уже есть аналог в `/master/:slug` — копируем формулу.
- `isSavedByCurrentUser` — Iter 4: `EXISTS (SELECT 1 FROM user_saves WHERE anon_id = $1 AND portfolio_id = X)`. До Iter 4 хардкод `false`.

### 5.2 New — `GET /api/marketplace/raboty/market-stats` (Iter 3)

**Query params:**
- `serviceSlug` (required) — slug услуги
- `areaTarget` (required) — m², float
- `citySlug` (optional) — slug города

**Response:**

```ts
interface MarketStatsResponse {
  russia: {
    p25: number;  // 25-й перцентиль priceFrom
    p75: number;  // 75-й перцентиль
    count: number;
  };
  city: {
    p25: number;
    p75: number;
    count: number;
    cityName: string;
  } | null;  // null если citySlug не передан или count < 3
}
```

**SQL (Postgres `percentile_cont`):**

```sql
WITH similar AS (
  SELECT mp.price_from::numeric AS price, mp.city_id
  FROM master_portfolio mp
  WHERE mp.is_published = true
    AND mp.service_type_id = (SELECT id FROM service_types WHERE slug = $1)
    AND mp.area::numeric BETWEEN ($2 * 0.7) AND ($2 * 1.3)
    AND mp.price_from IS NOT NULL
)
SELECT
  -- Russia bucket
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY price) AS russia_p25,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY price) AS russia_p75,
  COUNT(*) AS russia_count,
  -- City bucket (filter inline через FILTER clause)
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY price)
    FILTER (WHERE city_id = (SELECT id FROM cities WHERE slug = $3)) AS city_p25,
  -- ... etc
FROM similar;
```

**Cache:** in-memory LRU на 1 час с ключом `serviceSlug + areaBucket(target) + citySlug`. `areaBucket` — округление к диапазону (4-6, 6-8, 8-12 м² итд) чтобы кеш-хитов было больше. Уйдёт в `lib/marketStatsCache.ts` на api-server'е.

**Edge cases:**
- Если `russia_count < 5` → возвращаем `{ russia: { p25:0, p75:0, count: <N> }, city: null }`. Frontend проверяет `count >= 5` и скрывает блок.
- Округление: цифры округляются вверх к ближайшим 10 000 ₽ (косметическое, без потери смысла).

### 5.3 New — `POST /api/marketplace/raboty/:slug/save` (Iter 4)

**Request body:**

```ts
// JSON
{
  anonId: string;  // UUID из cookie kiro_anon_id, выставляется Next.js route handler'ом
}
```

**Response:**

```ts
{
  ok: true,
  saved: boolean,    // новое состояние
  count: number,     // обновлённый save_count
}
```

**Logic:**
```sql
BEGIN;
  -- Try insert
  INSERT INTO user_saves (anon_id, portfolio_id) VALUES ($anonId, $portfolioId)
  ON CONFLICT DO NOTHING
  RETURNING id;

  -- Если вставилось — это сохранение; если конфликт — это распил
  -- (DELETE old, return saved=false)
COMMIT;
```

Логика toggle на api-server'е: один SQL upsert с возвратом `xmax = 0` для определения insert vs no-op. На no-op (конфликт) — `DELETE FROM user_saves WHERE anon_id = $1 AND portfolio_id = $2`. trigger обновляет `save_count`.

**Rate limit:** 30 toggle/мин на anon_id (in-memory bucket).

**Validation:**
- `anonId` — UUID v4 строгий regex
- `slug` → resolve в `portfolio_id`, 404 если не существует или не published

### 5.4 New — `GET /api/marketplace/saves` (Iter 4)

Возвращает сохранённые кейсы для current anon_id. Используется на странице `/izbrannoe`.

**Query:** `anonId` (required)

**Response:**

```ts
{
  items: RabotyListItem[],   // тот же DTO что в /raboty list
  total: number,
}
```

**SQL:** `SELECT mp.*, … FROM user_saves us JOIN master_portfolio mp ON … WHERE us.anon_id = $1 ORDER BY us.created_at DESC LIMIT 100`.

### 5.5 Marketplace Next.js routes (proxy layer)

**`app/api/raboty/[slug]/save/route.ts` (NEW, Iter 4):**

```ts
export async function POST(req: NextRequest, { params }) {
  const { slug } = await params;
  const cookies = req.cookies;
  let anonId = cookies.get('kiro_anon_id')?.value;
  if (!anonId) {
    anonId = crypto.randomUUID();
    // флаг для outbound headers — выставим cookie в response
  }
  // forward to api-server
  const upstream = await fetch(
    `${internalApiBase()}/marketplace/raboty/${slug}/save`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${internalApiToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ anonId }),
    },
  );
  // ... return + set-cookie если только что сгенерили
}
```

**`app/izbrannoe/page.tsx` (NEW, Iter 4):** server component, читает cookie `kiro_anon_id`, вызывает `fetchSaves(anonId)`, рендерит сетку `<CaseCard>`. Empty state — когда `items.length === 0`.

## 6. State management

**Server state** — все данные кейса fetch'ятся на сервере перед рендерингом, передаются в SSR. Нет SWR / TanStack Query — страница reload'ится при навигации.

**Client islands state:**

| Component | State | Persistence |
|---|---|---|
| `<CaseGallery>` | `lightbox: {open, index}` | useState (per-mount) |
| `<SaveButton>` | `{saved, count, busy}` | initial from props (SSR) → optimistic toggle → fetch |
| `<ShareButton>` | `{copied: bool, ttl}` | useState + setTimeout |
| `<StickyMobileCTA>` | `{ctaInView, leadInView}` | IntersectionObserver, useState |

**No global state.** Никаких context-provider'ов, redux, zustand. Каждый island — изолированный.

## 7. SEO / JSON-LD strategy

### 7.1 Расширения JSON-LD (Iter 1)

Existing `caseJsonLd` (в `lib/jsonLd.ts`):

```ts
{
  '@context': 'https://schema.org',
  '@type': 'CreativeWork',
  // ... existing
  image: cover ? [cover] : [],   // ← заменяем на ВСЕ фото:
}
```

**Iteration 1** — `image[]` собирается из `[...afterPhotos, ...beforePhotos]` (полный список, до 30 шт). Дополнительно `thumbnailUrl` = первое after-фото.

**Iteration 2** — добавляем `additionalProperty[]`:
```ts
[
  { '@type': 'PropertyValue', name: 'Срок выполнения', value: `${durationDays} дней` },
  { '@type': 'PropertyValue', name: 'Тип жилья', value: HOUSING_LABEL[housingType] },
  { '@type': 'PropertyValue', name: 'Стоимость работ', value: `${estimate.works} ₽` },
  { '@type': 'PropertyValue', name: 'Стоимость материалов', value: `${estimate.materials} ₽` },
]
```

**Iteration 3** — обновляем `priceRange` под market-stats данные если есть (для России) — это сильнее для rich-result.

### 7.2 Meta-теги

`<title>` и `<description>` остаются как генерируются `buildCaseMeta(portfolio, master)`. В Iter 2 добавляем в description информацию про срок и тип жилья если заполнены. Open Graph image — первое `afterPhoto` (как сейчас).

### 7.3 Canonical и crawl

`alternates.canonical` без изменений. Sitemap уже включает `/raboty/[slug]` — никаких новых URL'ов для лайтбокса не создаём (lightbox — JS-only state).

## 8. Iteration breakdown

### Iteration 1 — Frontend-only refactor (~3-4 ч кода)

**No DB migrations.** Использует существующие поля. Видимая ценность:

- ✅ Галерея first-screen с lightbox
- ✅ Чипы (без Срок и Тип жилья — в Iter 2)
- ✅ Большой CTA «Хочу такой же» + ShareButton (рабочий) + SaveButton (заглушка)
- ✅ Усиленный мастер-байлайн (нужен только +20 строк бэкенда — `portfolioCount` + `completedOrders` в `/raboty/:slug`)
- ✅ AI-designs stub-блок
- ✅ LeadForm в подвал, sticky CTA на mobile
- ✅ Section ordering finalized
- ✅ JSON-LD: `image[]` все фото

**Breaking changes:** старые компоненты `ArticleCover`, `ArticleStatsBar`, `BeforeAfterPair` (заменяется), `MasterAuthorCard`, `CalculatorTeaser`, локальный `SimilarCard` — удаляются. URL/сlug-схема не меняется.

**Backend-touch:** только api-server `routes/marketplace.ts` `/raboty/:slug` endpoint — добавить `masterStats` и упомянутые поля, а также `saveCount: 0` и `isSavedByCurrentUser: false` (заранее, чтобы фронт уже умел).

### Iteration 2 — Rich portfolio fields + editor (~5-6 ч)

- Migration `2026-XX-portfolio-rich-fields.sql`
- Drizzle schema update
- API: новые поля в `/raboty/:slug` response + master-pwa endpoint `PUT /portfolio/:id`
- Cabinet editor: 4 новых input'а в `/cabinet/portfolio/[slug]/edit`
- Frontend: `<CaseChips>` показывает «Срок» и «Тип жилья», `<CaseEstimate>` рендерится при наличии estimate
- JSON-LD: `additionalProperty[]`
- Подсказка мастеру в редакторе («заполнение даёт +30% просмотров»)

### Iteration 3 — Market average (~3-4 ч)

- API: новый endpoint `GET /api/marketplace/raboty/market-stats`
- LRU cache на api-server (1 час, sharded by area-bucket)
- Frontend: `<CaseMarketStats>` — server component, `Promise.all` с case fetch'ом
- Edge cases: hide-if-thin-data, hide-city-if-thin

### Iteration 4 — Saves + /izbrannoe (~6-7 ч)

- Migration `2026-XX-user-saves.sql` + trigger для save_count
- API: 4 endpoint'а (toggle, list, plus expose `isSavedByCurrentUser` в /raboty/:slug, plus update save_count в /raboty list)
- Marketplace Next.js route handlers: `/api/raboty/[slug]/save`, set-cookie логика для `kiro_anon_id`
- Frontend: `<SaveButton>` рабочая, `<CaseCard>` с always-visible ❤️ counter
- New page `/izbrannoe` — server component с empty state
- Auto-claim: будет реализован когда подключится client-account auth (TBD, не блокирует Iter 4)

## 9. Risks & edge cases

**R1. Cyrillic-paths (Windows env).** Tooling уже знает обходные пути через `.bat` файлы — `pnpm typecheck`, `git add`/`commit`/`push` идут через batch обёртки. Нет рисков для самого design'а.

**R2. Анонимный saver — троттлинг.** Без полноценного auth злоумышленник может ротировать `kiro_anon_id` cookie и накручивать save_count. Smell-test: 30 toggle/min на anon_id + IP-throttle 100 saves/hour снимают 99% риска. Phase D-2: подключить ML/captcha когда увидим реальные атаки.

**R3. Совместимость со старыми кейсами без `estimate`/`housingType`.** Колонки nullable. UI скрывает чипы / секции без данных. Старые кейсы продолжают рендериться корректно.

**R4. Lightbox-рендер на SSR.** Стейт лайтбокса — в client-component'е. SSR рендерит галерею с миниатюрами и hidden lightbox-shell; lightbox активируется только client-side. SEO: все фото (включая зашитые в lightbox) попадают в `image[]` JSON-LD без изменений.

**R5. Sticky mobile CTA — не должен закрывать форму при набивке.** При focus на input в `<LeadForm>` — sticky-bar скрывается (через `:focus-within` на ancestor + media-query). Fallback: при scroll `#lead-form` в viewport — IntersectionObserver выключает sticky.

**R6. CDN-кеш inconsistency после save.** `/api/marketplace/raboty/:slug` имеет `Cache-Control: public, max-age=300`. После save save_count может расходиться с показанным до 5 минут. Mitigation: сам save-toggle оптимистично обновляет UI, после reload — расхождение в пределах 5 минут (приемлемо).

**R7. Market-stats data-skew на старте.** Когда у нас 50 кейсов, `count >= 5` для большинства комбинаций (service+area-bucket) не выполнится — секция скроется. Это Right™. По мере накопления кейсов секция прокрашивается естественно.

**R8. Тип жилья — backfill.** Существующие записи получают `NULL` в колонке. Нет необходимости в backfill. Мастер заполняет при следующем редактировании. UI скрывает чип «Тип жилья» если null.

**R9. Auto-claim flow для анонимных сохранений.** Триггерится при первом логине пользователя в кабинет. Проверка: `cookie.kiro_anon_id != null AND user_saves.user_id IS NULL FOR THAT anon_id`. Транзакция UPDATE. Toast «Перенесли N сохранённых ремонтов в ваш аккаунт». Файл — отдельная задача в tasks.md (привязана к существующему /api/cabinet/auth-flow).

## 10. Observability

**Metrics (existing Yandex.Metrika hooks):**

- `case_page_view` — рендер страницы (existing)
- `case_gallery_open_lightbox` — клик в галерее (NEW Iter 1)
- `case_cta_primary_click` — клик «Хочу такой же» (NEW Iter 1)
- `case_share_clicked` — поделиться (native | clipboard) (NEW Iter 1)
- `case_save_toggled` — save/unsave (NEW Iter 4) — с label `direction: 'save' | 'unsave'`
- `case_market_stats_visible` — секция отрисовалась (NEW Iter 3)

**Server-side logs:** existing console.error, никаких новых dependencies.

**Performance budget:** LCP target ≤ 2.5s на 3G. Главное фото галереи `loading="eager"` + `fetchPriority="high"`. Остальные фото — lazy.

## 11. Acceptance — design считается принятым к Tasks-фазе когда

- [ ] Component tree (§2) одобрен
- [ ] Component contracts (§3) одобрены — особенно State management в client islands
- [ ] DB schema (§4) одобрена — особенно JSONB для estimate (vs columns)
- [ ] API contracts (§5) одобрены — особенно `MarketStatsResponse` shape и save-toggle логика
- [ ] Iteration breakdown (§8) одобрен — какая итерация коммитится первой
