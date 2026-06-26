"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cabinetPortfolio, type PortfolioItem } from "../../_lib/cabinetClient";
import { resolvePhotoUrl } from "../../_lib/photo";

interface Props {
  id: number | null;
}

/**
 * Read-only `/cabinet/portfolio/[id]` view.
 *
 * The api-server doesn't expose `GET /portfolio/:id` — the master-pwa pulls
 * the full list and finds the case client-side, and we keep that pattern
 * here. The list response is small (≤ 30 cases per master) so the extra
 * roundtrip has no real cost and lets us reuse one cache.
 */
export function PortfolioDetailView({ id }: Props) {
  const [items, setItems] = useState<PortfolioItem[] | null>(null);
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
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Не удалось загрузить кейс";
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

  const item = useMemo(() => {
    if (!items || id == null) return null;
    return items.find((i) => i.id === id) ?? null;
  }, [items, id]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="inline-block h-9 w-9 animate-spin rounded-full border-4 border-[var(--color-primary-soft)] border-t-[var(--color-primary)]" />
      </div>
    );
  }

  if (error) {
    return (
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
    );
  }

  if (!item) {
    return <NotFound />;
  }

  return (
    <article className="space-y-8">
      {/* Header */}
      <header className="space-y-3">
        <Link
          href="/cabinet/portfolio"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
          Все кейсы
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
              Кейс №{item.id}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
              {item.title || "Без названия"}
            </h1>
          </div>
          <PublishStatus item={item} />
        </div>
        <MetaBar item={item} />
      </header>

      {/* Public link if published */}
      {item.isPublished && item.slug ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-semibold">Кейс опубликован на сайте</p>
          <a
            href={`https://chestnye-mastera.ru/raboty/${item.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-emerald-700 hover:underline"
          >
            chestnye-mastera.ru/raboty/{item.slug}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      ) : null}

      {/* Photo galleries */}
      {item.beforePhotos.length > 0 || item.afterPhotos.length > 0 ? (
        <div className="space-y-6">
          {item.beforePhotos.length > 0 ? (
            <PhotoGroup label="До" tone="muted" photos={item.beforePhotos} />
          ) : null}
          {item.afterPhotos.length > 0 ? (
            <PhotoGroup label="После" tone="primary" photos={item.afterPhotos} />
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-10 text-center text-sm text-[var(--color-muted)]">
          В кейсе ещё нет фотографий.
          <br />
          <Link
            href={`/cabinet/portfolio/${item.id}/edit`}
            className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-primary)] hover:underline"
          >
            Загрузить «до / после» →
          </Link>
        </div>
      )}

      {/* Description */}
      {item.description ? (
        <section className="rounded-2xl border border-[var(--color-border)] bg-white p-5 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Описание
          </h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[var(--color-text)] sm:text-base">
            {item.description}
          </p>
        </section>
      ) : null}

      {/* Client review if present */}
      {item.clientReviewText ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-700">
            Отзыв клиента
          </h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-amber-900">
            {item.clientReviewText}
          </p>
          {item.clientRating != null ? (
            <p className="mt-2 text-xs font-semibold text-amber-700">
              Оценка: {item.clientRating} / 5
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Editor link */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5 sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Редактирование
        </h2>
        <p className="mt-3 text-sm text-[var(--color-text)]">
          Изменить название, описание, фото и метаданные кейса. Помощник описания
          и AI-улучшение текста — на странице редактора.
        </p>
        <Link
          href={`/cabinet/portfolio/${item.id}/edit`}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--color-cta)] px-4 py-2.5 text-sm font-semibold text-[var(--color-on-cta)] shadow-sm hover:bg-[var(--color-primary-strong)]"
        >
          Редактировать кейс
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </Link>
      </section>
    </article>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function PublishStatus({ item }: { item: PortfolioItem }) {
  if (item.isPublished) {
    return (
      <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Опубликован
      </span>
    );
  }
  return (
    <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-[var(--color-background)] px-3 py-1 text-xs font-semibold text-[var(--color-muted)]">
      Черновик
    </span>
  );
}

function MetaBar({ item }: { item: PortfolioItem }) {
  const meta: { label: string; value: string }[] = [];
  if (item.area) meta.push({ label: "Площадь", value: `${item.area} м²` });
  if (item.priceFrom) {
    const value = item.priceTo
      ? `${formatRubles(item.priceFrom)} – ${formatRubles(item.priceTo)} ₽`
      : `от ${formatRubles(item.priceFrom)} ₽`;
    meta.push({ label: "Стоимость", value });
  }
  if (item.completedAt) meta.push({ label: "Завершён", value: formatDateLong(item.completedAt) });
  if (meta.length === 0) return null;
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      {meta.map((m) => (
        <div key={m.label} className="flex items-baseline gap-1.5">
          <dt className="text-[var(--color-muted)]">{m.label}:</dt>
          <dd className="font-semibold text-[var(--color-text)]">{m.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PhotoGroup({
  label,
  tone,
  photos,
}: {
  label: string;
  tone: "muted" | "primary";
  photos: string[];
}) {
  const labelClass =
    tone === "primary"
      ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
      : "bg-[var(--color-background)] text-[var(--color-muted)]";
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <span className={`rounded-full px-3 py-0.5 text-xs font-semibold uppercase tracking-wider ${labelClass}`}>
          {label}
        </span>
        <span className="text-xs text-[var(--color-muted)]">{photos.length} фото</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {photos.map((url, idx) => (
          <a
            key={`${url}-${idx}`}
            href={resolvePhotoUrl(url)}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative block aspect-square overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]"
          >
            <img
              src={resolvePhotoUrl(url)}
              alt={`${label} ${idx + 1}`}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          </a>
        ))}
      </div>
    </section>
  );
}

function NotFound() {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-10 text-center">
      <p className="text-base font-semibold text-[var(--color-text)]">
        Кейс не найден
      </p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Возможно, его удалили или он принадлежит другому мастеру.
      </p>
      <Link
        href="/cabinet/portfolio"
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--color-cta)] px-4 py-2.5 text-sm font-semibold text-[var(--color-on-cta)] shadow-sm hover:bg-[var(--color-primary-strong)]"
      >
        К списку кейсов
      </Link>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatRubles(s: string | number): string {
  const n = typeof s === "string" ? parseFloat(s) : s;
  if (!Number.isFinite(n)) return String(s);
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

function formatDateLong(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}
