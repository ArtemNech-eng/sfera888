# Design — Visitor Fingerprint (на будущее)

## 1. Контекст

Этот документ — **план на будущее**, не задача к немедленной реализации. Зафиксирован чтобы вернуться когда:
- Появятся реальные атаки на `save_count` (накрутка через очистку cookie)
- Захочется кросс-сессионная аналитика «уникальные посетители» точнее, чем Метрика
- Подключим клиентские аккаунты и захотим автоматически узнавать вернувшегося анонимного пользователя

**Что fingerprint умеет**: уникально идентифицировать устройство в рамках нашего домена.
**Что fingerprint НЕ умеет**: давать телефон, читать чужие cookie, работать кросс-устройственно, заменять явный логин.

---

## 2. Три уровня возможностей

### Tier 1 — Lightweight signature (анти-абуз)

**Цель**: предотвратить накрутку счётчиков (save_count, view_count) через очистку cookie.

**Сигналы**:
- `User-Agent`
- `screen.width × screen.height × colorDepth`
- `Intl.DateTimeFormat().resolvedOptions().timeZone`
- `navigator.platform`
- `navigator.language`

**Хеш**: SHA-256 от конкатенации этих 5 строк, обрезанный до 16 hex-символов (64 бита — достаточно при <10М устройств).

**Энтропия**: ~15-20 бит. Не уникально между похожими устройствами (два iPhone 15 Pro в одной TZ дадут один хеш). Это нормально — нам не нужна уникальность, нужна **защита от тривиальной накрутки**.

**Privacy footprint**: минимальный. Все эти сигналы и так шлются в HTTP-заголовках при каждом запросе.

**Legal**: достаточно одной строки в политике приватности «для защиты от ботов мы хешируем технические параметры браузера».

### Tier 2 — Stable visitor ID (cross-cookie persistence)

**Цель**: помнить юзера после очистки cookie. Когда он чистит куки и снова заходит — мы по fingerprint вспоминаем «это тот же посетитель» и восстанавливаем его сохранения.

**Сигналы**: Tier 1 + три тяжёлых:
- **Canvas hash** — рендерим невидимый текст на canvas, считаем SHA от пикселей. ~10 бит.
- **WebGL renderer** — название GPU из `navigator.gpu` или `WEBGL_debug_renderer_info`. ~5-7 бит.
- **Font list** — детектируем 30 шрифтов через измерение ширины текста. ~6-8 бит.

**Энтропия суммарно**: ~30-40 бит. Среди миллиона устройств уникален с вероятностью ~95-99%.

**Privacy footprint**: средний. Canvas + WebGL Минцифры РФ в письме 2023 года квалифицировал как идентификатор устройства = ПДн.

**Legal требования**:
- Cookie-banner обязателен (см. §6)
- Раздел в политике конфиденциальности «Технические идентификаторы устройства»
- Endpoint `DELETE /api/me/fingerprint` — право пользователя на удаление

### Tier 3 — Full cross-session ID

Audio fingerprint, battery, hardware concurrency, plugins, accelerometer, MediaCapabilities, codec support — добивает энтропию до 50+ бит.

**Не строим сами**. Аргументы:
- На уровне Tier 3 уже работает Яндекс.Метрика — она именно это и делает под капотом, бесплатно, юридически покрыто (если у нас стоит баннер «используем Метрику»)
- Самосбор Tier 3 = повторение работы Метрики без её партнёрств с Яндексом
- Для retargeting'а Метрика → Яндекс.Директ уже даёт сегменты «посетители кейса ванной, не оставившие заявку»
- Полноценные SDK типа FingerprintJS Pro стоят $200-2000/мес и берут на себя юр-обвязку

**Решение**: Tier 3 не делаем, retargeting гоним через Метрику.

---

## 3. Архитектура (когда дойдёт до реализации Tier 1)

```
artifacts/marketplace/
├── lib/
│   └── fingerprint.ts          # клиентский сборщик хеша
└── app/api/raboty/[slug]/save/
    └── route.ts                # принимает fingerprint в body, форвардит на api-server

artifacts/api-server/src/
├── lib/
│   └── fingerprintRateLimit.ts # in-memory bucket по device_hash
└── routes/
    └── marketplace.ts          # /save endpoint валидирует fingerprint и rate-limit'ит

lib/db/src/schema/
└── master-portfolio.ts         # колонка user_saves.device_hash CHAR(16)
```

