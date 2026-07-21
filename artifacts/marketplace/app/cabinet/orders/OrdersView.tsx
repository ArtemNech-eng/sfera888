"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { cabinetOrders, type OrderListItem } from "../_lib/cabinetClient";

type Tab = "available" | "active" | "completed";

const TAB_LABELS: Record<Tab, string> = {
  available: "Доступные",
  active: "В работе",
  completed: "Завершённые",
};

export function OrdersView() {
  const [tab, setTab] = useState<Tab>("available");
  const [available, setAvailable] = useState<OrderListItem[] | null>(null);
  const [active, setActive] = useState<OrderListItem[] | null>(null);
  const [completed, setCompleted] = useState<OrderListItem[] | null>(null);
  const [loadingTab, setLoadingTab] = useState<Tab | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Always re-fetch the current tab when switching (no stale cache).
  const loadTab = useCallback(async (t: Tab) => {
    setLoadingTab(t);
    setError(null);
    try {
      if (t === "available") {
        const data = await cabinetOrders.fetchAvailable();
        setAvailable(data);
      } else {
        const data = await cabinetOrders.fetchMy(t);
        if (t === "active") setActive(data);
        else setCompleted(data);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Не удалось загрузить заказы";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoadingTab(null);
    }
  }, []);

  useEffect(() => {
    void loadTab(tab);
  }, [tab, loadTab]);

  const items = tab === "available" ? available : tab === "active" ? active : completed;
  const loading = loadingTab === tab && items === null;
  const empty = !loading && items !== null && items.length === 0;

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
          Заказы
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
          Ваши заказы
        </h1>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl border border-[var(--color-border)] bg-white p-1 shadow-sm">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => {
          const count =
            t === "available" ? available?.length
            : t === "active" ? active?.length
            : completed?.length;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                tab === t
                  ? "bg-[var(--color-cta)] text-[var(--color-on-cta)] shadow-sm"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
              }`}
            >
              {TAB_LABELS[t]}
              {typeof count === "number" && (
                <span className={`ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                  tab === t ? "bg-white/20 text-white" : "bg-[var(--color-background)] text-[var(--color-muted)]"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <span className="inline-block h-9 w-9 animate-spin rounded-full border-4 border-[var(--color-primary-soft)] border-t-[var(--color-primary)]" />
        </div>
      ) : error && items === null ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-8 text-center text-sm text-[var(--color-muted)]">
          {error}.{" "}
          <button type="button" onClick={() => loadTab(tab)}
            className="font-semibold text-[var(--color-primary)] hover:underline">
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
  const urgency = variant === "available" ? getUrgency(order) : null;

  return (
    <li className={`rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
      urgency?.hot ? "border-orange-300 ring-1 ring-orange-200" : "border-[var(--color-border)]"
    }`}>
      <Link href={`/cabinet/orders/${order.id}`} className="block p-4 sm:p-5">

        {/* Urgency banner — only on available */}
        {urgency && (
          <div className={`-mx-4 -mt-4 mb-4 flex items-center gap-2 rounded-t-2xl px-4 py-2 sm:-mx-5 sm:-mt-5 sm:px-5 ${
            urgency.hot
              ? "bg-gradient-to-r from-orange-500 to-red-500 text-white"
              : "bg-amber-50 text-amber-800"
          }`}>
            <span className="text-sm">{urgency.hot ? "🔥" : "⏱"}</span>
            <span className="text-xs font-bold">{urgency.competitorText}</span>
            <span className="ml-auto text-xs opacity-80">{urgency.timeText}</span>
          </div>
        )}

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--color-text)] sm:text-base">
              {order.serviceType}{" "}
              <span className="font-normal text-[var(--color-muted)]">№{order.id}</span>
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-[var(--color-muted)]">
              <span>{order.city}</span>
              {order.district && <><span aria-hidden>·</span><span>{order.district}</span></>}
              {Number.isFinite(order.area) && order.area > 0 && (
                <><span aria-hidden>·</span><span>{order.area} м²</span></>
              )}
            </div>
            {order.scheduledAt && (
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                📅 {formatDateTime(order.scheduledAt)}
              </p>
            )}
            {order.assignedAt && (
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Назначен {formatDateTime(order.assignedAt)}
              </p>
            )}
            {order.isRepeatClient && (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                ↻ Постоянный клиент
              </span>
            )}
          </div>
          {status && <StatusPill {...status} />}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
          <div className="text-sm">
            {order.proposedAmount != null && order.proposedAmount > 0 ? (
              <>
                <span className="text-[var(--color-muted)]">Сумма:</span>{" "}
                <span className="font-bold text-[var(--color-text)]">
                  {formatRubles(order.proposedAmount)} ₽
                </span>
              </>
            ) : variant === "available" ? (
              <span className="text-[var(--color-muted)]">Сумму назовёте на замере</span>
            ) : null}
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)]">
            {variant === "available" ? "Принять" : "Открыть"}
            <ArrowIcon />
          </span>
        </div>
      </Link>
    </li>
  );
}

