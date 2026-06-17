"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cabinetOrders, type OrderListItem } from "../_lib/cabinetClient";

const DAYS_AHEAD = 7;

/**
 * 7-day agenda view backed by GET /orders/my?filter=active.
 *
 * Buckets each order by the local date of its `scheduledAt` field. Orders
 * without a scheduled date land in a separate "Без даты" section below the
 * calendar — those usually need the master to call the client and pick a slot.
 */
export function ScheduleView() {
  const [items, setItems] = useState<OrderListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    cabinetOrders
      .fetchMy("active")
      .then((data) => {
        if (cancelled) return;
        setItems(data);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        const msg = err.message ?? "Не удалось загрузить расписание";
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

  const days = useMemo(() => buildDays(DAYS_AHEAD), []);

  const buckets = useMemo(() => {
    const byDay = new Map<string, OrderListItem[]>();
    const undated: OrderListItem[] = [];
    if (!items) return { byDay, undated };
    for (const o of items) {
      if (!o.scheduledAt) {
        undated.push(o);
        continue;
      }
      const key = dayKey(new Date(o.scheduledAt));
      const existing = byDay.get(key);
      if (existing) existing.push(o);
      else byDay.set(key, [o]);
    }
    // Sort each day's bucket by time ascending.
    for (const list of byDay.values()) {
      list.sort((a, b) => {
        const aT = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
        const bT = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
        return aT - bT;
      });
    }
    return { byDay, undated };
  }, [items]);

  const totalScheduled = useMemo(() => {
    let n = 0;
    for (const list of buckets.byDay.values()) n += list.length;
    return n;
  }, [buckets]);

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

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
          Расписание
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
          Ближайшие 7 дней
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Запланированные заказы из раздела «В работе».
          {" "}
          {totalScheduled === 0
            ? "На неделе ничего не назначено."
            : `${totalScheduled} ${pluralize(totalScheduled, ["заказ", "заказа", "заказов"])} на неделе.`}
        </p>
      </header>

      <ul className="space-y-3">
        {days.map((day) => {
          const orders = buckets.byDay.get(dayKey(day)) ?? [];
          return <DayCard key={dayKey(day)} day={day} orders={orders} />;
        })}
      </ul>

      {buckets.undated.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Без даты
          </h2>
          <p className="mb-3 text-xs text-[var(--color-muted)]">
            Уточните у клиента время — позвоните или напишите в чат.
          </p>
          <ul className="space-y-2">
            {buckets.undated.map((o) => (
              <li key={o.id}>
                <OrderRow order={o} compact />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function DayCard({ day, orders }: { day: Date; orders: OrderListItem[] }) {
  const today = isSameDay(day, new Date());
  const tomorrow = isSameDay(day, addDays(new Date(), 1));
  const dayName = formatDayName(day);
  const dateText = day.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

  return (
    <li className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
      <header className="flex items-baseline justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-background)] px-5 py-3">
        <div>
          <p className={`text-sm font-bold ${today ? "text-[var(--color-primary)]" : "text-[var(--color-text)]"}`}>
            {today ? "Сегодня" : tomorrow ? "Завтра" : capitalize(dayName)}
          </p>
          <p className="text-xs text-[var(--color-muted)]">{dateText}</p>
        </div>
        <p className="text-xs text-[var(--color-muted)]">
          {orders.length === 0
            ? "Свободно"
            : `${orders.length} ${pluralize(orders.length, ["заказ", "заказа", "заказов"])}`}
        </p>
      </header>
      {orders.length === 0 ? (
        <div className="px-5 py-4 text-sm text-[var(--color-muted)]">
          Пока без записи.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {orders.map((o) => (
            <li key={o.id}>
              <OrderRow order={o} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function OrderRow({ order, compact }: { order: OrderListItem; compact?: boolean }) {
  return (
    <Link
      href={`/cabinet/orders/${order.id}`}
      className={`flex items-start gap-3 px-5 py-3 transition hover:bg-[var(--color-background)] ${
        compact ? "rounded-2xl border border-[var(--color-border)] bg-white" : ""
      }`}
    >
      {order.scheduledAt ? (
        <div className="flex w-12 flex-shrink-0 flex-col items-start text-xs">
          <span className="text-base font-bold text-[var(--color-text)]">
            {formatTime(order.scheduledAt)}
          </span>
        </div>
      ) : (
        <div className="flex w-12 flex-shrink-0 items-start text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          без часа
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--color-text)]">
          {order.serviceType} <span className="text-[var(--color-muted)]">№{order.id}</span>
        </p>
        <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
          {order.city}
          {order.district ? ` · ${order.district}` : ""}
          {Number.isFinite(order.area) && order.area > 0 ? ` · ${order.area} м²` : ""}
        </p>
        {order.masterWorkStatus ? (
          <p className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            {workStatusLabel(order.masterWorkStatus)}
          </p>
        ) : null}
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="mt-1.5 flex-shrink-0 text-[var(--color-muted)]" aria-hidden>
        <path d="m9 18 6-6-6-6" />
      </svg>
    </Link>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildDays(count: number): Date[] {
  const out: Date[] = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i++) out.push(addDays(start, i));
  return out;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function formatDayName(d: Date): string {
  return d.toLocaleDateString("ru-RU", { weekday: "long" });
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function workStatusLabel(s: string): string {
  const map: Record<string, string> = {
    on_the_way: "В пути",
    on_site: "На объекте",
    estimating: "Замер",
    in_progress: "Работа",
    finishing: "Финал",
    completed: "Готов к сдаче",
  };
  return map[s] ?? s;
}

function pluralize(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
