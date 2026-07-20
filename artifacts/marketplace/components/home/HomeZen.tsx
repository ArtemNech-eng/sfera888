import Link from "next/link";
import type { RabotyListItem, Service, Master } from "../../lib/types";

/**
 * Главная маркетплейса в Zen-стиле (city-service нового поколения).
 *
 * Дизайн-язык — общая Zen-система (`.zen*` в globals.css), та же, что в
 * разделах «Соседи»/«ПРО»/«Услуги»: нейтральный светлый фон, гротеск Manrope,
 * коралловый акцент, мягкие карточки и контент-лента. Никаких стоковых фото —
 * визуал держат типографика, чипы и иконки; фото появляются только на своих
 * страницах (реальные кейсы/дизайны).
 *
 * Server component: данные (кейсы, услуги, мастера) приходят пропсами из
 * `app/page.tsx`. Секции с пустыми данными деградируют мягко.
 */

const CITY = "Краснодар";
const EXTERNAL_FOR_MASTERS = "https://sfera-master.ru/masteram";

const POPULAR: Array<{ label: string; href: string }> = [
  { label: "Санузел под ключ", href: "/raboty?room=vannaya" },
  { label: "Кухня", href: "/raboty?room=kuhnya" },
  { label: "Квартира под ключ", href: "/raboty?room=kvartira" },
  { label: "Электрика", href: "/raboty?style=minimalizm" },
  { label: "Тёмная палитра", href: "/raboty?palette=dark" },
];

const RAIL: Array<{ label: string; href: string; icon: React.ReactNode; active?: boolean }> = [
  { label: "Лента", href: "/", icon: <IconFeed />, active: true },
  { label: "Идеи ремонта", href: "/raboty", icon: <IconLayers /> },
  { label: "Вопросы соседей", href: "/soobshchestvo", icon: <IconChat /> },
  { label: "Цены и сметы", href: "/kalkulyator", icon: <IconCalc /> },
  { label: "Мастера", href: "/mastera", icon: <IconUsers /> },
  { label: "AI-дизайн", href: "/dizajn", icon: <IconWand /> },
];

interface Props {
  cases: RabotyListItem[];
  services: Service[];
  masters: Master[];
}

