# AI-дизайнер — реальная генерация интерьера (production-grade)

> **Цель:** Превратить `/dizajn` из stub-лендинга в работающий инструмент.
> Главная стратегическая роль — L1 контентного двигателя (~100K SEO-страниц
> через комбинаторику комната × стиль × площадь × город × бюджет).
>
> **Принцип:** Сразу production, не MVP. Архитектура решений принимается
> один раз, чтобы не переписывать.

---

## 1. Архетип / DNA

**Pinterest для ремонта**: пользователь приходит → загружает фото своей
комнаты → выбирает стиль → за 20-30 секунд получает 1-3 варианта дизайна →
сохраняет → подбирает мастера, который повторит.

Не «попробуйте 8 стилей одновременно» (Houzz Sweeten flow) — это съедает
GPU-бюджет. И не «AI как chat-bot» (диалоговый интерфейс) — это уход от
inspiration-DNA.

**1 запрос = 1 фото + 1 стиль = 1 результат**. Просто.

---

## 2. Архитектурные решения (production от старта)

### 2.1 Generation flow — **ASYNC**, не sync

**Поток:**
```
POST /api/dizajn/generate
  ↓ validate + rate-limit + Turnstile token
  ↓ INSERT ai_designs row (status='pending')
  ↓ ENQUEUE Fal.ai call (fire-and-forget background)
  ← return { slug, status: 'pending' }    [HTTP 202 Accepted]

GET /api/dizajn/{slug}
  ← {
      status: 'pending' | 'success' | 'failed',
      result: { resultImageUrl, ... } | null,
      progress: 0-100
    }

Client polling: каждые 2s до status=success/failed (max 60s timeout)

Background worker (на api-server):
  • Picks up status='pending' rows
  • Calls Fal.ai img2img
  • На успех: download result → upload R2 → moderation check → UPDATE status='success'
  • На ошибку: retry 1 раз → UPDATE status='failed' + error_message
```

**Почему async:**
- 504 timeout invariant'но возникает на длинных gen (Cloudflare 100s, Railway 60s)
- Polling 2s → instant feedback if 5s gen, smooth UX if 30s gen
- Production-pattern, переписать sync→async позже = ад
- Backpressure без блокировки HTTP worker'ов

### 2.2 Image generation provider — **Fal.ai FLUX-dev**

| Провайдер | Цена за gen | Latency | Качество интерьеров |
|---|---|---|---|
| **Fal.ai FLUX-dev img2img** | $0.005-0.02 | 5-15 сек | хорошее ⭐ |
| Replicate SDXL/FLUX | $0.01-0.05 | 15-60 сек | хорошее (медленнее) |
| OpenAI DALL-E 3 | $0.04-0.08 | 10-30 сек | отличное (дороже × 5) |
| Stability API SD3.5 | $0.04 | 5-10 сек | средний |

**Fal.ai FLUX-dev** — оптимальный по cost+latency+качеству. img2img с
denoising strength ~0.7 сохраняет геометрию комнаты, меняет отделку.

**Per-room prompts** (важно для качества):
```typescript
const PROMPTS = {
  bathroom: "luxury {style} bathroom interior, photo realistic, magazine quality, well-lit, 8k, architectural digest, no people",
  kitchen: "modern {style} kitchen interior, photo realistic, magazine quality, natural lighting, 8k, no people",
  living_room: "elegant {style} living room interior, photo realistic, professional interior photography, 8k, no people",
  bedroom: "cozy {style} bedroom interior, photo realistic, soft natural lighting, magazine quality, 8k, no people",
  hallway: "minimalist {style} hallway interior, photo realistic, professional photography, 8k, no people",
  apartment: "elegant {style} apartment interior overview, photo realistic, magazine quality, 8k, no people",
};
```

Negative prompt (избегаем артефакты):
```
"text, watermark, blurry, distorted, deformed, extra limbs, ugly, cartoon, illustration, painting, low quality, jpeg artifacts"
```

### 2.3 Storage — R2 (уже подключен)