**Клиентский сборщик** (`lib/fingerprint.ts`):
```ts
export async function computeDeviceHash(): Promise<string> {
  const parts = [
    navigator.userAgent,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.platform,
    navigator.language,
  ].join('|');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts));
  return Array.from(new Uint8Array(buf))
    .slice(0, 8)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

Кешируется в `localStorage` на 7 дней — пересчитывать на каждой странице бессмысленно.

**Rate-limit на api-server**:
- `30 saves/мин` по `device_hash` (заодно с per-IP)
- Просечь fingerprint можно через VPN+другой браузер, но это выше порога «обычный пользователь»

---

## 4. DB schema

**Phase F1** — простое расширение существующей `user_saves`:

```sql
ALTER TABLE user_saves ADD COLUMN device_hash CHAR(16);
CREATE INDEX user_saves_device_hash_idx
  ON user_saves (device_hash)
  WHERE device_hash IS NOT NULL;
```

**Phase F3** (если когда-то дойдём до Tier 2) — отдельная таблица:

```sql
CREATE TABLE visitor_fingerprints (
  device_hash       CHAR(16) PRIMARY KEY,
  canvas_hash       CHAR(16),
  webgl_hash        CHAR(16),
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visit_count       INTEGER NOT NULL DEFAULT 1,
  -- Когда подключим клиентские аккаунты:
  user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- Когда отправил заявку:
  last_lead_id      INTEGER REFERENCES leads(id) ON DELETE SET NULL
);
```

Эта таблица — мост между анонимом и идентичным юзером. Если отправил заявку → `last_lead_id` ссылается. Если потом залогинился → `user_id`. Эта связь важна для retention.

---

## 5. Cross-session match при отправке заявки

Сценарий: пользователь сохранил 3 кейса анонимно, потом отправил заявку с телефоном.

**Что делаем при создании лида** (на api-server, в `POST /marketplace/leads`):

```ts
if (body.deviceHash) {
  // Сматчиваем все save'ы этого устройства с лидом
  await db.update(userSavesTable)
    .set({ matchedLeadId: leadId })
    .where(eq(userSavesTable.deviceHash, body.deviceHash));
  
  // Маркетинговый сигнал в CRM:
  // «этот лид сохранял до отправки заявки 3 кейса — кейсы X, Y, Z»
  await db.insert(leadEventsTable).values({
    leadId,
    eventType: 'fingerprint_matched_saves',
    description: `Связали с ${count} анонимными сохранениями`,
  });
}
```

Это позволит оператору CRM видеть в карточке лида: «До заявки клиент сохранил кейсы ванная-1, ванная-2, кухня-3 → понимает что хочет, готов».

Это **легально** — мы связываем технический отпечаток с **телефоном, который пользователь сам нам отдал в форме**, не получая телефон извне.

---

## 6. Cookie consent banner (обязательная инфра до любого Tier'а)

Юридически РКН требует баннер уже **сейчас**, для нашей текущей `kiro_anon_id` cookie. Это нужно сделать в любом случае, не привязано к fingerprint.

**Минимальная реализация** (~3 часа):

```
┌──────────────────────────────────────────────────────┐
│  Используем cookies и технические параметры устройства│
│  для работы сохранений и защиты от ботов.            │
│  [Подробнее в политике]    [Понятно]                 │
└──────────────────────────────────────────────────────┘
```

- Bottom sheet на mobile, тонкая плашка снизу на desktop
- Скрывается при первом клике, флаг в localStorage
- Не блокирует контент (это важно — блокирующие баннеры конверсию убивают)
- Раздел в `/policy/privacy` с детальным списком что собираем

**Региональная вариация**: для EU посетителей по-хорошему нужен GDPR-style opt-in (нельзя собирать до согласия). На v1 — определяем регион по `Accept-Language` или `geo-IP`, для не-RU показываем строгую версию. Большинство наших пользователей в RU, можно отложить.

---

## 7. Что точно НЕ делаем (anti-pattern список)

- ❌ Покупка чужих fingerprint-баз для match'а на телефоны
- ❌ Интеграция с серыми деанонимайзерами (LeadHit, B2B Family и т.п.)
- ❌ Cross-site tracking — наш fingerprint живёт только в нашем домене
- ❌ Передача fingerprint третьим сторонам (кроме Метрики, которая уже легально это делает)
- ❌ Использование fingerprint для прозвона / SMS-рассылки людям, которые не оставляли контакт
- ❌ Скрытое (без баннера) хранение canvas/WebGL hash — это РКН-штраф

---

## 8. Phasing

| Фаза | Что | Когда триггер | Затраты |
|---|---|---|---|
| **F0** | Cookie banner + privacy policy | Перед Iter 4 (sieving cookie). Уже **должно быть** | ~3 ч |
| **F1** | Tier 1 fingerprint в `user_saves.device_hash` | Если увидим реальную накрутку save_count | ~3 ч |
| **F2** | Match лида с анонимными saves через device_hash | Когда готов F1 + Iter 4 | ~2 ч |
| **F3** | Tier 2 (canvas+webgl+fonts) + visitor_fingerprints таблица | Если пользователи массово очищают cookie и теряют избранное | ~6 ч |
| **F4** | Auto-claim fingerprint → user_id при первом логине клиента | Когда подключим клиентские аккаунты (= новый большой блок работ) | ~4 ч |
| **F5** | Tier 3 — НЕ ДЕЛАЕМ. Используем Метрику для retargeting'а | — | 0 ч |

---

## 9. Open questions / решения на будущее

**Q-F1.** Использовать готовый SDK (`fingerprintjs/fingerprintjs` open-source, MIT) или написать свой?
- SDK даёт Tier 2 «из коробки» (~30-40 бит энтропии), 6 KB gzipped.
- Свой = ~50 строк, Tier 1 (~15-20 бит).
- **Рекомендация**: свой для F1. SDK — если когда-нибудь дойдём до F3.

**Q-F2.** Сохранять fingerprint в `leads.client_fingerprint` при отправке заявки?
- Pro: даёт кросс-сессионный match для CRM («этот лид раньше сохранял X»)
- Con: одна колонка в leads, нужна в политике приватности
- **Рекомендация**: да, в F2 (см. §5)

**Q-F3.** Региональная стратегия (RU vs EU)?
- v1: общий баннер, focus on 152-ФЗ
- Future: geo-IP detection → стрикт opt-in для EU
- **Решение позже**, когда увидим долю не-RU трафика в Метрике

**Q-F4.** Нужен ли opt-out endpoint?
- РКН требует «право на забвение» — да, нужен
- Эндпоинт `POST /api/me/forget-device` → удаляет все user_saves + visitor_fingerprints с этим device_hash
- Реализация в F1, эндпоинт без UI; UI добавим если будут запросы

---

## 10. Acceptance criteria для F0 (когда начнём)

- [ ] Cookie banner появляется на первом визите, скрывается после клика «Понятно»
- [ ] localStorage флаг `kiro_consent_v1=accepted` после клика
- [ ] Раздел в `/policy/privacy` с описанием cookie + fingerprint
- [ ] Проверка из РКН/Минцифры: совпадает с актуальной редакцией 152-ФЗ
- [ ] Banner **не закрывает** контент, не блокирует первый клик пользователя

## 11. Acceptance для F1 (когда нужно)

- [ ] `lib/fingerprint.ts` существует, возвращает 16-hex hash
- [ ] localStorage кеш на 7 дней
- [ ] Save endpoint принимает `deviceHash`, валидирует regex `/^[0-9a-f]{16}$/`
- [ ] Rate-limit на api-server: 30 toggles/мин на device_hash
- [ ] Колонка `user_saves.device_hash` создана через миграцию
- [ ] Никаких изменений в политике приватности кроме одной строки про «технические параметры браузера для защиты от ботов»

---

## Резюме

- **Сейчас** — fingerprint **не делаем**. Анонимная cookie + Метрика для ретаргетинга покрывают 90% задачи.
- **Перед Iter 4** — обязательно cookie banner + политика (это **независимо** от fingerprint, нужно по 152-ФЗ).
- **Если увидим реальную накрутку save_count** — добавляем F1 (Tier 1, ~3 часа).
- **Когда подключим клиентские аккаунты** — добавляем F4 (auto-claim).
- **Tier 3 / cross-site** — никогда. Это работа Метрики.

Этот план остаётся в `.kiro/specs/visitor-fingerprint/` как дорожная карта, пока триггеры не появятся.
