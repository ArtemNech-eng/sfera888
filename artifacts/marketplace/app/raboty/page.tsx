import Link from "next/link";
import type { Metadata } from "next";
import { fetchRecentDesigns } from "../../lib/api";
import { publicUrl } from "../../lib/env";
import { breadcrumbJsonLd, toJsonLdScript } from "../../lib/jsonLd";
import { CaseCard } from "../../components/CaseCard";

/**
 * `/raboty` — раздел «Идеи»: каталог сгенерированных AI-дизайнов в
 * Pinterest-masonry стиле.
 *
 * Источник — публичные завершённые дизайн-проекты (`designs`,
 * `status='completed' AND is_public=true`) через `fetchRecentDesigns`.
 * Работы мастеров здесь НЕ показываем (по продуктовому решению — «Идеи» это
 * AI-дизайны). Индивидуальные кейсы мастеров остаются доступны напрямую по
 * `/raboty/[slug]`, но в этот индекс не входят.
 *
 * Воронка: visitor листает идеи → открывает дизайн на `/dizajn/[slug]` →
 * «Хочу такой же» → подбор мастера.
 */

export const dynamic = "force-dynamic";

const FEED_LIMIT = 60;

// Слаги комнат/стилей — это значения enum'ов `designs.room_type` / `designs.style`
// (их понимает backend-фильтр `GET /dizajn?room=&style=`).
const ROOM_CHIPS: { slug: string; label: string }[] = [
  { slug: "bedroom", label: "Спальня" },
  { slug: "living_room", label: "Гостиная" },
  { slug: "kitchen", label: "Кухня" },
  { slug: "bathroom", label: "Ванная" },
  { slug: "hallway", label: "Прихожая" },
  { slug: "nursery", label: "Детская" },
];

const STYLE_CHIPS: { slug: string; label: string }[] = [
  { slug: "modern", label: "Современный" },
  { slug: "scandinavian", label: "Скандинавский" },
  { slug: "loft", label: "Лофт" },
  { slug: "minimalism", label: "Минимализм" },
  { slug: "neoclassic", label: "Неоклассика" },
  { slug: "japandi", label: "Японди" },
  { slug: "classic", label: "Классика" },
];

const ROOM_LABELS: Record<string, string> = Object.fromEntries(
  ROOM_CHIPS.map((r) => [r.slug, r.label]),
);
const STYLE_LABELS: Record<string, string> = Object.fromEntries(
  STYLE_CHIPS.map((s) => [s.slug, s.label]),
);

interface SearchParams {
  room?: string;
  style?: string;
}

export function generateMetadata(): Metadata {
  return {
    title: { absolute: "Идеи дизайна интерьера — AI-проекты | Честные мастера" },
    description:
      "Готовые AI-дизайны интерьеров: спальни, кухни, гостиные в разных стилях — с материалами, сметой и подбором мастера для реализации.",
    alternates: { canonical: `${publicUrl()}/raboty` },
  };
}