```
dizajn/uploads/{uuid}.{ext}    — original user photo (private, ACL: anon-id-only)
dizajn/results/{slug}.jpg      — generated result (public, web-accessible)
dizajn/thumbs/{slug}.webp      — 600px thumbnail (public, для list/feed)
```

Cloudflare R2 image transformation API позволяет ресайзить on-the-fly через
URL params — не нужен отдельный thumbnail bucket. Используем CDN-trick.

### 2.4 Abuse protection — **Cloudflare Turnstile + Postgres rate-limit**

С первой генерации:
- **Cloudflare Turnstile** invisible challenge перед `/generate` (free 1M/мес)
  — отсекает 95% бот-атак, не блокирует UX
- **Postgres rate-limit table** `rate_limits(key, count, window_start)`:
  - 5 gens / anon_id / day
  - 30 gens / IP / day
  - При превышении — HTTP 429 + сообщение «Лимит на сегодня. Завтра можно
    ещё 5 раз»
- **Hard cap** в env: `AI_DESIGNS_GLOBAL_DAILY_CAP=2000`. При достижении —
  возврат 503 «Сервис временно перегружен» + email админу

### 2.5 NSFW / abuse content

**Pre-gen:** Fal.ai встроенные safety filters (блокируют output до возврата).

**Post-gen:** OpenAI Moderation API ($free) на сгенерированном изображении.
Если flagged → `is_published=false`, не показываем публично, но возвращаем
автору (он видит свой результат). Соответствие 152-ФЗ + bezopasnost'.

### 2.6 SEO от старта

- `/dizajn/[slug]` имеет полный JSON-LD (`ImageObject` + `CreativeWork`)
- og:image, twitter:card, canonical из публичной R2 URL
- Sitemap включает только `is_published=true AND status='success'`
- robots.txt разрешает crawl `/dizajn/*` (но не `/api/*`)
- Per-room style aggregate pages `/dizajn/{room}-{style}` (Iter 2 cmd —
  готовим SEO-двигатель сразу)

---

## 3. Data model

### 3.1 Новая таблица `ai_designs`

```sql
CREATE TYPE ai_design_status AS ENUM ('pending', 'success', 'failed');

CREATE TABLE ai_designs (
  id            SERIAL PRIMARY KEY,
  slug          VARCHAR(160) UNIQUE NOT NULL,
  anon_id       UUID NOT NULL,
  user_id       INTEGER REFERENCES users(id),  -- claim после login

  -- Параметры генерации
  room          VARCHAR(40) NOT NULL,
  style         VARCHAR(40) NOT NULL,
  area          NUMERIC(6,2),
  city_id       INTEGER REFERENCES cities(id),
  budget        VARCHAR(20),                   -- 'low'|'medium'|'high'|null

  -- Изображения (R2 paths)
  source_image_url    TEXT,                    -- /objects/dizajn/uploads/{uuid}.jpg
  result_image_url    TEXT,                    -- public R2 URL (NULL пока pending)
  prompt              TEXT,                    -- отправленный в Fal.ai prompt

  -- Status / lifecycle
  status         ai_design_status NOT NULL DEFAULT 'pending',
  fal_request_id TEXT,                         -- Fal.ai job ID
  error_message  TEXT,
  generation_ms  INTEGER,                      -- сколько заняло (для метрик)

  -- Moderation
  is_published   BOOLEAN NOT NULL DEFAULT TRUE,
  moderation_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  moderation_reason  TEXT,

  -- Engagement (мирорим pattern из master_portfolio)
  view_count    INTEGER NOT NULL DEFAULT 0,
  save_count    INTEGER NOT NULL DEFAULT 0,

  -- IP для rate-limit + audit
  client_ip     INET,

  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMP                      -- когда status стал success/failed
);

CREATE INDEX ai_designs_anon_idx ON ai_designs(anon_id, created_at DESC);
CREATE INDEX ai_designs_pending_idx ON ai_designs(status, created_at) WHERE status = 'pending';
CREATE INDEX ai_designs_published_idx ON ai_designs(is_published, status, created_at DESC) WHERE is_published = TRUE AND status = 'success';
CREATE INDEX ai_designs_room_style_idx ON ai_designs(room, style) WHERE is_published = TRUE AND status = 'success';
CREATE INDEX ai_designs_room_style_city_idx ON ai_designs(room, style, city_id) WHERE is_published = TRUE AND status = 'success';
```

