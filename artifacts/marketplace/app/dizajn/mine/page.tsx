"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DesignStatus } from "../../../lib/types";

/**
 * `/dizajn/mine` — список AI-дизайнов текущего анонимного посетителя
 * (plan §21.1, Requirements 4.3 + 4.7).
 *
 * Owner-id берётся из cookie `kiro_anon_id` — её ставит api-server
 * (`anonIdMiddleware`) и фронт-проксии при первом обращении (`/api/dizajn/generate`).
 * Поэтому страница — client component: SSR-кэша по этому списку быть не должно
 * (per-visitor data), а cookie уходит автоматически в `fetch(..., { credentials: "include" })`
 * на same-origin запрос к `/api/marketplace/dizajn/mine` (этот путь зарегистрирован
 * в задаче 18.1).
 *
 * Состояния UI:
 *   - loading — скелетон сетки
 *   - empty — дружелюбный empty-state с CTA «Создать дизайн»
 *   - error — короткое сообщение + кнопка «Попробовать снова»
 *   - data — сетка карточек: миниатюра + room/style + бейдж статуса +
 *     прогресс для `generating` + дата
 */

interface MineItem {
  slug: string;
  roomType: string;
  style: string;
  status: DesignStatus;
  progress: number;
  resultImageUrl: string | null;
  createdAt: string;
}

interface MineResponse {
  ok: true;
  items: MineItem[];
}

const ROOM_LABELS: Record<string, string> = {
  bathroom: "Ванная",
  kitchen: "Кухня",
  living_room: "Гостиная",
  bedroom: "Спальня",
  hallway: "Прихожая",
  apartment: "Квартира",
  nursery: "Детская",
};

const STYLE_LABELS: Record<string, string> = {
  modern: "Современный",
  scandinavian: "Скандинавский",
  loft: "Лофт",
  minimalism: "Минимализм",
  neoclassic: "Неоклассика",
  japandi: "Японди",
  classic: "Классический",
};

const STATUS_LABELS: Record<DesignStatus, string> = {
  draft: "Черновик",
  generating: "Генерируется",
  completed: "Готов",
  failed: "Ошибка",
  private: "Скрыт",
};

const DATE_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default function MyDesignsPage() {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "data"; items: MineItem[] }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/dizajn/mine", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          if (!cancelled) {
            setState({
              kind: "error",
              message: "Не удалось загрузить ваши проекты. Попробуйте обновить страницу.",
            });
          }
          return;
        }
        const body = (await res.json()) as Partial<MineResponse>;
        if (!cancelled) {
          const items = Array.isArray(body.items) ? body.items : [];
          setState({ kind: "data", items });
        }
      } catch {
        if (!cancelled) {
          setState({
            kind: "error",
            message: "Сеть недоступна. Проверьте соединение и попробуйте ещё раз.",
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Авто-обновление, если в списке есть проекты со status='generating'.
  // Поллим раз в 5 секунд, пока есть хотя бы один такой.
  useEffect(() => {
    if (state.kind !== "data") return;
    const hasGenerating = state.items.some((i) => i.status === "generating");
    if (!hasGenerating) return;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/dizajn/mine", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const body = (await res.json()) as Partial<MineResponse>;
        const items = Array.isArray(body.items) ? body.items : [];
        setState({ kind: "data", items });
      } catch {
        // network blip — попытаемся в следующем тике
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [state]);

  return (
    <>
      <header className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
          <nav className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <Link href="/" className="hover:text-[var(--color-text)]">Главная</Link>
            <span aria-hidden>/</span>
            <Link href="/dizajn" className="hover:text-[var(--color-text)]">AI-дизайн</Link>
            <span aria-hidden>/</span>
            <span className="text-[var(--color-text)]">Мои проекты</span>
          </nav>

          <h1 className="font-display mt-7 max-w-3xl text-4xl text-[var(--color-text)] sm:text-5xl">
            Мои дизайн-проекты.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
            Проекты, которые вы создавали в этом браузере. На другом устройстве
            будет своя подборка — синхронизация появится после регистрации аккаунта.
          </p>
        </div>
      </header>

      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-2 sm:px-6 sm:pb-20">
          {state.kind === "loading" ? <LoadingGrid /> : null}
          {state.kind === "error" ? <ErrorState message={state.message} /> : null}
          {state.kind === "data" && state.items.length === 0 ? <EmptyState /> : null}
          {state.kind === "data" && state.items.length > 0 ? (
            <DesignsGrid items={state.items} />
          ) : null}
        </div>
      </section>
    </>
  );
}

// ── Grid ───────────────────────────────────────────────────────────────────

function DesignsGrid({ items }: { items: MineItem[] }) {
  return (
    <ul className="grid grid-cols-1 gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <li key={item.slug}>
          <DesignCard item={item} />
        </li>
      ))}
    </ul>
  );
}

function DesignCard({ item }: { item: MineItem }) {
  const roomLabel = ROOM_LABELS[item.roomType] ?? item.roomType;
  const styleLabel = STYLE_LABELS[item.style] ?? item.style;
  const dateLabel = formatDate(item.createdAt);

  return (
    <Link
      href={`/dizajn/${item.slug}`}
      className="group block focus:outline-none"
      aria-label={`${roomLabel}, стиль ${styleLabel}, ${STATUS_LABELS[item.status]}`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[var(--color-cream-deep)] shadow-cozy transition group-hover:shadow-cozy-md">
        {item.resultImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.resultImageUrl}
            alt={`${roomLabel} в стиле ${styleLabel}`}
            loading="lazy"
            className="block h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
          />
        ) : (
          <ThumbnailPlaceholder status={item.status} />
        )}

        <div className="absolute left-3 top-3">
          <StatusBadge status={item.status} progress={item.progress} />
        </div>
      </div>

      <div className="mt-3 px-1">
        <p className="text-sm font-semibold text-[var(--color-text)] transition group-hover:text-[var(--color-primary)]">
          {roomLabel}
          <span className="text-[var(--color-muted)]"> · </span>
          <span className="font-normal">{styleLabel}</span>
        </p>
        {item.status === "generating" ? (
          <ProgressBar progress={item.progress} />
        ) : null}
        <p className="mt-2 text-xs text-[var(--color-muted)]">{dateLabel}</p>
      </div>
    </Link>
  );
}

