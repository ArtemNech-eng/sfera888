import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchProCommunity, type ProFeedItem } from "../../../lib/communityApi";
import { fetchCities } from "../../../lib/api";
import { publicUrl } from "../../../lib/env";
import { getCurrentMaster } from "../../../lib/cabinetAuth";
import { breadcrumbJsonLd, toJsonLdScript } from "../../../lib/jsonLd";
import { CommunityRail } from "../../../components/community/CommunityRail";

/**
 * PRO_Zone — страница специальности `/pro/[specialty]` (spec task 13.2). Zen-стиль.
 * All_Russia_Feed по умолчанию; My_City_Filter только явно (Requirements 6.2–6.6).
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
    <div className="zen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }} />
      <div className="zen-shell">
        <div className="zen-layout zen-layout--rail">
          <CommunityRail active="pro" />

          <main>
            <nav className="zen-crumbs">
              <Link href="/">Главная</Link> · <Link href="/pro">Хочу также ПРО</Link> · {specialty.name}
            </nav>
            <span className="zen-eyebrow">Хочу также ПРО</span>
            <h1 className="zen-title">{specialty.name}</h1>
            <p className="zen-sub">
              Профессиональное сообщество: инструменты, материалы, цены, лайфхаки и
              разбор ошибок. Лента «Вся Россия» или рабочие вопросы своего города.
            </p>

            {/* My_City_Filter */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, margin: "18px 0 4px" }}>
              <Link
                href={buildUrl({ cityFilter: false, cityId: null })}
                className={cityFilterApplied ? "zen-btn zen-btn--ghost" : "zen-btn"}
                style={{ padding: "8px 16px", fontSize: 14 }}
              >
                Вся Россия
              </Link>
              <span
                className={cityFilterApplied ? "zen-btn" : "zen-btn zen-btn--ghost"}
                style={{ padding: "8px 16px", fontSize: 14, cursor: "default" }}
              >
                Мой город{selectedCity ? `: ${selectedCity.name}` : ""}
              </span>
            </div>
            {cities.length > 0 ? (
              <details style={{ marginTop: 6 }} open={cityFilterApplied && !selectedCity}>
                <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--z-muted)" }}>
                  {cityFilterApplied ? "Сменить город ↓" : "Выбрать «Мой город» ↓"}
                </summary>
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {cities.slice(0, 40).map((c) => (
                    <Link
                      key={c.id}
                      href={buildUrl({ cityFilter: true, cityId: c.id })}
                      className="zen-chip"
                      style={cityId === c.id ? { background: "var(--z-accent)", color: "#fff" } : undefined}
                    >
                      {c.name}
                    </Link>
                  ))}
                </div>
              </details>
            ) : null}

            <h2 className="zen-section-title">
              {feedIsMyCity ? `Локальные вопросы${selectedCity ? ` — ${selectedCity.name}` : ""}` : "Профессиональные темы"}
            </h2>

            {feed.emptyState ? (
              <div className="zen-empty">
                {feedIsMyCity ? (
                  <>Локальных тем{selectedCity ? ` в городе ${selectedCity.name}` : ""} пока нет.{" "}
                    <Link href={buildUrl({ cityFilter: false, cityId: null })} style={{ color: "var(--z-accent)", fontWeight: 700 }}>Вернуться к «Вся Россия»</Link>.</>
                ) : (
                  <>В этом сообществе пока нет тем. Загляните позже.</>
                )}
              </div>
            ) : (
              <div className="zen-feed">
                {feed.items.map((item) => (
                  <ProThreadCard key={item.id} item={item} />
                ))}
              </div>
            )}

            <ProtectedGate confirmed={isConfirmedMaster} specialtyName={specialty.name} />
          </main>
        </div>
      </div>
    </div>
  );
}

const PRO_CATEGORY_LABELS: Record<string, string> = {
  tools: "Инструменты", materials: "Материалы", prices: "Цены",
  lifehacks: "Лайфхаки", error_analysis: "Разбор ошибок",
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

function ProThreadCard({ item }: { item: ProFeedItem }) {
  const label = categoryLabel(item.category);
  const excerpt = item.body.length > 220 ? `${item.body.slice(0, 220).trimEnd()}…` : item.body;
  return (
    <Link href={`/t/${item.id}`} className="zen-post">
      <div className="zen-post-meta">
        {label ? <span className="zen-chip">{label}</span> : null}
        {item.isLocal ? <span className="zen-chip zen-chip--muted">Мой город</span> : null}
        <time>{formatDate(item.lastActivityAt || item.createdAt)}</time>
      </div>
      <div className="zen-post-title">{item.title}</div>
      {excerpt ? <p className="zen-post-excerpt">{excerpt}</p> : null}
      <div className="zen-post-foot">Открыть обсуждение →</div>
    </Link>
  );
}

/** Гейт закрытого слоя PRO_Protected_Layer (Requirement 7). */
function ProtectedGate({ confirmed, specialtyName }: { confirmed: boolean; specialtyName: string }) {
  return (
    <section className="zen-panel" style={{ marginTop: 28 }}>
      <span className="zen-eyebrow">Закрытый раздел ПРО</span>
      <h2 style={{ marginTop: 6, fontWeight: 700, fontSize: 19 }}>
        Чувствительные темы — только для подтверждённых мастеров
      </h2>
      <p style={{ marginTop: 8, color: "var(--z-muted)", fontSize: 15, lineHeight: 1.55, maxWidth: 640 }}>
        Чёрные списки клиентов, споры по объектам и другой чувствительный контент
        сообщества «{specialtyName}» доступны в закрытом разделе. Он закрыт от
        индексации и открыт только участникам с подтверждённым членством.
      </p>
      <div style={{ marginTop: 16 }}>
        {confirmed ? (
          <Link href="/cabinet" className="zen-btn">Открыть закрытый раздел</Link>
        ) : (
          <Link href="/login" className="zen-btn">Подтвердить членство</Link>
        )}
      </div>
    </section>
  );
}