**Slug:** `{room}-{style}-{nanoid8}`. Пример:
`vannaya-skandinavskiy-x7k9p2ab`. nanoid8 = 8 chars, ~10^14 combinations.

### 3.2 Rate-limit таблица `rate_limits`

```sql
CREATE TABLE rate_limits (
  key         VARCHAR(80) PRIMARY KEY,    -- "ai_gen:anon:{uuid}" or "ai_gen:ip:{ip}"
  count       INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX rate_limits_window_idx ON rate_limits(window_start);
-- Cleanup задача удаляет старые записи каждые сутки
```

### 3.3 Расширить `user_saves` для AI-дизайнов (Iter 3)

```sql
ALTER TABLE user_saves ADD COLUMN target_type VARCHAR(20) NOT NULL DEFAULT 'portfolio';
ALTER TABLE user_saves ADD CONSTRAINT user_saves_target_type_check
  CHECK (target_type IN ('portfolio', 'ai_design'));

-- Существующие unique индексы переписываем на (anon_id, target_type, target_id)
DROP INDEX user_saves_anon_portfolio_unique;
CREATE UNIQUE INDEX user_saves_anon_target_unique
  ON user_saves(anon_id, target_type, target_id)
  WHERE anon_id IS NOT NULL;
-- Аналогично для user_id
```

---

## 4. API endpoints

### `POST /api/dizajn/generate`

```typescript
multipart/form-data {
  image: File                  // ≤8MB, jpeg/png/webp
  room: string                 // enum
  style: string                // enum
  area?: number
  citySlug?: string
  budget?: 'low'|'medium'|'high'
  turnstileToken: string       // Cloudflare Turnstile widget token
}

Response 202 Accepted:
{ ok: true, design: { slug, status: 'pending' } }

Response 429 Too Many Requests:
{ ok: false, error: 'rate_limit', retryAfterSeconds, dailyLimit, used }

Response 400 Bad Request:
{ ok: false, error: 'invalid_input' | 'invalid_token' | 'file_too_large' }
```

Steps на api-server:
1. Validate Turnstile token (Cloudflare API)
2. Validate inputs (file size, mime, enum values)
3. Check rate-limit (anon_id + IP)
4. Get/set `kiro_anon_id` cookie (если нет)
5. Upload original to R2 (private)
6. INSERT ai_designs row (status='pending', fal_request_id=null)
7. **fire-and-forget** background worker (не ждём!)
8. Return 202 with slug

Background worker (`startAiDesignWorker()` запускается в `index.ts`):
- Каждые 5s: SELECT 1 pending row WHERE created_at > now() - 5min
- Build prompt, call Fal.ai img2img
- На success: download result, upload R2 (public), OpenAI Moderation check,
  UPDATE row status='success' (или is_published=false если flagged)
- На failure (network error / Fal.ai error): retry 1 раз → UPDATE failed
- Логирование cost per gen для daily aggregate

### `GET /api/dizajn/[slug]`

```typescript
Response:
{
  design: {
    id, slug, room, style, status,
    sourceImageUrl: string | null,    // только если owner (anon_id match)
    resultImageUrl: string | null,    // null пока pending
    progress: 0-100,                   // estimate based on elapsed time
    saveCount, viewCount,
    isOwner: boolean,
    createdAt, completedAt
  },
  similar?: AiDesignDTO[]              // 4 same room+style (только если status=success)
}
```

### `GET /api/dizajn` (list)

Аггрегатор для homepage feed + admin:
- query: `?room=X&style=Y&limit=N&page=N`
- Только `is_published=true AND status='success'`
- Sorted by `created_at DESC`
- Cached 5min