function ThumbnailPlaceholder({ status }: { status: DesignStatus }) {
  return (
    <div className="flex h-full w-full items-center justify-center text-[var(--color-muted)]">
      {status === "generating" ? (
        <span className="inline-flex items-center gap-2 text-xs font-medium">
          <Spinner /> Генерируется…
        </span>
      ) : status === "failed" ? (
        <span className="text-xs font-medium">Не удалось</span>
      ) : (
        <span className="text-xs font-medium">Без превью</span>
      )}
    </div>
  );
}

// ── Status ─────────────────────────────────────────────────────────────────

function StatusBadge({ status, progress }: { status: DesignStatus; progress: number }) {
  const tone = badgeTone(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${tone.bg} ${tone.text}`}
    >
      {status === "generating" ? <Spinner /> : null}
      {STATUS_LABELS[status]}
      {status === "generating" ? <span className="tabular-nums">{Math.max(0, Math.min(100, progress))}%</span> : null}
    </span>
  );
}

function badgeTone(status: DesignStatus): { bg: string; text: string } {
  switch (status) {
    case "completed":
      return { bg: "bg-[#dcfce7]", text: "text-[#166534]" };
    case "generating":
      return { bg: "bg-[#dbeafe]", text: "text-[#1d4ed8]" };
    case "failed":
      return { bg: "bg-[#fee2e2]", text: "text-[#b91c1c]" };
    case "private":
      return { bg: "bg-[#e5e7eb]", text: "text-[#374151]" };
    case "draft":
    default:
      return { bg: "bg-[#fef3c7]", text: "text-[#92400e]" };
  }
}

function ProgressBar({ progress }: { progress: number }) {
  const pct = Math.max(0, Math.min(100, progress));
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-cream-deep)]">
      <div
        className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-500"
        style={{ width: `${pct}%` }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}

function Spinner() {
  return (
    <svg
      aria-hidden
      className="h-3 w-3 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── States ─────────────────────────────────────────────────────────────────

function LoadingGrid() {
  return (
    <ul className="grid grid-cols-1 gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="animate-pulse">
          <div className="aspect-[4/3] w-full rounded-2xl bg-[var(--color-cream-deep)]" />
          <div className="mt-3 h-4 w-2/3 rounded bg-[var(--color-cream-deep)]" />
          <div className="mt-2 h-3 w-1/3 rounded bg-[var(--color-cream-deep)]" />
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-md py-16 text-center sm:py-24">
      <h2 className="font-display text-3xl text-[var(--color-text)] sm:text-4xl">
        Здесь будут ваши проекты.
      </h2>
      <p className="mt-4 text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
        Создайте первый AI-дизайн — мы соберём для вас 6 ракурсов, план,
        палитру и смету. Без регистрации.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/ai-design"
          className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--color-primary)] px-6 text-sm font-semibold text-white shadow-cozy transition hover:bg-[var(--color-primary-hover)]"
        >
          Создать дизайн
        </Link>
        <Link
          href="/dizajn"
          className="inline-flex h-12 items-center gap-2 rounded-full border border-[var(--color-text)] bg-transparent px-6 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-text)] hover:text-white"
        >
          Посмотреть примеры
        </Link>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center sm:py-20">
      <p className="text-base text-[var(--color-text)]">{message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-6 inline-flex h-11 items-center gap-2 rounded-full border border-[var(--color-text)] bg-transparent px-5 text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-text)] hover:text-white"
      >
        Попробовать снова
      </button>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return DATE_FORMATTER.format(d);
}
