import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchProCommunity, type ProFeedItem } from "../../../lib/communityApi";
import { fetchCities } from "../../../lib/api";
import { publicUrl } from "../../../lib/env";
import { getCurrentMaster } from "../../../lib/cabinetAuth";
import { breadcrumbJsonLd, toJsonLdScript } from "../../../lib/jsonLd";

/**
 * PRO_Zone — страница специальности `/pro/[specialty]` (spec task 13.2). Portal-стиль.
 * All_Russia_Feed по умолчанию; My_City_Filter — только явно (Requirements 6.2–6.6).
 * Индексируется базовая страница; отфильтрованные по городу — noindex (6.7).
 */

export const dynamic = "force-dynamic";

const PRO_FEED_LIMIT = 30;

interface RouteParams { specialty: string; }
interface SearchParams { cityFilter?: string; cityId?: string; }

function isCityFilterApplied(raw: string | undefined): boolean {
  return raw === "true" || raw === "1";
}
function parseCityId(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata(
  { params, searchParams }: { params: Promise<RouteParams>; searchParams: Promise<SearchParams> },
): Promise<Metadata> {
  const { specialty: specialtySlug } = await params;
  const sp = await searchParams;
  const cityFilterApplied = isCityFilterApplied(sp.cityFilter);
  const data = await fetchProCommunity(specialtySlug, { limit: 1 });
  if (!data) return { title: "Сообщество мастеров — Честные мастера" };
  const name = data.specialty.name;
  return {
    title: `${name} — сообщество мастеров, вся Россия`,
    description: `Профессиональное сообщество «${name}»: инструменты, материалы, цены, лайфхаки и разбор ошибок. Лента «Вся Россия» и фильтр «Мой город».`,
    alternates: { canonical: `${publicUrl()}/pro/${data.specialty.slug}` },
    robots: cityFilterApplied ? { index: false, follow: true } : undefined,
  };
}

export default async function ProSpecialtyPage(
  { params, searchParams }: { params: Promise<RouteParams>; searchParams: Promise<SearchParams> },
) {
  const { specialty: specialtySlug } = await params;
  const sp = await searchParams;
  const cityFilterApplied = isCityFilterApplied(sp.cityFilter);
  const cityId = parseCityId(sp.cityId);
  const applyFilter = cityFilterApplied && cityId != null;

  const [data, cities, master] = await Promise.all([
    fetchProCommunity(specialtySlug, { cityFilter: applyFilter, cityId, limit: PRO_FEED_LIMIT }),
    fetchCities(),
    getCurrentMaster(),
  ]);
  if (!data) notFound();

  const { specialty, feed } = data;
  const selectedCity = cityId != null ? cities.find((c) => c.id === cityId) ?? null : null;
  const isConfirmedMaster = master != null;

  const buildUrl = (overrides: { cityFilter?: boolean; cityId?: number | null }) => {
    const p = new URLSearchParams();
    const wantFilter = overrides.cityFilter ?? cityFilterApplied;
    const wantCity = overrides.cityId === null ? null : overrides.cityId ?? cityId;
    if (wantFilter) {
      p.set("cityFilter", "true");
      if (wantCity != null) p.set("cityId", String(wantCity));
    }
    const qs = p.toString();
    return `/pro/${specialty.slug}${qs ? `?${qs}` : ""}`;
  };

  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: "Хочу также ПРО", url: `${publicUrl()}/pro` },
    { name: specialty.name, url: `${publicUrl()}/pro/${specialty.slug}` },
  ]);

  const feedIsMyCity = feed.feedMode === "my_city";

  return (
    <div className="portal">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }} />

      <div className="portal-wrap">
        <header className="portal-masthead">
          <nav className="portal-crumbs">
            <Link href="/">Главная</Link> / <Link href="/pro">Хочу также ПРО</Link> / <span>{specialty.name}</span>
          </nav>
          <span className="portal-eyebrow">Хочу также ПРО</span>
          <h1 className="portal-h1">{specialty.name}</h1>
          <p className="portal-lead">
            Профессиональное сообщество: инструменты, материалы, цены, лайфхаки и
            разбор ошибок. Лента «Вся Россия» или рабочие вопросы своего города.
          </p>
        </header>

        {/* My_City_Filter */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "18px 0", borderBottom: "1px solid var(--p-line)" }}>
          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--p-muted)" }}>Лента:</span>
          <Link
            href={buildUrl({ cityFilter: false, cityId: null })}
            className={cityFilterApplied ? "portal-btn portal-btn--ghost" : "portal-btn"}
            style={{ padding: "8px 16px", fontSize: 14 }}
          >
            Вся Россия
          </Link>
          <span
            className={cityFilterApplied ? "portal-btn" : "portal-btn portal-btn--ghost"}
            style={{ padding: "8px 16px", fontSize: 14, cursor: "default" }}
          >
            Мой город{selectedCity ? `: ${selectedCity.name}` : ""}
          </span>
        </div>

        {cities.length > 0 ? (
          <details style={{ marginTop: 12 }} open={cityFilterApplied && !selectedCity}>
            <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--p-muted)" }}>
              {cityFilterApplied ? "Сменить город ↓" : "Выбрать «Мой город» ↓"}
            </summary>
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {cities.slice(0, 40).map((c) => (
                <Link
                  key={c.id}
                  href={buildUrl({ cityFilter: true, cityId: c.id })}
                  className="portal-chip"
                  style={cityId === c.id ? { background: "var(--p-ink)", color: "#fff" } : undefined}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </details>
        ) : null}

        <div className="portal-kicker">
          <h2 className="portal-h2">
            {feedIsMyCity ? `Локальные вопросы${selectedCity ? ` — ${selectedCity.name}` : ""}` : "Профессиональные темы"}
          </h2>
        </div>

        <div style={{ marginTop: 8 }}>
          {feed.emptyState ? (
            <div className="portal-empty">
              {feedIsMyCity ? (
                <>Локальных тем{selectedCity ? ` в городе ${selectedCity.name}` : ""} пока нет.{" "}
                  <Link href={buildUrl({ cityFilter: false, cityId: null })} style={{ color: "var(--p-accent)", fontWeight: 700 }}>Вернуться к «Вся Россия»</Link>.</>
              ) : (
                <>В этом сообществе пока нет тем. Загляните позже.</>
              )}
            </div>
          ) : (
            <div className="portal-list">
              {feed.items.map((item) => (
                <ProThreadRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>

        <ProtectedGate confirmed={isConfirmedMaster} specialtyName={specialty.name} />

        <div style={{ height: 56 }} />
      </div>
    </div>
  );
}

const PRO_CATEGORY_LABELS: Record<string, string> = {
  tools: "Инструменты",
  materials: "Материалы",
  prices: "Цены",
  lifehacks: "Лайфхаки",
  error_analysis: "Разбор ошибок",
};
function categoryLabel(category: string | null): string | null {
  if (!category) return null;
  return PRO_CATEGORY_LABELS[category] ?? category;
}
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

function ProThreadRow({ item }: { item: ProFeedItem }) {
  const label = categoryLabel(item.category);
  const excerpt = item.body.length > 220 ? `${item.body.slice(0, 220).trimEnd()}…` : item.body;
  return (
    <Link href={`/t/${item.id}`} className="portal-row">
      <div className="portal-row-meta">
        {label ? <span className="portal-chip">{label}</span> : null}
        {item.isLocal ? <span className="portal-chip portal-chip--local">Мой город</span> : null}
        <time>{formatDate(item.lastActivityAt || item.createdAt)}</time>
      </div>
      <div className="portal-row-title">{item.title}</div>
      {excerpt ? <p className="portal-row-excerpt">{excerpt}</p> : null}
      <span className="portal-row-more">Открыть обсуждение →</span>
    </Link>
  );
}

/** Гейт закрытого слоя PRO_Protected_Layer (Requirement 7). */
function ProtectedGate({ confirmed, specialtyName }: { confirmed: boolean; specialtyName: string }) {
  return (
    <section style={{ marginTop: 44, border: "1px solid var(--p-ink)", padding: 24 }}>
      <span className="portal-eyebrow" style={{ color: "var(--p-ink)" }}>Закрытый раздел ПРО</span>
      <h2 className="portal-h2" style={{ marginTop: 8 }}>
        Чувствительные темы — только для подтверждённых мастеров
      </h2>
      <p style={{ marginTop: 8, color: "var(--p-muted)", fontSize: 15, maxWidth: 640, lineHeight: 1.5 }}>
        Чёрные списки клиентов, споры по объектам и другой чувствительный контент
        сообщества «{specialtyName}» доступны в закрытом разделе. Он закрыт от
        индексации и открыт только участникам с подтверждённым членством.
      </p>
      <div style={{ marginTop: 18 }}>
        {confirmed ? (
          <Link href="/cabinet" className="portal-btn">Открыть закрытый раздел</Link>
        ) : (
          <Link href="/login" className="portal-btn">Подтвердить членство</Link>
        )}
      </div>
    </section>
  );
}
