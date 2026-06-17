"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cabinetOrders, type OrderListItem } from "../_lib/cabinetClient";

type Tab = "available" | "active" | "completed";

const TAB_LABELS: Record<Tab, string> = {
  available: "Доступные",
  active: "В работе",
  completed: "Завершённые",
};

/**
 * Read-only `/cabinet/orders` list (plan §18.3 W2).
 *
 * Three tabs — Доступные / В работе / Завершённые — each backed by a
 * dedicated proxy endpoint. Cards show all the info a master needs to
 * decide whether to act, but the actions themselves (Accept / Respond /
 * Reject / Update status / Complete) deep-link to the master-pwa app for
 * now. Porting the actions is the next iteration — each one carries
 * eligibility checks, receipt creation flows and photo uploads that
 * deserve their own commit.
 */
export function OrdersView() {
  const [tab, setTab] = useState<Tab>("available");
  const [available, setAvailable] = useState<OrderListItem[] | null>(null);
  const [active, setActive] = useState<OrderListItem[] | null>(null);
  const [completed, setCompleted] = useState<OrderListItem[] | null>(null);
  const [loadingTab, setLoadingTab] = useState<Tab | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lazy load each tab's data on first selection. Keeps the initial paint
  // cheap (just the available tab) and avoids a triple round-trip.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoadingTab(tab);
        setError(null);
        if (tab === "available" && available === null) {
          const data = await cabinetOrders.fetchAvailable();
          if (!cancelled) setAvailable(data);
        } else if (tab === "active" && active === null) {
          const data = await cabinetOrders.fetchMy("active");
          if (!cancelled) setActive(data);
        } else if (tab === "completed" && completed === null) {
          const data = await cabinetOrders.fetchMy("completed");
          if (!cancelled) setCompleted(data);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Не удалось загрузить заказы";
        setError(msg);
        toast.error(msg);
      } finally {
        if (!cancelled) setLoadingTab(null);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // We intentionally depend only on `tab` — once a tab is loaded its
    // state cache stays in memory until the user navigates away. Adding
    // available / active / completed to deps would create a fetch loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const items = tab === "available" ? available : tab === "active" ? active : completed;
  const empty = items !== null && items.length === 0;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
          Заказы
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
          Ваши заказы
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Доступные заявки, текущая работа и история. Действия (принять / отклонить / завершить)
          пока выполняются в старом приложении.
        </p>
      </header>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-2xl border border-[var(--color-border)] bg-white p-1 shadow-sm">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => {
          const count = t === "available" ? available?.length : t === "active" ? active?.length : completed?.length;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                tab === t
                  ? "bg-[var(--color-primary)] text-white shadow-sm"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
              }`}
            >
              {TAB_LABELS[t]}
              {typeof count === "number" ? (
                <span
                  className={`ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                    tab === t ? "bg-white/20 text-white" : "bg-[var(--color-background)] text-[var(--color-muted)]"
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Body */}
      {loadingTab === tab && items === null ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <span className="inline-block h-9 w-9 animate-spin rounded-full border-4 border-[var(--color-primary-soft)] border-t-[var(--color-primary)]" />
        </div>
      ) : error && items === null ? (
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
      ) : empty ? (
        <EmptyState tab={tab} />
      ) : items ? (
        <ul className="space-y-3">
          {items.map((order) => (
            <OrderCard key={order.id} order={order} variant={tab} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ── Order card ──────────────────────────────────────────────────────────────

function OrderCard({ order, variant }: { order: OrderListItem; variant: Tab }) {
  const status = STATUS_BY_VARIANT[variant](order);
  return (
    <li className="rounded-2xl border border-[var(--color-border)] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link
        href={`/cabinet/orders/${order.id}`}
        className="block p-4 sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--color-text)] sm:text-base">
              {order.serviceType} <span className="text-[var(--color-muted)]">№{order.id}</span>
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-[var(--color-muted)]">
              <span>{order.city}</span>
              {order.district ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{order.district}</span>
                </>
              ) : null}
              {Number.isFinite(order.area) && order.area > 0 ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{order.area} м²</span>
                </>
              ) : null}
            </div>
            {order.scheduledAt ? (
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                На {formatDateTime(order.scheduledAt)}
              </p>
            ) : null}
            {order.assignedAt ? (
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Назначен {formatDateTime(order.assignedAt)}
              </p>
            ) : null}
          </div>
          {status ? <StatusPill {...status} /> : null}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
          <div className="text-sm">
            {order.proposedAmount != null && order.proposedAmount > 0 ? (
              <>
                <span className="text-[var(--color-muted)]">Сумма работ:</span>{" "}
                <span className="font-bold text-[var(--color-text)]">
                  {formatRubles(order.proposedAmount)} ₽
                </span>
              </>
            ) : variant === "available" ? (
              <span className="text-[var(--color-muted)]">Сумму уточнит мастер</span>
            ) : null}
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)]">
            {variant === "available" ? "Открыть и принять" : "Открыть"}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </span>
        </div>
      </Link>
    </li>
  );
}

// ── Status pills ────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; tone: "primary" | "ok" | "amber" | "muted" | "red" }> = {
  master_assigned: { label: "Назначен", tone: "primary" },
  in_progress: { label: "В процессе", tone: "ok" },
  cancellation_requested: { label: "Отмена в обработке", tone: "amber" },
  refund_requested: { label: "Возврат", tone: "red" },
  completed: { label: "Завершён", tone: "ok" },
  cancelled: { label: "Отменён", tone: "muted" },
  waiting_master: { label: "Ожидает мастера", tone: "muted" },
};

const WORK_STATUS_LABELS: Record<string, string> = {
  on_the_way: "В пути",
  on_site: "На объекте",
  estimating: "Замер",
  in_progress: "Работа",
  finishing: "Финал",
  completed: "Готов к сдаче",
};

const STATUS_BY_VARIANT: Record<Tab, (o: OrderListItem) => { label: string; tone: "primary" | "ok" | "amber" | "muted" | "red" } | null> = {
  available: () => null,
  active: (o) => {
    if (o.masterWorkStatus && WORK_STATUS_LABELS[o.masterWorkStatus]) {
      return { label: WORK_STATUS_LABELS[o.masterWorkStatus]!, tone: "ok" };
    }
    return STATUS_LABELS[o.status] ?? null;
  },
  completed: (o) => STATUS_LABELS[o.status] ?? { label: o.status, tone: "muted" },
};

function StatusPill({ label, tone }: { label: string; tone: "primary" | "ok" | "amber" | "muted" | "red" }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700"
        : tone === "red"
          ? "bg-red-50 text-red-700"
          : tone === "primary"
            ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
            : "bg-[var(--color-background)] text-[var(--color-muted)]";
  return (
    <span className={`inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ── Empty states ────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: Tab }) {
  const messages: Record<Tab, { title: string; sub: string; cta?: string }> = {
    available: {
      title: "Свободных заявок сейчас нет",
      sub: "Мы ищем для вас новые. Когда появятся — увидите сразу здесь.",
    },
    active: {
      title: "Активных заказов нет",
      sub: "Возьмите заявку из вкладки «Доступные», чтобы появилась работа.",
    },
    completed: {
      title: "История пока пустая",
      sub: "Завершённые и отменённые заказы будут собираться здесь.",
    },
  };
  const m = messages[tab];
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-10 text-center">
      <p className="text-base font-semibold text-[var(--color-text)]">{m.title}</p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{m.sub}</p>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatRubles(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
