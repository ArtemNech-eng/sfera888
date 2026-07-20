# Design — Real Price (Реальная цена)

## Обзор архитектуры

Маховик из четырёх звеньев, каждое опирается на уже существующий код:

```
Мастер в /cabinet (единый Zen-мир, Owner_Mode)
        │  заполняет Объект: клиент/адрес · этапы+позиции (словарь) · фото до/после
        ▼
Объект (receipts, расширенная)  ──завершение заказа──►  публикация
        │                                               │
        │ Verified_Price_Point (нормализованные точки)   │ кейс-страница /raboty/{slug}
        ▼                                               ▼
Aggregate (percentile_cont, n-порог)            SEO/AI трафик
        │                                               │
        ▼                                               ▼
/ceny/{услуга}/{город}[/{жк}] · /indeks · /proverit-смету  ──►  лид ──► новый заказ ──► новый Объект
```

## Что переиспользуем (не строим заново)

| Звено брифа | Существующий код |
|---|---|
| Смета с позициями | `receipts.lineItems` (jsonb `LineItem[]`) |
| Перцентили P25/P75 + пороги n + кэш | `routes/marketplace.ts` `/raboty/market-stats`, `lib/marketStatsCache.ts` |
| Гейт индексируемости (`is_indexable`) | `lib/seoContentThreshold.ts` |
| Кейс-страницы | `/raboty/[slug]`, `master_portfolio` (Houzz-модель, пустая — засеваем) |
| Мгновенная индексация + ISR | `lib/indexNow.ts`, `lib/marketplaceRevalidate.ts` |
| Единый визуальный язык | Zen дизайн-система в `globals.css` (уже site-wide) |
| Кабинет мастера (порт master-PWA) | `app/cabinet/*`, `/api/cabinet/*` → `/api/master-pwa/*` |
| Калькулятор/оценка | `lib/calculatorEngine.ts`, `lib/materialsEstimator.ts` |

## Модель данных

### Объект — расширение `receipts` (additive, без rename)

Растим существующую таблицу (на ней завязано 25+ модулей — переименование запрещено):

```
receipts (существующее: id, token, order_id FK, master_id, client_name/phone,
          service_type, city, district, line_items jsonb, total_amount,
          prepayment_*, client confirmation …)
  + object_type      varchar   -- 'project' | 'task'  (по WorkType.category)
  + source           varchar   -- 'platform' | 'self_added'
  + area             numeric    -- площадь, м²
  + zhk              varchar    -- ЖК (публичный), без точного адреса
  + stages           jsonb      -- [{ title, order, lineItems:[{workTypeId, name, unit, qty, unitPrice, sum}] }]
  + is_published     boolean default false
  + published_at     timestamp
  + is_indexable     boolean default false   -- meetsContentThreshold(...)
  + publish_consent  boolean default false   -- согласие клиента на фото
  + slug             varchar unique
  + public_title / seo_title / seo_description
```

> `line_items` (плоский) остаётся для обратной совместимости; `stages` — новый носитель
> структуры «этапы → позиции». Позиция ссылается на `work_type_id`.

### Словарь видов работ

Новая таблица `work_types` (или расширение `service_types` полями `unit`, `synonyms`,
`category`). Поля: `id, slug, name, category (project|task), default_unit, synonyms[]`.
`service_types` (20 услуг, дерево категорий) остаётся верхним уровнем; `work_types` —
гранулярнее (напр. «Укладка плитки на стены, м²»).

### Verified_Price_Point (нормализованная точка)

Отдельная узкая таблица для SQL-агрегации (удобнее, чем перцентили по jsonb):

```
price_points
  id, order_id FK, object_id (receipt id), master_id
  work_type_id FK, unit, quantity, unit_price, total
  city, district, zhk, closed_at, source
  (индексы: (work_type_id, city, closed_at), (work_type_id, district))
```

Заполняется при завершении заказа из `stages.lineItems` (только позиции с `work_type_id`).

### Aggregate (витрина для страниц)

