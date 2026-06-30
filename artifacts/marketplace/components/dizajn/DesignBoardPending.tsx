"use client";

import { useEffect, useState } from "react";
import type { DesignFullDTO } from "../../lib/types";
import { shouldContinuePolling } from "./shouldContinuePolling";
import {
  useGenerationQuota,
  consumePendingGeneration,
} from "../../lib/useGenerationQuota";

/**
 * Polling state для status='generating'. Каждые `POLL_INTERVAL_MS` пуллит
 * GET /api/dizajn/[slug], перезагружает страницу когда status меняется на
 * completed/failed.
 *
 * Прогресс-бар оценочный (провайдеры image-gen не отдают реальный прогресс):
 * плавная асимптотическая кривая, которая всё время ползёт вверх и не «залипает»
 * на одном числе, пока бэк дорисовывает. Окно ожидания — `MAX_POLLS`.
 */

/** Интервал опроса статуса. */
const POLL_INTERVAL_MS = 2000;

/**
 * Окно ожидания: 150 опросов × 2с = 300с (5 минут). Генерация с фото
 * (image-to-image, 4 ракурса по 40–70с) штатно занимает ~2–3 минуты, поэтому
 * прежние 120с обрывали ожидание раньше, чем дизайн успевал завершиться, и
 * пользователь видел «занимает дольше обычного», хотя проект вот-вот готов.
 */
const MAX_POLLS = 150;

/**
 * Характерное время (с) асимптоты прогресс-бара. progress ≈ 100·(1−e^(−t/τ)):
 * к ~2.5 минутам бар подходит к ~95%, но продолжает медленно ползти и никогда
 * не замирает на месте до фактического завершения.
 */
const PROGRESS_TAU_SECONDS = 70;

/**
 * Оценочный прогресс по прошедшему времени — плавная асимптота, всегда
 * растёт, упирается в 98% (последний процент добавляет фактический complete).
 * Вынесена чистой функцией для детерминизма.
 */
export function estimateProgress(elapsedSeconds: number): number {
  const raw = 100 * (1 - Math.exp(-Math.max(0, elapsedSeconds) / PROGRESS_TAU_SECONDS));
  return Math.min(98, Math.round(raw));
}

interface Props {
  slug: string;
  initialDesign: DesignFullDTO;
}

export function DesignBoardPending({ slug, initialDesign }: Props) {
  const [design, setDesign] = useState(initialDesign);
  const [pollCount, setPollCount] = useState(0);
  const { ready: quotaReady, refund: refundQuota } = useGenerationQuota();

  // Возврат бесплатной квоты при падении генерации (только один раз и только
  // для слага, который ЭТО устройство реально запустило — см. pending-маркер в
  // useGenerationQuota). Серверная ошибка не должна «съедать» попытку. Ждём
  // гидрацию квоты (`quotaReady`), иначе refund() прочитал бы дефолтное
  // состояние и затёр бы реальное значение в localStorage.
  useEffect(() => {
    if (design.status !== "failed" || !quotaReady) return;
    if (consumePendingGeneration(slug)) {
      refundQuota();
    }
  }, [design.status, quotaReady, slug, refundQuota]);

  useEffect(() => {
    if (!shouldContinuePolling(design.status)) return;
    if (pollCount >= MAX_POLLS) return;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/dizajn/${slug}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok && data.design) {
          setDesign(data.design);
          if (data.design.status === "completed") {
            // Успех — снимаем pending-маркер (без возврата квоты), чтобы он не
            // накапливался; затем reload для полного SSR-рендера DesignBoard.
            consumePendingGeneration(slug);
            window.location.reload();
          }
        }
      } catch {
        // network error — продолжаем
      } finally {
        setPollCount((c) => c + 1);
      }
    }, POLL_INTERVAL_MS);

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
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-[var(--color-cta)] px-6 text-sm font-semibold text-[var(--color-on-cta)] shadow-cozy transition hover:bg-[var(--color-cta-hover)]"
          >
            Попробовать ещё раз
          </a>
        </div>
      </section>
    );
  }

  if (pollCount >= MAX_POLLS) {
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

  const progress = Math.max(design.progress, estimateProgress(pollCount * (POLL_INTERVAL_MS / 1000)));

  return (
    <section className="bg-[var(--color-background)]">
      <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <p className="font-eyebrow">Генерация дизайн-проекта</p>
        <h1 className="font-display mt-3 text-3xl text-[var(--color-text)] sm:text-4xl">
          Готовим ваш дизайн…
        </h1>
        <p className="mt-4 text-base leading-relaxed text-[var(--color-muted)]">
          AI сейчас рисует {viewsText(design.roomType)} в {styleText(design.style)} стиле.
          Обычно занимает 1–3 минуты — особенно если вы загрузили фото.
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
                        ? "bg-[var(--color-cta)] text-[var(--color-on-cta)]"
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
