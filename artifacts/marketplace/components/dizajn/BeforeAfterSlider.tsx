"use client";

import { useCallback, useRef, useState } from "react";

/**
 * `BeforeAfterSlider` — пара «Было → Стало» с перетаскиваемым разделителем.
 *
 * Поверх изображения «после» (AI-рендер) накладывается «до» (фото пользователя),
 * обрезанное по вертикальной линии. Линию можно двигать мышью, пальцем или
 * стрелками клавиатуры (роль `slider`, доступно с клавиатуры и скринридеров).
 *
 * Оба изображения рендерятся в полный размер контейнера (`object-cover`), а
 * «до» подрезается через `clip-path: inset(...)` — без искажения пропорций.
 *
 * SSR-safe: никакой работы с `window` на маунте; позиция — обычный state.
 */

interface Props {
  /** URL фото «до» (исходная комната пользователя). */
  beforeUrl: string;
  /** URL изображения «после» (главный AI-рендер). */
  afterUrl: string;
  /** Alt-текст (общий описательный для пары). */
  alt: string;
  /** Подпись левой («до») стороны. */
  beforeLabel?: string;
  /** Подпись правой («после») стороны. */
  afterLabel?: string;
}

/** Ограничивает позицию разделителя в [0..100]. */
function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, value));
}

export function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  alt,
  beforeLabel = "Было",
  afterLabel = "Стало",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50); // % видимой «до»-части слева
  const [dragging, setDragging] = useState(false);

  // Перевод абсолютной X-координаты указателя в позицию разделителя (%).
  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    setPos(clampPercent(((clientX - rect.left) / rect.width) * 100));
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      setDragging(true);
      updateFromClientX(e.clientX);
    },
    [updateFromClientX],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      updateFromClientX(e.clientX);
    },
    [dragging, updateFromClientX],
  );

  const endDrag = useCallback(() => setDragging(false), []);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 4;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPos((p) => clampPercent(p - step));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setPos((p) => clampPercent(p + step));
    } else if (e.key === "Home") {
      e.preventDefault();
      setPos(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setPos(100);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative aspect-[4/3] w-full select-none overflow-hidden rounded-xl border border-[var(--color-border)] touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* После (база) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={afterUrl}
        alt={`${alt} — после`}
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
        loading="lazy"
      />

      {/* До (обрезается по линии разделителя, без искажения пропорций) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={beforeUrl}
        alt={`${alt} — до`}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        draggable={false}
        loading="lazy"
      />

      {/* Подписи */}
      <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
        {afterLabel}
      </span>

      {/* Разделитель + ручка (она же slider для клавиатуры/скринридера) */}
      <div
        className="absolute inset-y-0 z-10 w-0.5 bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
        style={{ left: `${pos}%` }}
        aria-hidden
      />
      <div
        role="slider"
        tabIndex={0}
        aria-label="Сравнение «до» и «после» — двигайте, чтобы открыть результат"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        aria-valuetext={`Открыто ${Math.round(pos)}% фото «до»`}
        onKeyDown={onKeyDown}
        className="absolute top-1/2 z-20 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-[var(--color-border)] bg-white text-[var(--color-text)] shadow-cozy-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        style={{ left: `${pos}%` }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m9 6-6 6 6 6" />
          <path d="m15 6 6 6-6 6" />
        </svg>
      </div>
    </div>
  );
}