export default async function IdeasIndexPage(
  { searchParams }: { searchParams: Promise<SearchParams> },
) {
  const sp = await searchParams;
  const activeRoom = typeof sp.room === "string" ? sp.room : null;
  const activeStyle = typeof sp.style === "string" ? sp.style : null;

  const designs = await fetchRecentDesigns({
    limit: FEED_LIMIT,
    room: activeRoom ?? undefined,
    style: activeStyle ?? undefined,
  }).catch(() => []);

  const breadcrumbsLd = breadcrumbJsonLd([
    { name: "Главная", url: `${publicUrl()}/` },
    { name: "Идеи", url: `${publicUrl()}/raboty` },
  ]);

  const browseUrl = (params: { room?: string | null; style?: string | null }) => {
    const sp2 = new URLSearchParams();
    const r = params.room === undefined ? activeRoom : params.room;
    const s = params.style === undefined ? activeStyle : params.style;
    if (r) sp2.set("room", r);
    if (s) sp2.set("style", s);
    const qs = sp2.toString();
    return `/raboty${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbsLd) }}
      />

      {/* ── Compact inspiration header ──────────────────────────── */}
      <header className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 pb-7 pt-10 sm:px-6 sm:pt-14">
          <nav className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <Link href="/" className="hover:text-[var(--color-text)]">Главная</Link>
            <span aria-hidden>/</span>
            <span className="text-[var(--color-text)]">Идеи</span>
          </nav>

          <h1 className="font-display mt-7 max-w-3xl text-4xl text-[var(--color-text)] sm:text-5xl">
            Идеи дизайна, созданные ИИ.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
            Готовые дизайн-проекты с материалами и сметой. Понравился — соберите
            свой за минуту или найдите мастера, который повторит.
          </p>
          <Link
            href="/dizajn"
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--color-cta)] px-6 text-sm font-semibold text-[var(--color-on-cta)] shadow-cozy-md transition hover:bg-[var(--color-cta-hover)]"
          >
            Создать свой дизайн
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
          </Link>
        </div>
      </header>

      {/* ── Sticky browse-by chip rails ─────────────────────────── */}
      <section className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-background)]/95 backdrop-blur">
        <div className="mx-auto max-w-6xl space-y-3 px-4 py-4 sm:px-6 sm:py-5">
          <ChipRail
            label="По комнатам"
            items={[{ slug: null, label: "Все" }, ...ROOM_CHIPS]}
            active={activeRoom}
            buildHref={(slug) => browseUrl({ room: slug })}
          />
          <ChipRail
            label="По стилю"
            items={[{ slug: null, label: "Любой" }, ...STYLE_CHIPS]}
            active={activeStyle}
            buildHref={(slug) => browseUrl({ style: slug })}
          />
        </div>
      </section>

      {/* ── Masonry grid (Pinterest-feel) ────────────────────────── */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          {designs.length > 0 ? (
            <div className="masonry">
              {designs.map((d) => (
                <div key={d.id} className="masonry-item">
                  <CaseCard {...designToCardProps(d)} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyNotice hasFilter={Boolean(activeRoom || activeStyle)} />
          )}
        </div>
      </section>
    </>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function designToCardProps(d: {
  slug: string;
  roomType: string;
  style: string;
  h1: string | null;
  resultImageUrl: string | null;
  saveCount: number;
  viewCount: number;
}) {
  const roomLabel = ROOM_LABELS[d.roomType] ?? d.roomType;
  const styleLabel = STYLE_LABELS[d.style] ?? d.style;
  const title = d.h1 ?? `Дизайн: ${roomLabel}, ${styleLabel.toLowerCase()}`;
  return {
    href: `/dizajn/${d.slug}`,
    cover: d.resultImageUrl,
    title,
    alt: `${title} — AI-дизайн интерьера`,
    metaParts: [roomLabel, styleLabel],
    priceLabel: null,
    badge: { tone: "featured" as const, label: "AI-дизайн" },
    views: d.viewCount,
    saves: d.saveCount,
  };
}

function ChipRail({
  label,
  items,
  active,
  buildHref,
}: {
  label: string;
  items: { slug: string | null; label: string }[];
  active: string | null;
  buildHref: (slug: string | null) => string;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">
        {label}
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((item) => {
          const isActive = item.slug === active;
          return (
            <li key={item.slug ?? "all"}>
              <Link
                href={buildHref(item.slug)}
                className={`inline-flex items-center rounded-full border px-3.5 py-1.5 text-xs font-medium transition sm:text-sm ${
                  isActive
                    ? "border-[var(--color-primary)] bg-[var(--color-cta)] text-[var(--color-on-cta)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EmptyNotice({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-cream-deep)] p-6 sm:p-8">
      <p className="font-eyebrow">Каталог идей формируется</p>
      <p className="mt-3 text-base font-semibold text-[var(--color-text)]">
        {hasFilter
          ? "По этому фильтру пока нет дизайнов."
          : "Пока здесь немного дизайнов — станьте одним из первых."}
      </p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Загрузите фото комнаты и соберите свой дизайн-проект за минуту.
      </p>
      <Link
        href="/dizajn"
        className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--color-cta)] px-6 text-sm font-semibold text-[var(--color-on-cta)] shadow-cozy transition hover:bg-[var(--color-cta-hover)]"
      >
        Создать дизайн
      </Link>
    </div>
  );
}