```
price_aggregates
  key_type ('work_city' | 'work_zhk'), work_type_id, city, district/zhk
  p25, p50, p75, n, series_12m jsonb, updated_at, is_indexable
```

Денормализованная; пересчёт по завершению заказа/cron. `is_indexable = n >= N` через
`meetsContentThreshold`.

## Модуль агрегации

- Расширяем SQL из `/raboty/market-stats` (`percentile_cont(0.25/0.5/0.75)`) на таблицу
  `price_points` с `GROUP BY work_type_id, city[/district]`.
- Робастность: отсечение выбросов (например, вне [P50/3, P50×3]) до расчёта.
- Пороги: город `N≈5`, связка ЖК `N≈10` (конфиг env). Ниже — склейка ЖК→город, город→страна.
- Пересчёт: хук на `orders.status → completed` (после формирования price_points) +
  ночной cron для series_12m.

## Страницы (marketplace, Next.js)

- `/ceny/{услуга}/{город}/` и `/ceny/{услуга}/{город}/{жк}/` — SSG/ISR, данные из
  `price_aggregates`. Schema.org `Dataset` + `FAQPage`. `noindex` при `is_indexable=false`.
- `/raboty/{slug}` — кейс-страница Объекта (переиспользуем; сейчас пусто — засеваем из
  завершённых проектов). Блок «Реальная цена» (сумма vs медиана), смета по этапам,
  мастер (с согласия), CTA «Хочу такой же».
- `/indeks/` — индекс по месяцам (страна + Краснодар в v0).
- `/proverit-smetu` — проверятор: форма ввода/вставки позиций → вердикт vs медиана →
  OG-картинка. LLM-разбор файла — под-фаза (OpenAI-ключи есть).
- `/about/method` — методика.

Все — в Zen-стиле (единый визуальный язык уже в проде).

## Единый Zen-мир и Owner_Mode

- Залогиненный мастер видит общую Zen-шапку + аватар-меню + «＋ Создать объект».
- Публичные `/master/{slug}` и `/raboty/{slug}`: при просмотре владельцем — Owner_Mode с
  inline-контролами (SSR определяет владельца по сессии `masterId` == master объекта).
- Сфокусированный рабочий стол (`/cabinet` рабочие экраны) — тот же Zen-мир, app-вид на
  мобиле, приватные данные клиента только здесь.
- Текущий `/cabinet` — own-chrome; задача: подружить с общей шапкой и добавить Owner_Mode.

## Миграция master-PWA → единый режим (вариант B)

- Данные общие уже сейчас (`/api/cabinet/*` → `/api/master-pwa/*`, одна БД, `masterId` в сессии) —
  **физической миграции данных нет**.
- **B:** единый режим доступен под привычным мастеру доменом/входом (сохранить домен, сессию,
  push, закладки) → нулевое трение. Требует настройки роутинга/деплоя, чтобы кабинет
  отдавался и по старому адресу.
- Push: при необходимости — переподписка на актуальном скоупе, чтобы уведомления не замолкли.
- Диплинки из пушей/Max-бота → актуальные экраны.
- (Альтернатива A — простой редирект старый→новый — задокументирована, но выбран B.)

## Приватность (сквозное)

- Точный адрес и данные клиента — не публикуются (только ЖК/район).
- Имя мастера — только на его кейс-странице с согласия; в агрегат имя не идёт.
- Фото — только при `publish_consent`.
- Публично — только агрегаты и анонимные примеры.

## Риски и смягчение

| Риск | Смягчение |
|---|---|
| Мало данных → тонкие страницы роняют домен | Пороги `n` + `is_indexable` (готовый механизм); склейка до города/страны |
| Свободные описания несравнимы | Обяз. нормализация к `work_types`; без привязки — не в агрегат |
| Claim «подтверждено» размывается self_added | Явный `source`; self_added отдельным помеченным слоем |
| Медленный рост корпуса | Виральный проверятор смет тянет трафик, пока корпус растёт |
| Ломкость (25+ зависимостей на receipts) | Только additive-поля, без rename; полный текущий флоу сохраняется |