### `POST /api/dizajn/[slug]/save` (Iter 3)

Reuse pattern из `/api/raboty/[slug]/save` с `target_type='ai_design'`.

### `POST /api/dizajn/[slug]/lead` (Iter 4)

Lead form с pre-filled room+style+city из дизайна. Backend через
`/api/leads` существующий с extra meta `{ aiDesignSlug }`.

---

## 5. Pages

### 5.1 `/dizajn` (landing) — переписать

Layout:
- **Hero:** Lora H1 + subhead + upload form прямо в hero (не уходить в /new)
  - File picker (camera-capable on mobile: `accept="image/*" capture`)
  - Room select (6 options, line-icons)
  - Style select (6 options, line-icons)
  - [optional] City + area + budget (collapsed by default)
  - Turnstile widget
  - CTA «Создать дизайн»
- **Recent generations:** live feed of last 12 successful published designs
  (replace HomeAIDesigns hardcoded → real data)
- **How it works:** 3 шага, magazine tone (без 4 numbered tiles из старого)
- **FAQ:** короткий 4-5 questions, magazine details-style

### 5.2 `/dizajn/[slug]` (NEW page)

Polling state machine:
1. **status='pending':** spinner-illustration + estimated progress bar +
   «Готовим ваш дизайн… ~15 сек»
2. **status='success':** result image (16:9) + meta sidebar + lead-CTA
   «Хочу такой же» + similar designs внизу
3. **status='failed':** error illustration + «Что-то пошло не так» +
   retry button

Layout (на success):
- Hero: result image full-width
- Two-col below: large image | sidebar (room/style/area/city/save-count/CTA)
- Section: «Похожие дизайны» (4 cards same room+style)
- JSON-LD ImageObject + CreativeWork

### 5.3 `/dizajn/new` — удалить, redirect 308 → `/dizajn`

### 5.4 `/dizajn/{room}-{style}` (Iter 2 — SEO landing)

Aggregate page:
- Hero: «Идеи дизайна {style} {room.genitive}» (e.g. «Идеи дизайна
  скандинавской ванной»)
- Grid 12 designs published this room+style, sorted by save_count desc
- CTA «Создайте свой» → `/dizajn` с pre-filled room+style
- Bottom: link to `/raboty?room=X` (real cases) for lead flow

Pre-seeding (Iter 2 admin job): admin может сгенерить 50-100 starter
дизайнов через CLI script — text2img only (без user upload), помеченные
`is_published=true, anon_id=null`. Это важно чтобы при первом visite
страница не была пустая.

---

## 6. Iterations / Commits

### Commit 1 — **Foundation + working async generation** (1.5-2 дня кода)

DB:
- migration `ai_designs` + `rate_limits` + ENUM
- drizzle schema
- индексы

Backend:
- Fal.ai SDK integration (`@fal-ai/client`)
- OpenAI Moderation client
- Cloudflare Turnstile validation
- POST /api/dizajn/generate (validation + queue)
- GET /api/dizajn/[slug]
- GET /api/dizajn (list)
- Background worker function
- Rate-limit module

Frontend:
- /dizajn redesigned с upload form
- /dizajn/[slug] с polling
- /dizajn/new deleted (308 redirect)
- HomeAIDesigns wired to live feed
- ENV: FAL_API_KEY, TURNSTILE_SECRET, OPENAI_API_KEY

Verify:
- typecheck чисто
- 1 успешная генерация end-to-end на staging

### Commit 2 — **SEO landing pages + sitemap** (1 день)

- /dizajn/{room}-{style} aggregate
- Admin CLI script `pnpm seed-ai-designs` для starter generation
- sitemap.xml включает /dizajn/{slug} + /dizajn/{room}-{style}
- og-image для соц. share
- robots.txt update

### Commit 3 — **Save flow + lead funnel** (0.5 дня)

