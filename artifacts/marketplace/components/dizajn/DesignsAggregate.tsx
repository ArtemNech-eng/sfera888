import Link from "next/link";
import type { DesignFeedItemDTO } from "../../lib/types";

/**
 * Aggregate SEO-страница `/dizajn/{room}-{style}` (или `/dizajn/{room}` /
 * `/dizajn/{style}`).
 *
 * Magazine-каталог AI-дизайнов выбранной категории. L1 SEO-двигатель —
 * каждая комбинация room×style имеет свою landing с indexable title,
 * description, structured data + grid опубликованных дизайнов.
 *
 * Пустое состояние (когда дизайнов в этой комбинации ещё нет) — большой
 * editorial CTA «Создайте первый дизайн в этом стиле».
 */

interface Props {
  designs: DesignFeedItemDTO[];
  room: string | null;
  style: string | null;
}

const ROOM_LABELS_GENITIVE: Record<string, string> = {
  bathroom: "ванной",
  kitchen: "кухни",
  living_room: "гостиной",
  "living-room": "гостиной",
  bedroom: "спальни",
  hallway: "прихожей",
  apartment: "квартиры",
};

const ROOM_LABELS_PLURAL: Record<string, string> = {
  bathroom: "ванные",
  kitchen: "кухни",
  living_room: "гостиные",
  "living-room": "гостиные",
  bedroom: "спальни",
  hallway: "прихожие",
  apartment: "квартиры",
};

const STYLE_LABELS: Record<string, string> = {
  modern: "Современный",
  scandinavian: "Скандинавский",
  loft: "Лофт",
  minimalism: "Минимализм",
  neoclassic: "Неоклассика",
  japandi: "Японди",
};

const STYLE_ADJ_GENITIVE: Record<string, string> = {
  modern: "современной",
  scandinavian: "скандинавской",
  loft: "в стиле лофт",
  minimalism: "минималистичной",
  neoclassic: "неоклассической",
  japandi: "в стиле японди",
};