// ── Urgency helpers ──────────────────────────────────────────────────────────

function getUrgency(order: OrderListItem) {
  // Deterministic fake floor: adds 1–3 competitors based on order.id parity.
  // Real count always wins if it's higher.
  const realCount = order.competitorCount ?? 0;
  const fakeFloor = (order.id % 3) + 1;          // 1, 2 or 3 — deterministic
  const displayCount = Math.max(realCount, fakeFloor);

  const dispatchTs = order.dispatchedAt ?? order.createdAt;
  const minutesAgo = dispatchTs
    ? Math.floor((Date.now() - new Date(dispatchTs).getTime()) / 60_000)
    : null;

  const hot = displayCount >= 3 || (minutesAgo !== null && minutesAgo < 10);

  const competitorText =
    displayCount === 1
      ? "1 мастер уже откликнулся"
      : `${displayCount} мастера откликнулись`;

  const timeText =
    minutesAgo === null ? ""
    : minutesAgo < 1 ? "только что"
    : minutesAgo < 60 ? `${minutesAgo} мин назад`
    : `${Math.floor(minutesAgo / 60)} ч назад`;

  return { hot, competitorText, timeText, displayCount };
}

// ── Status pills ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; tone: "primary" | "ok" | "amber" | "muted" | "red" }> = {
  master_assigned: { label: "Назначен", tone: "primary" },
  in_progress: { label: "В процессе", tone: "ok" },
  cancellation_requested: { label: "Отмена", tone: "amber" },
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
    tone === "ok" ? "bg-emerald-50 text-emerald-700"
    : tone === "amber" ? "bg-amber-50 text-amber-700"
    : tone === "red" ? "bg-red-50 text-red-700"
    : tone === "primary" ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
    : "bg-[var(--color-background)] text-[var(--color-muted)]";
  return (
    <span className={`inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ── Empty states ─────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: Tab }) {
  const messages: Record<Tab, { icon: string; title: string; sub: string }> = {
    available: {
      icon: "🔍",
      title: "Свободных заявок пока нет",
      sub: "Мы ищем для вас новые. Как только появятся — увидите здесь.",
    },
    active: {
      icon: "🔧",
      title: "Активных заказов нет",
      sub: "Возьмите заявку из вкладки «Доступные», чтобы начать работу.",
    },
    completed: {
      icon: "📋",
      title: "История пока пустая",
      sub: "Завершённые и отменённые заказы будут собираться здесь.",
    },
  };
  const m = messages[tab];
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-10 text-center">
      <div className="text-3xl">{m.icon}</div>
      <p className="mt-3 text-base font-semibold text-[var(--color-text)]">{m.title}</p>
      <p className="mt-1.5 text-sm text-[var(--color-muted)]">{m.sub}</p>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

function ArrowIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
    </svg>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRubles(n: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}
