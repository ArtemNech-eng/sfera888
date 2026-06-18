"use client";

import { useState, useEffect, useCallback } from "react";

interface CaseGalleryProps {
  title: string;
  cityName: string | null;
  beforePhotos: string[];
  afterPhotos: string[];
}

/**
 * Houzz-style case gallery (plan §22, Requirement 1).
 *
 * Layout:
 *   • Desktop: hero (first afterPhoto) on the left taking 2/3 width,
 *     stack of 4 thumbnails on the right taking 1/3.
 *   • Mobile: horizontal snap-scroll strip — user swipes through.
 *
 * Lightbox: clicking any tile opens a fullscreen overlay with next/prev,
 * Escape close, click-on-background close. No zoom/pinch (deferred to a
 * post-launch polish per spec D-5).
 */
export function CaseGallery({ title, cityName, beforePhotos, afterPhotos }: CaseGalleryProps) {
  // All photos in display order: `after` first (hero is the result),
  // then `before` photos to round out the gallery. Both arrays are
  // already de-duplicated on the editor side.
  const photos: GalleryPhoto[] = [
    ...afterPhotos.map((url, i) => ({ url, kind: "after" as const, index: i })),
    ...beforePhotos.map((url, i) => ({ url, kind: "before" as const, index: i })),
  ];

  if (photos.length === 0) return null;

  const cityPart = cityName ? ` в ${cityName}` : "";
  const captionFor = (p: GalleryPhoto) => {
    const kindLabel = p.kind === "before" ? "до ремонта" : "после ремонта";
    return `${title}${cityPart} — фото ${kindLabel}`;
  };

  // Pre-compute hero + remaining for desktop split. Mobile uses the full list.
  const hero = photos[0]!;
  const thumbs = photos.slice(1, 5); // up to 4 thumbnails to keep parity with hero height

  const [lightbox, setLightbox] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const openAt = useCallback((idx: number) => setLightbox({ open: true, index: idx }), []);
  const close = useCallback(() => setLightbox((s) => ({ ...s, open: false })), []);

  return (
    <section className="bg-[var(--color-background)]">
      <div className="mx-auto max-w-6xl px-4 pb-2 pt-6 sm:px-6 sm:pt-8">
        {/* Desktop layout: hero + thumbs grid. Mobile: snap-scroll strip. */}
        <div className="hidden gap-3 lg:grid lg:grid-cols-[2fr_1fr] lg:gap-4">
          <button
            type="button"
            onClick={() => openAt(0)}
            className="relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-[var(--color-border)] transition hover:opacity-95"
            aria-label="Открыть фото в полном размере"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={hero.url}
              alt={captionFor(hero)}
              loading="eager"
              fetchPriority="high"
              className="h-full w-full object-cover"
            />
            <PhotoBadge kind={hero.kind} />
          </button>

          <div className="grid grid-rows-2 gap-3 lg:grid-rows-2 lg:gap-4">
            {thumbs.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 lg:gap-4">
                {thumbs.slice(0, 2).map((p, idx) => (
                  <Thumb key={`top-${idx}`} photo={p} caption={captionFor(p)} onClick={() => openAt(idx + 1)} />
                ))}
              </div>
            ) : null}
            {thumbs.length > 2 ? (
              <div className="grid grid-cols-2 gap-3 lg:gap-4">
                {thumbs.slice(2, 4).map((p, idx) => {
                  const lastTile = idx + 2 === thumbs.length - 1 && photos.length > 5;
                  return (
                    <button
                      key={`bot-${idx}`}
                      type="button"
                      onClick={() => openAt(idx + 3)}
                      className="relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-[var(--color-border)] transition hover:opacity-95"
                      aria-label={`Открыть фото ${idx + 4}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.url}
                        alt={captionFor(p)}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                      <PhotoBadge kind={p.kind} />
                      {lastTile ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-base font-semibold text-white">
                          +{photos.length - 5} фото
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        {/* Mobile: horizontal snap scroll */}
        <div className="lg:hidden">
          <ul className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
            {photos.map((p, idx) => (
              <li key={idx} className="shrink-0 snap-start" style={{ scrollSnapAlign: "start" }}>
                <button
                  type="button"
                  onClick={() => openAt(idx)}
                  className="relative block aspect-[4/3] w-[85vw] max-w-[480px] overflow-hidden rounded-xl bg-[var(--color-border)]"
                  aria-label={`Открыть фото ${idx + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={captionFor(p)}
                    loading={idx === 0 ? "eager" : "lazy"}
                    fetchPriority={idx === 0 ? "high" : "auto"}
                    className="h-full w-full object-cover"
                  />
                  <PhotoBadge kind={p.kind} />
                </button>
              </li>
            ))}
          </ul>
        </div>

        {photos.length > 1 ? (
          <p className="mt-3 px-1 text-xs text-[var(--color-faint)] lg:hidden">
            {photos.length} фото — листайте →
          </p>
        ) : null}
      </div>

      {lightbox.open ? (
        <Lightbox
          photos={photos}
          startIndex={lightbox.index}
          captionFor={captionFor}
          onClose={close}
        />
      ) : null}
    </section>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

interface GalleryPhoto {
  url: string;
  kind: "before" | "after";
  index: number;
}

function Thumb({ photo, caption, onClick }: { photo: GalleryPhoto; caption: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-[var(--color-border)] transition hover:opacity-95"
      aria-label="Открыть фото"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={caption}
        loading="lazy"
        className="h-full w-full object-cover"
      />
      <PhotoBadge kind={photo.kind} />
    </button>
  );
}

function PhotoBadge({ kind }: { kind: "before" | "after" }) {
  if (kind !== "before") return null; // "after" — без бейджа, это «продукт»
  return (
    <span className="absolute left-3 top-3 inline-flex items-center rounded bg-[var(--color-text)]/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
      До
    </span>
  );
}

// ── Lightbox ───────────────────────────────────────────────────────────────

function Lightbox({
  photos,
  startIndex,
  captionFor,
  onClose,
}: {
  photos: GalleryPhoto[];
  startIndex: number;
  captionFor: (p: GalleryPhoto) => string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);

  const next = useCallback(() => setIndex((i) => (i + 1) % photos.length), [photos.length]);
  const prev = useCallback(() => setIndex((i) => (i - 1 + photos.length) % photos.length), [photos.length]);

  // Keyboard navigation + body scroll lock
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [next, prev, onClose]);

  const photo = photos[index]!;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр фото"
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25"
        aria-label="Закрыть"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>

      {photos.length > 1 ? (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-3 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 sm:left-6"
            aria-label="Предыдущее фото"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-3 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 sm:right-6"
            aria-label="Следующее фото"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </>
      ) : null}

      <figure
        className="relative flex max-h-[90vh] w-full max-w-[1200px] flex-col items-center gap-3 px-4 sm:px-12"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={captionFor(photo)}
          className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain"
        />
        <figcaption className="flex items-center gap-3 text-xs text-white/80">
          <span>
            {photo.kind === "before" ? "До ремонта" : "После ремонта"}
          </span>
          <span aria-hidden>·</span>
          <span>
            {index + 1} / {photos.length}
          </span>
        </figcaption>
      </figure>
    </div>
  );
}
