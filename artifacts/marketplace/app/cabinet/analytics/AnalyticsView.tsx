"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cabinetAnalytics, type AnalyticsData } from "../_lib/cabinetClient";

/**
 * Master analytics dashboard.
 *
 * The api-server returns lifetime + last-30-day counters in one shot — we
 * fetch once on mount and render four big tiles + a 30-day rollup card
 * + average order amount + top rejection reasons.
 */
export function AnalyticsView() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    cabinetAnalytics
      .fetch()
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        const msg = err.message ?? "Не удалось загрузить аналитику";
        setError(msg);
        toast.error(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="inline-block h-9 w-9 animate-spin rounded-full border-4 border-[var(--color-primary-soft)] border-t-[var(--color-primary)]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-8 text-center text-sm text-[var(--color-muted)]">
        {error ?? "Аналитика недоступна"}.{" "}
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

  const topRejects = Object.entries(data.rejectionReasons ?? {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
          Аналитика
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
          Моя конверсия
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Сколько заявок дошло до вас, сколько вы взяли в работу. Ниже — точки роста.
        </p>
      </header>

      {/* Lifetime tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Заявок получено"
          value={data.totalDispatched}
          sub="за всё время"
          tone="muted"
        />
        <Tile
          label="Откликнулся"
          value={data.totalResponded}
          tone="primary"
        />
        <Tile
          label="Выбрали вас"
          value={data.totalAssigned}
          tone="ok"
        />
        <Tile
          label="Конверсия"
          value={`${data.winRate}%`}
          sub="отклик → назначение"
          tone="amber"
        />
      </div>

      {/* 30-day rollup */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-bold text-[var(--color-text)]">За последние 30 дней</h2>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          Свежие цифры — то, что больше всего отражает текущее качество работы.
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <Cell label="Заявок получено" value={data.last30Days.dispatched} />
          <Cell label="Откликнулся" value={data.last30Days.responded} />
          <Cell label="Назначен" value={data.last30Days.assigned} accent="ok" />
        </dl>
      </section>

      {/* Average ticket */}
      {data.avgOrderAmount > 0 ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
          <div>
            <p className="text-sm font-semibold text-amber-900">Средний чек</p>
            <p className="mt-0.5 text-xs text-amber-800">
              По завершённым заказам — основа для оценки заработка.
            </p>
          </div>
          <p className="text-2xl font-bold text-amber-900">
            {formatRubles(data.avgOrderAmount)} ₽
          </p>
        </section>
      ) : null}

      {/* Top rejections */}
      {topRejects.length > 0 ? (
        <section className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-bold text-[var(--color-text)]">
            Частые причины отказа
          </h2>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            То, из-за чего заявки уходили мимо. Если повторяется одно — стоит подкрутить условия в фильтрах.
          </p>
          <ul className="mt-4 divide-y divide-[var(--color-border)]">
            {topRejects.map(([reason, count]) => (
              <li
                key={reason}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="text-[var(--color-text)]">{reason}</span>
                <span className="font-bold text-[var(--color-muted)]">{count}×</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone: "primary" | "ok" | "amber" | "muted";
}) {
  const valueCls =
    tone === "ok"
      ? "text-emerald-700"
      : tone === "amber"
        ? "text-amber-700"
        : tone === "primary"
          ? "text-[var(--color-primary)]"
          : "text-[var(--color-text)]";
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        {label}
      </p>
      <p className={`mt-1 text-3xl font-bold ${valueCls}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">{sub}</p> : null}
    </div>
  );
}

function Cell({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "ok";
}) {
  const cls = accent === "ok" ? "text-emerald-700" : "text-[var(--color-text)]";
  return (
    <div>
      <dt className="text-xs text-[var(--color-muted)]">{label}</dt>
      <dd className={`mt-0.5 text-2xl font-bold ${cls}`}>{value}</dd>
    </div>
  );
}

function formatRubles(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}
