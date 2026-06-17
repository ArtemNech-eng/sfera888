"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cabinetPortfolio, type PortfolioItem } from "../_lib/cabinetClient";
import { resolvePhotoUrl } from "../_lib/photo";

/**
 * Read-only `/cabinet/portfolio` grid.
 *
 * Lazy-load on mount, render a 2-3 column grid of cover thumbnails with the
 * draft / published badge and a quick meta strip. Each card deep-links to
 * `/cabinet/portfolio/[id]` for the detail view. Editing (upload, AI
 * assistant, delete) lives in master-pwa until the editor port lands.
 */
export function PortfolioListView() {
  const [items, setItems] = useState<PortfolioItem[] | null>(null);
  const [limit, setLimit] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await cabinetPortfolio.list();
        if (cancelled) return;
        setItems(res.items);
        setLimit(res.limit);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Не удалось загрузить кейсы";
        setError(msg);
        toast.error(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const used = items?.length ?? 0;
  const published = items?.filter((i) => i.isPublished).length ?? 0;

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
              Кейсы и портфолио
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
              Ваши работы
            </h1>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Опубликованные кейсы попадают на страницу
              {" "}
              <span className="font-semibold text-[var(--color-text)]">/raboty</span>{" "}
              и в каталог Идей. Чем больше реальных фото — тем выше карточка в выдаче.
            </p>
          </div>
          {items !== null && used < limit ? (
            <Link
              href="/cabinet/portfolio/new"
              className="inline-flex flex-shrink-0 items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-primary-strong)]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14" />
                <path d="M12 5v14" />
              </svg>
              Новый кейс
            </Link>
          ) : null}
        </div>
      </header>

      {/* Stats strip */}
      {items !== null ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Всего кейсов" value={`${used} / ${limit}`} />
          <Stat label="Опубликовано" value={String(published)} accent="ok" />
          <Stat label="Черновики" value={String(used - published)} accent={used - published > 0 ? "amber" : "muted"} />
        </div>
      ) : null}

      {/* Body */}
      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <span className="inline-block h-9 w-9 animate-spin rounded-full border-4 border-[var(--color-primary-soft)] border-t-[var(--color-primary)]" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-8 text-center text-sm text-[var(--color-muted)]">
          {error}.{" "}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="font-semibold text-[var(--color-primary)] hover:underline"
          >
            Попробовать ещё раз
          </button>
        </div>
      ) : items && items.length === 0 ? (
        <EmptyState />
      ) : items ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <PortfolioCard item={item} />
            </li>
          ))}
        </ul>
      ) : null}

      {/* Editor handoff */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5 text-sm text-[var(--color-muted)]">
        <p className="font-semibold text-[var(--color-text)]">
          Редактор кейсов теперь здесь
        </p>
        <p className="mt-1">
          Создавайте новые кейсы, загружайте фото «до / после» и редактируйте
          описания прямо на chestnye-mastera.ru. Помощник описания и AI-улучшение
          текста доступны на странице кейса.
        </p>
        <Link
          href="/cabinet/portfolio/new"
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-primary)] hover:underline"
        >
          Создать новый кейс →
        </Link>
      </div>
    </div>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────

function PortfolioCard({ item }: { item: PortfolioItem }) {
  const cover = item.afterPhotos[0] ?? item.beforePhotos[0] ?? null;
  const totalPhotos = item.afterPhotos.length + item.beforePhotos.length;

  return (
    <Link
      href={`/cabinet/portfolio/${item.id}`}
      className="group block overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative aspect-[4/3] bg-[var(--color-background)]">
        {cover ? (
          <img
            src={resolvePhotoUrl(cover)}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--color-muted)]">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
        )}
        <PublishBadge isPublished={item.isPublished} />
        {item.isFeatured ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            В подборке
          </span>
        ) : null}
        {totalPhotos > 1 ? (
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
              <line x1="7" y1="2" x2="7" y2="22" />
              <line x1="17" y1="2" x2="17" y2="22" />
            </svg>
            {totalPhotos}
          </span>
        ) : null}
      </div>
      <div className="p-4">
        <p className="line-clamp-2 text-sm font-semibold text-[var(--color-text)]">
          {item.title || "Без названия"}
        </p>
        <p className="mt-1 line-clamp-2 text-xs text-[var(--color-muted)]">
          {item.description || "Без описания"}
        </p>
        <MetaStrip item={item} />
      </div>
    </Link>
  );
}

function PublishBadge({ isPublished }: { isPublished: boolean }) {
  return (
    <span
      className={`absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm ${
        isPublished ? "bg-emerald-500 text-white" : "bg-white/90 text-[var(--color-muted)]"
      }`}
    >
      {isPublished ? (
        <>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Опубликован
        </>
      ) : (
        "Черновик"
      )}
    </span>
  );
}

function MetaStrip({ item }: { item: PortfolioItem }) {
  const meta: string[] = [];
  if (item.area) meta.push(`${item.area} м²`);
  if (item.priceFrom) {
    meta.push(item.priceTo ? `${formatRubles(item.priceFrom)}–${formatRubles(item.priceTo)} ₽` : `от ${formatRubles(item.priceFrom)} ₽`);
  }
  if (item.completedAt) meta.push(formatDateShort(item.completedAt));
  if (meta.length === 0) return null;
  return (
    <p className="mt-2 truncate text-[11px] font-medium text-[var(--color-muted)]">
      {meta.join(" · ")}
    </p>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "ok" | "amber" | "muted" }) {
  const tone =
    accent === "ok"
      ? "text-emerald-700"
      : accent === "amber"
        ? "text-amber-700"
        : "text-[var(--color-text)]";
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-10 text-center">
      <p className="text-base font-semibold text-[var(--color-text)]">
        Кейсов пока нет
      </p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Добавьте первый — это поднимает карточку в Яндексе и каталоге Идей.
      </p>
      <a
        href="/cabinet/portfolio/new"
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[var(--color-primary-strong)]"
      >
        Создать первый кейс
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </a>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatRubles(s: string | number): string {
  const n = typeof s === "string" ? parseFloat(s) : s;
  if (!Number.isFinite(n)) return String(s);
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

function formatDateShort(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}