export function DesignsAggregate({ designs, room, style }: Props) {
  const heading = buildHeading(room, style);
  const subhead = buildSubhead(room, style);
  const seedLink = buildSeedLink(room, style);

  return (
    <article className="bg-[var(--color-background)]">
      {/* ── Header ──────────────────────────────────── */}
      <header className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
          <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-muted)]">
            <Link href="/" className="hover:text-[var(--color-text)]">Главная</Link>
            <span aria-hidden>/</span>
            <Link href="/dizajn" className="hover:text-[var(--color-text)]">AI-дизайн</Link>
            <span aria-hidden>/</span>
            <span className="text-[var(--color-text)]">{heading}</span>
          </nav>

          <p className="font-eyebrow mt-7">AI-дизайн-проекты</p>
          <h1 className="font-display mt-3 max-w-3xl text-4xl text-[var(--color-text)] sm:text-5xl lg:text-[3.25rem]">
            {heading}.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
            {subhead}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={seedLink}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--color-primary)] px-7 text-base font-semibold text-white shadow-cozy-md transition hover:bg-[var(--color-primary-hover)]"
            >
              Создать свой дизайн
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Grid OR empty state ─────────────────────── */}
      {designs.length > 0 ? (
        <section className="bg-[var(--color-background)]">
          <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-20">
            <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {designs.map((d) => (
                <li key={d.id}>
                  <Link href={`/dizajn/${d.slug}`} className="group block focus:outline-none">
                    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[var(--color-cream-deep)] shadow-cozy transition group-hover:shadow-cozy-md">
                      {d.resultImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={d.resultImageUrl}
                          alt={d.h1 ?? `Дизайн ${d.roomType}`}
                          loading="lazy"
                          className="block h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                        />
                      ) : null}
                    </div>
                    <p className="mt-3 line-clamp-2 px-1 text-sm font-semibold text-[var(--color-text)] transition group-hover:text-[var(--color-primary)]">
                      {d.h1 ?? `Дизайн ${d.roomType}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <section className="bg-[var(--color-cream-deep)]">
          <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6 sm:py-28">
            <p className="font-eyebrow">Раздел только наполняется</p>
            <h2 className="font-display mt-3 text-3xl text-[var(--color-text)] sm:text-4xl">
              Будьте первым.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
              {emptyStateText(room, style)}
            </p>
            <div className="mt-8">
              <Link
                href={seedLink}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--color-primary)] px-7 text-base font-semibold text-white shadow-cozy-md transition hover:bg-[var(--color-primary-hover)]"
              >
                Создать первый дизайн
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── Cross-links: другие комбинации ──────────── */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 className="font-display text-3xl text-[var(--color-text)] sm:text-4xl">
            Другие стили {room ? ROOM_LABELS_GENITIVE[room] : "комнат"}.
          </h2>
          <ul className="mt-8 flex flex-wrap gap-2.5">
            {Object.entries(STYLE_LABELS).map(([s, label]) => {
              const isCurrent = s === style;
              const href = room ? `/dizajn/${room.replace(/_/g, "-")}-${s}` : `/dizajn/${s}`;
              return (
                <li key={s}>
                  <Link
                    href={href}
                    className={`inline-flex h-11 items-center rounded-full border px-5 text-sm font-medium transition ${
                      isCurrent
                        ? "border-[var(--color-text)] bg-[var(--color-text)] text-white pointer-events-none"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:-translate-y-0.5 hover:border-[var(--color-text)] hover:shadow-cozy"
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </article>
  );
}

// ── Header builders ────────────────────────────────────────────────────────

function buildHeading(room: string | null, style: string | null): string {
  if (room && style) {
    const r = ROOM_LABELS_GENITIVE[room];
    const s = STYLE_ADJ_GENITIVE[style];
    if (s.startsWith("в стиле")) return `Дизайн ${r} ${s}`;
    return `Дизайн ${s} ${r}`;
  }
  if (room) {
    return `Идеи дизайна ${ROOM_LABELS_GENITIVE[room]}`;
  }
  if (style) {
    return `Идеи в стиле ${STYLE_LABELS[style]}`;
  }
  return "AI-дизайны";
}

function buildSubhead(room: string | null, style: string | null): string {
  if (room && style) {
    return `Подборка реальных AI-дизайн-проектов: 4 ракурса, материалы, смета, мастера для реализации в выбранном стиле и помещении.`;
  }
  if (room) {
    return `Все стили ${ROOM_LABELS_GENITIVE[room]} в одном месте — от современного минимализма до неоклассики. Каждый проект с материалами, сметой и мастерами.`;
  }
  if (style) {
    return `${STYLE_LABELS[style]} стиль для разных типов помещений — ванные, кухни, гостиные, спальни. Реальные дизайн-проекты с подбором мастера.`;
  }
  return "AI-дизайн-проекты интерьеров: загрузите фото, выберите стиль, получите 4 ракурса, материалы, смету и мастеров для реализации.";
}

function buildSeedLink(room: string | null, style: string | null): string {
  const params = new URLSearchParams();
  if (room) params.set("room", room);
  if (style) params.set("style", style);
  const qs = params.toString();
  return qs ? `/dizajn?${qs}` : "/dizajn";
}

function emptyStateText(room: string | null, style: string | null): string {
  const r = room ? ROOM_LABELS_GENITIVE[room] : null;
  const s = style ? STYLE_LABELS[style].toLowerCase() : null;
  if (r && s) {
    return `Пока никто не создал ${r === "квартиры" ? "квартиру" : r} в ${s} стиле. Загрузите фото своей комнаты — AI нарисует 4 ракурса в выбранном стиле, подберёт материалы и составит смету.`;
  }
  if (r) {
    return `Дизайнов ${r} пока нет. Загрузите фото своей комнаты — мы создадим первый проект.`;
  }
  if (s) {
    return `Дизайнов в ${s} стиле пока нет. Загрузите фото своей комнаты — мы создадим первый проект в этом стиле.`;
  }
  return "Загрузите фото комнаты и создайте свой первый дизайн-проект.";
}

// ROOM_LABELS_PLURAL not used yet — exported for future "Все стили {plural}" headings.
export const _ROOM_LABELS_PLURAL = ROOM_LABELS_PLURAL;
