"use client";

import { useEffect, useState } from "react";
import type { DesignFullDTO } from "../../lib/types";

/**
 * Polling state для status='generating'. Каждые 2с пуллит GET /api/dizajn/[slug],
 * перезагружает страницу когда status меняется на completed/failed.
 *
 * Прогресс-бар оценочный — основан на elapsed time и assumed 30s gen time.
 * Реальный прогресс не возвращается провайдерами image gen.
 */

interface Props {
  slug: string;
  initialDesign: DesignFullDTO;
}

export function DesignBoardPending({ slug, initialDesign }: Props) {
  const [design, setDesign] = useState(initialDesign);
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    if (design.status !== "generating") return;
    if (pollCount >= 60) return; // 60 polls × 2s = 120s timeout

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/dizajn/${slug}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok && data.design) {
          setDesign(data.design);
          if (data.design.status === "completed") {
            // Reload так чтобы server-component DesignBoard отрендерился
            // полностью с meta-tags и SSR data.
            window.location.reload();
          }
        }
      } catch {
        // network error — продолжаем
      } finally {
        setPollCount((c) => c + 1);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [design.status, pollCount, slug]);

  if (design.status === "failed") {
    return (
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
          <h1 className="font-display text-3xl text-[var(--color-text)] sm:text-4xl">
            Что-то пошло не так.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[var(--color-muted)]">
            {design.errorMessage ?? "Не удалось сгенерировать дизайн. Попробуйте загрузить другое фото."}
          </p>
          <a
            href="/dizajn"
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-[var(--color-primary)] px-6 text-sm font-semibold text-white shadow-cozy transition hover:bg-[var(--color-primary-hover)]"
          >
            Попробовать ещё раз
          </a>
        </div>
      </section>
    );
  }

  if (pollCount >= 60) {
    return (
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
          <h1 className="font-display text-3xl text-[var(--color-text)] sm:text-4xl">
            Генерация занимает дольше обычного.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[var(--color-muted)]">
            Обновите страницу через минуту — обычно дизайн уже готов. Если нет —
            попробуйте загрузить другое фото.
          </p>
          <a
            href={`/dizajn/${slug}`}
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-[var(--color-text)] px-6 text-sm font-semibold text-white transition hover:bg-[var(--color-primary-hover)]"
          >
            Обновить страницу
          </a>
        </div>
      </section>
    );
  }

  const progress = Math.max(design.progress, Math.min(95, pollCount * 4));

  return (
    <section className="bg-[var(--color-background)]">
      <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <p className="font-eyebrow">Генерация дизайн-проекта</p>
        <h1 className="font-display mt-3 text-3xl text-[var(--color-text)] sm:text-4xl">
          Готовим ваш дизайн…
        </h1>
        <p className="mt-4 text-base leading-relaxed text-[var(--color-muted)]">
          AI сейчас рисует {viewsText(design.roomType)} в {styleText(design.style)} стиле.
          Обычно занимает 30-60 секунд.
        </p>

        {/* Прогресс-бар */}
        <div className="mt-10 mx-auto max-w-md">
          <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
            <span>Прогресс</span>
            <span className="font-semibold text-[var(--color-text)]">{progress}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
            <div
              className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-1000"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Steps indicator */}
        <ul className="mt-12 space-y-2 text-left">
          {STEPS.map((step, idx) => {
            const stepProgress = (idx + 1) * 25;
            const done = progress >= stepProgress;
            const active = !done && progress >= idx * 25;
            return (
              <li
                key={step}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition ${
                  done
                    ? "bg-[var(--color-cream-deep)] text-[var(--color-text)]"
                    : active
                      ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]"
                      : "text-[var(--color-faint)]"
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    done
                      ? "bg-[var(--color-text)] text-white"
                      : active
                        ? "bg-[var(--color-primary)] text-white"
                        : "border border-[var(--color-border)] text-[var(--color-faint)]"
                  }`}
                >
                  {done ? "✓" : idx + 1}
                </span>
                <span className="font-medium">{step}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

const STEPS = [
  "Изучаем фото вашей комнаты",
  "Генерируем 4 ракурса в выбранном стиле",
  "Подбираем материалы и составляем смету",
  "Финальная сборка дизайн-проекта",
];

function viewsText(room: string): string {
  const labels: Record<string, string> = {
    bathroom: "ванную",
    kitchen: "кухню",
    living_room: "гостиную",
    bedroom: "спальню",
    hallway: "прихожую",
    apartment: "квартиру",
  };
  return labels[room] ?? "комнату";
}

function styleText(style: string): string {
  const labels: Record<string, string> = {
    modern: "современном",
    scandinavian: "скандинавском",
    loft: "лофт",
    minimalism: "минималистичном",
    neoclassic: "неоклассическом",
    japandi: "японди",
  };
  return labels[style] ?? style;
}