- user_saves расширение под target_type
- POST /api/dizajn/[slug]/save
- /izbrannoe показывает оба типа с табами
- POST /api/dizajn/[slug]/lead с prefill
- «Хочу такой же» button working

### Iter 4 (отдельный спек) — Editor accounts / claim-flow
Когда подключим client-auth, anon designs auto-claim к user_id. Редактирование
своих, удаление, приватность settings.

---

## 7. Зависимости / Env / Keys

**Что нужно настроить перед стартом:**

| Variable | Где взять | Примечание |
|---|---|---|
| `FAL_API_KEY` | https://fal.ai/dashboard/keys | Регистрация ~5 минут, нужно пополнить $20-50 для старта |
| `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET` | https://dash.cloudflare.com/?to=/:account/turnstile | Free, 1M challenges/мес |
| `OPENAI_API_KEY` | если уже есть | Moderation API — $0 (free tier) |
| `R2_*` | уже настроены ✓ | Просто добавить bucket-prefix `dizajn/` |

**Cost экономика:**
- Fal.ai: $0.01/gen × N
- R2: $0.015/GB stored, $0.36/M write requests, $0.36/M read requests
- OpenAI Moderation: $0
- Turnstile: $0
- **Total на старте при 100 gen/день:** ~$1/день. Масштабируется линейно.

---

## 8. Risks (production-grade mitigation)

**R1 — Fal.ai outage** → graceful failed-status + retry button. Refund
rate-limit slot. **Mitigation:** error rate >10% за 1 час → email админу.

**R2 — Cost runaway** → жёсткие caps (5/anon, 30/IP, 2000/global). Turnstile
от ботов. Cloudflare WAF rules позже если будут массовые атаки.

**R3 — NSFW / abuse content** → OpenAI Moderation post-check + Fal.ai
встроенные filters. Auto-unpublish flagged + log.

**R4 — Качество результата на разных rooms** → per-room prompt templates
+ negative prompt + seed control. Можно A/B-тестировать prompts позже.

**R5 — Image rights** → Fal.ai license разрешает commercial use generated.
User uploaded — checkbox «Я подтверждаю что это моё фото» обязателен.

**R6 — Privacy 152-ФЗ** → original photo store 30 days TTL → cron auto-delete.
Update privacy-policy с детализацией. Checkbox согласия.

**R7 — Worker dies / pending stuck** → cron job переводит pending older 5min
в failed. Alarm админу если queue > 10.

**R8 — Polling overload** → debounce client polling, max 30 polls (60 sec) →
показать пользователю «Что-то долго, мы напишем когда будет готово» +
push-notification (если разрешена).

---

## 9. Открытые вопросы (нужно от user'a)

**Q1 — FAL_API_KEY доступ?**
Зарегистрировать на твою почту? Или у тебя уже есть аккаунт Fal.ai?

**Q2 — Turnstile сайт-кей?**
Зарегистрируем на chestnye-mastera.ru — нужен доступ к Cloudflare домена.
Если нет — fallback на собственный rate-limit без challenge (выше риск
ботов, но рабочий вариант).

**Q3 — OPENAI_API_KEY уже есть в проекте?**
Если есть — возьмём оттуда. Если нет — moderation skip в первом коммите,
добавим во втором.

**Q4 — Pre-seeding starter designs?**
Iter 2 включает admin script для генерации 100-300 starter-дизайнов до
запуска, чтобы /dizajn/{room}-{style} страницы не были пустые. Cost
~$3-5. Делаем?

**Q5 — Подключаем сразу к sfera-master.ru или сначала staging?**
Staging — chestnye-mastera-staging.railway.app (если есть). Production —
chestnye-mastera.ru. Я склоняюсь к staging-сначала чтобы прогнать живые
генерации, потом промоут в production.

---

## 10. Метрики через 30 дней

- N генераций / день
- Conv rate generation → save (target 20%+)
- Conv rate generation → lead (target 2-5%)
- Cost / lead < $5
- /dizajn/{room}-{style} indexed pages в Яндекс/Google (target 200+ к месяцу 3)