export function HomeZen({ cases, services, masters }: Props) {
  const feed = cases.slice(0, 6);
  const svc = services.slice(0, 12);
  const mastersTop = masters.slice(0, 4);

  return (
    <div className="zen">
      {/* ═══ HERO ═══ */}
      <div className="zen-shell" style={{ paddingBottom: 20 }}>
        <div className="zen-hero">
          <span className="zen-eyebrow">Сервис ремонта · {CITY}</span>
          <h1 className="zen-title">
            Ремонт в {CITY} — идеи, цены и мастера в одной ленте
          </h1>
          <p className="zen-sub">
            Смотрите реальные работы, читайте, что советуют соседи, считайте
            смету и находите проверенного мастера — всё в спокойной ленте, без
            навязчивости.
          </p>
          <form action="/raboty" method="get" className="zen-search" style={{ maxWidth: 620, marginTop: 22 }}>
            <IconSearch />
            <input
              className="zen-input"
              name="q"
              placeholder="Услуга, мастер или вопрос — например, «санузел под ключ»"
              aria-label="Поиск по сервису"
            />
          </form>
          <div className="zen-popular" style={{ marginTop: 14 }}>
            {POPULAR.map((p) => (
              <Link key={p.label} href={p.href} className="zen-pill">
                {p.label}
              </Link>
            ))}
          </div>
        </div>

        {/* ═══ RAIL + FEED ═══ */}
        <div className="zen-layout zen-layout--rail">
          <aside className="zen-rail">
            <div className="zen-rail-title">Разделы</div>
            {RAIL.map((r) => (
              <Link
                key={r.label}
                href={r.href}
                className={`zen-rail-item${r.active ? " is-active" : ""}`}
              >
                {r.icon} {r.label}
              </Link>
            ))}
          </aside>

          <main>
            {/* Быстрые действия */}
            <div className="zen-grid zen-grid--3">
              <Link className="zen-card" href="/dizajn">
                <div className="zen-cico"><IconWand /></div>
                <div className="zen-card-title">AI-дизайн комнаты</div>
                <div className="zen-card-sub">Загрузите фото — покажем результат за минуту.</div>
                <div className="zen-card-arrow">Создать →</div>
              </Link>
              <Link className="zen-card" href="/kalkulyator">
                <div className="zen-cico"><IconCalc /></div>
                <div className="zen-card-title">Калькулятор сметы</div>
                <div className="zen-card-sub">Бюджет по ценам {CITY}а — прозрачно, по пунктам.</div>
                <div className="zen-card-arrow">Посчитать →</div>
              </Link>
              <Link className="zen-card" href="/mastera">
                <div className="zen-cico"><IconUsers /></div>
                <div className="zen-card-title">Подобрать мастера</div>
                <div className="zen-card-sub">Проверенные мастера рядом — с рейтингом и отзывами.</div>
                <div className="zen-card-arrow">Найти →</div>
              </Link>
            </div>

            {/* Лента */}
            <h2 className="zen-section-title" style={{ marginTop: 28 }}>
              Лента ремонтов и советов
            </h2>
            {feed.length > 0 ? (
              <div className="zen-feed">
                {feed.map((c) => (
                  <Link key={c.id} href={caseHref(c)} className="zen-post">
                    <div className="zen-post-meta">
                      <span className="zen-chip">{c.service?.name ?? "Ремонт"}</span>
                      {c.city?.name ? <span className="zen-chip zen-chip--muted">{c.city.name}</span> : null}
                      {c.area ? <span>{formatArea(c.area)} м²</span> : null}
                    </div>
                    <div className="zen-post-title">{c.title}</div>
                    {caseExcerpt(c) ? <p className="zen-post-excerpt">{caseExcerpt(c)}</p> : null}
                    <div className="zen-post-foot">
                      {priceLabel(c.priceFrom) ? `${priceLabel(c.priceFrom)} · ` : ""}Открыть →
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="zen-empty">
                Каталог наполняется — первые работы мастеров {CITY}а появятся здесь.
              </div>
            )}
          </main>
        </div>
      </div>

      {/* ═══ УСЛУГИ ═══ */}
      {svc.length > 0 ? (
        <div className="zen-band zen-band--alt">
          <div className="zen-sec">
            <div className="zen-sec-head">
              <div>
                <h2 className="zen-h2">С чего начнём ремонт?</h2>
                <p>Выберите услугу — покажем мастеров, реальные работы и цены по {CITY}у.</p>
              </div>
              <Link className="zen-sec-link" href="/uslugi">Все услуги →</Link>
            </div>
            <div className="zen-svc-grid" style={{ background: "var(--z-surface)", border: "1px solid var(--z-line)", borderRadius: "var(--z-radius)", padding: 10, boxShadow: "var(--z-shadow)" }}>
              {svc.map((s) => (
                <Link key={s.id} href="/uslugi" className="zen-svc">
                  <span className="zen-svc-name">{s.name}</span>
                  {typeof s.priceFrom === "number" && s.priceFrom > 0 ? (
                    <span className="zen-svc-price">от {formatNumber(s.priceFrom)} ₽</span>
                  ) : null}
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* ═══ МАСТЕРА ═══ */}
      {mastersTop.length > 0 ? (
        <div className="zen-band">
          <div className="zen-sec">
            <div className="zen-sec-head">
              <div>
                <h2 className="zen-h2">Мастера {CITY}а</h2>
                <p>Открытые профили: рейтинг, отзывы, специализация и портфолио работ.</p>
              </div>
              <Link className="zen-sec-link" href="/mastera">Все мастера →</Link>
            </div>
            <div className="zen-grid4">
              {mastersTop.map((m) => (
                <Link key={m.id} href={m.slug ? `/master/${m.slug}` : "/mastera"} className="zen-mcard">
                  <div className="zen-mava">
                    {m.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.avatarUrl} alt={masterName(m)} loading="lazy" />
                    ) : (
                      initials(masterName(m))
                    )}
                  </div>
                  <h4>{masterName(m)}</h4>
                  <div className="zen-mrole">{masterRole(m)}</div>
                  {ratingLabel(m) ? (
                    <div className="zen-mrate">
                      <IconStar /> {ratingLabel(m)}
                      {m.publicReviewsCount > 0 ? <small>· {m.publicReviewsCount}</small> : null}
                    </div>
                  ) : null}
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* ═══ ЦЕНЫ ═══ */}
      <div className="zen-band zen-band--alt">
        <div className="zen-sec">
          <div className="zen-sec-head">
            <div>
              <h2 className="zen-h2">Знайте цену заранее</h2>
              <p>Собираем реальные сметы с объектов города и считаем бюджет по ценам {CITY}а — прозрачно, по пунктам.</p>
            </div>
          </div>
          <div className="zen-grid2" style={{ alignItems: "center" }}>
            <div className="zen-panel">
              <div className="zen-panel-title" style={{ fontSize: 22 }}>Калькулятор ремонта</div>
              <p className="zen-panel-sub">
                Ответьте на несколько вопросов о квартире — получите ориентир по
                бюджету и сразу увидите мастеров, готовых сделать за эти деньги.
              </p>
              <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link className="zen-btn" href="/kalkulyator">Посчитать бюджет</Link>
                <Link className="zen-btn zen-btn--ghost" href="/kalkulyator">Как считаем цену</Link>
              </div>
            </div>
            <div className="zen-smeta">
              <div className="zen-smeta-top">
                <b>Санузел под ключ · 6 м² · {CITY}</b>
                <span className="zen-chip zen-chip--muted">пример сметы</span>
              </div>
              <div className="zen-smeta-row"><span>Демонтаж и вывоз</span><span>18&nbsp;400 ₽</span></div>
              <div className="zen-smeta-row"><span>Черновые работы</span><span>52&nbsp;900 ₽</span></div>
              <div className="zen-smeta-row"><span>Плитка и укладка</span><span>74&nbsp;300 ₽</span></div>
              <div className="zen-smeta-row"><span>Сантехника и монтаж</span><span>41&nbsp;200 ₽</span></div>
              <div className="zen-smeta-total"><span style={{ color: "var(--z-muted)" }}>Итого работ</span><span className="v">186&nbsp;800 ₽</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ AI-ДИЗАЙН ═══ */}
      <div className="zen-band">
        <div className="zen-sec">
          <div className="zen-panel zen-panel--accent">
            <div className="zen-grid2" style={{ alignItems: "center", gap: 28 }}>
              <div>
                <span className="zen-eyebrow">AI-дизайн</span>
                <div className="zen-panel-title" style={{ fontSize: 26, marginTop: 6 }}>Дизайн вашей комнаты за минуту</div>
                <p style={{ color: "#8a4a3d", marginTop: 10, fontSize: 15 }}>
                  Загрузите фото комнаты — нейросеть покажет, как она может
                  выглядеть после ремонта, соберёт смету по ценам города и
                  предложит мастера, который повторит.
                </p>
                <div style={{ marginTop: 20 }}>
                  <Link className="zen-btn" href="/dizajn">Создать дизайн →</Link>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="zen-step"><div className="zen-cico" style={{ margin: 0 }}><IconWand /></div><div><div className="zen-card-title" style={{ fontSize: 15 }}>1. Загрузите фото</div><div className="zen-card-sub">Любой снимок комнаты с телефона.</div></div></div>
                <div className="zen-step"><div className="zen-cico" style={{ margin: 0 }}><IconLayers /></div><div><div className="zen-card-title" style={{ fontSize: 15 }}>2. Выберите стиль</div><div className="zen-card-sub">Минимализм, сканди, лофт и другие.</div></div></div>
                <div className="zen-step"><div className="zen-cico" style={{ margin: 0 }}><IconCalc /></div><div><div className="zen-card-title" style={{ fontSize: 15 }}>3. Смета и мастер</div><div className="zen-card-sub">Цена по {CITY}у + кто сделает.</div></div></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ СООБЩЕСТВО / СОСЕДИ ═══ */}
      <div className="zen-band zen-band--alt">
        <div className="zen-sec">
          <div className="zen-sec-head">
            <div>
              <h2 className="zen-h2">Спрашивают соседи</h2>
              <p>Задайте вопрос про ремонт — ответят мастера и жители {CITY}а. Реальный опыт вместо рекламы.</p>
            </div>
            <Link className="zen-sec-link" href="/soobshchestvo">В сообщество →</Link>
          </div>
          <div className="zen-grid2">
            <Link className="zen-post" href="/soobshchestvo">
              <div className="zen-post-meta"><span className="zen-chip">Сообщество</span></div>
              <div className="zen-post-title">Спросите совета у соседей</div>
              <p className="zen-post-excerpt">Не уверены в цене или мастере? Задайте вопрос — ответят те, кто уже сделал ремонт рядом с вами.</p>
              <div className="zen-post-foot">Задать вопрос →</div>
            </Link>
            <Link className="zen-post" href="/soobshchestvo">
              <div className="zen-post-meta"><span className="zen-chip">Сообщество</span></div>
              <div className="zen-post-title">Читайте обсуждения района</div>
              <p className="zen-post-excerpt">Истории ремонтов, цены и рекомендации от жителей {CITY}а — по районам и ЖК.</p>
              <div className="zen-post-foot">Открыть сообщество →</div>
            </Link>
          </div>
        </div>
      </div>

      {/* ═══ ДЛЯ МАСТЕРОВ ═══ */}
      <div className="zen-band">
        <div className="zen-sec">
          <div className="zen-panel zen-panel--dark">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
              <div>
                <span className="zen-eyebrow" style={{ color: "var(--z-accent)" }}>Мастерам</span>
                <div className="zen-panel-title" style={{ color: "#fff", marginTop: 6, fontSize: 24 }}>
                  Вы мастер в {CITY}е? Получайте заявки рядом
                </div>
                <p>Клиенты из вашего района, заказы и сметы в приложении — от заявки до закрытия. Подключение бесплатное.</p>
              </div>
              <a className="zen-btn" href={EXTERNAL_FOR_MASTERS} rel="noopener noreferrer">Стать мастером →</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── helpers ─────────────────────────────────────────────────────────── */

function caseHref(c: RabotyListItem): string {
  return c.slug ? `/raboty/${c.slug}` : "/raboty";
}

function caseExcerpt(c: RabotyListItem): string | null {
  if (c.description && c.description.trim()) return clip(c.description.trim(), 180);
  const parts = [c.service?.name, c.city?.name ? `в ${c.city.name}` : null].filter(Boolean);
  return parts.length ? `${parts.join(" ")} — реальный объект с ценами и мастером.` : null;
}

function masterName(m: Master): string {
  return m.publicTitle?.trim() || m.alias?.trim() || `Мастер #${m.id}`;
}

function masterRole(m: Master): string {
  const spec = m.specialization?.trim() || (m.specializations && m.specializations[0]) || "Мастер по ремонту";
  return m.city?.trim() ? `${spec} · ${m.city.trim()}` : spec;
}

function ratingLabel(m: Master): string | null {
  const raw = m.publicRating ?? m.rating;
  if (!raw) return null;
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(1).replace(".", ",");
}

function priceLabel(priceFrom: string | null): string | null {
  if (!priceFrom) return null;
  const n = parseFloat(priceFrom);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `от ${formatNumber(n)} ₽`;
}

function formatArea(area: string): string {
  const n = parseFloat(area);
  return Number.isFinite(n) ? String(Math.round(n)) : area;
}

function formatNumber(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase() || "М";
}

/* ── icons (inline, без эмодзи и стоковых картинок) ────────────────────── */

function svgProps() {
  return {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };
}

function IconSearch() {
  return (<svg width="19" height="19" {...svgProps()}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>);
}
function IconFeed() {
  return (<svg width="18" height="18" {...svgProps()}><path d="M4 5h16M4 12h16M4 19h10" /></svg>);
}
function IconLayers() {
  return (<svg width="22" height="22" {...svgProps()}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></svg>);
}
function IconChat() {
  return (<svg width="18" height="18" {...svgProps()}><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.8A8 8 0 1 1 21 12Z" /></svg>);
}
function IconCalc() {
  return (<svg width="22" height="22" {...svgProps()}><rect x="5" y="3" width="14" height="18" rx="3" /><path d="M8 8h8M8 12h2M12 12h2M16 12h.01M8 16h2M12 16h2" /></svg>);
}
function IconUsers() {
  return (<svg width="22" height="22" {...svgProps()}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 5.2A3 3 0 0 1 16 11M17.5 14.5c2 .6 3.5 2.2 3.5 4.5" /></svg>);
}
function IconWand() {
  return (<svg width="22" height="22" {...svgProps()}><path d="M6 21 17 10M15 4l.7 1.8L17.5 6.5 15.7 7.2 15 9l-.7-1.8L12.5 6.5l1.8-.7L15 4Z" /></svg>);
}
function IconStar() {
  return (<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden><path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.9 6.7 19.5l1.2-6L3.4 9.3l6-.7L12 3Z" /></svg>);
}
