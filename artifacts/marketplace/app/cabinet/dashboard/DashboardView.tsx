"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  cabinetHome,
  type CabinetHome,
  type OrderHomeCard,
  type ActiveOrderHomeCard,
} from "../_lib/cabinetClient";

/**
 * Master's `/cabinet/dashboard` — overview screen that loads after login.
 *
 * Read-only by design in this iteration: counts, recent cards, navigation
 * shortcuts. The action buttons on order cards (Принять / Отклонить /
 * Завершить) wait for the full /cabinet/orders port. Until then, masters
 * either tap the card to land in the master-pwa app, or use bottom-nav to
 * switch between cabinet sections.
 *
 * The data model mirrors GET /api/master-pwa/home so future extension
 * (FOMO modal, push subscription bootstrap) reuses the same payload.
 */
export function DashboardView() {
  const [data, setData] = useState<CabinetHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cabinetHome
      .fetch()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err: Error) => {
        const msg = err.message ?? "Не удалось загрузить дашборд";
        setError(msg);
        toast.error(msg);
      })
      .finally(() => setLoading(false));
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
        {error ?? "Не удалось загрузить данные"}.{" "}
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

  const greeting = pickGreeting();
  const m = data.master;

  return (
    <div className="space-y-6">
      {/* Greeting + key state */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
            {greeting}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
            {m.alias}
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            {m.specialization} · {m.city}
            {m.isTestMaster ? <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">Тестовый</span> : null}
          </p>
        </div>
        <AvailabilityBadge available={m.isAvailable} />
      </header>

      {/* FOMO banner */}
      {data.fomoBlock.isBlocked ? <FomoBanner block={data.fomoBlock} /> : null}

      {/* Stat tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Доступные заказы"
          value={data.availableOrders.length}
          tone="primary"
          href={data.availableOrders.length > 0 ? "https://sfera-master.ru/master-pwa/" : undefined}
          icon={<ZapIcon />}
        />
        <StatTile
          label="На рассмотрении"
          value={data.pendingOrders.length}
          tone="amber"
          icon={<ClockIcon />}
        />
        <StatTile
          label="В работе"
          value={data.activeOrders.length}
          tone="indigo"
          sub={`лимит ${m.orderLimit}`}
          icon={<BriefcaseIcon />}
        />
        <StatTile
          label={m.debt > 0 ? "Долг" : "Рейтинг"}
          value={m.debt > 0 ? `${formatRubles(m.debt)} ₽` : m.rating > 0 ? `★ ${m.rating.toFixed(1)}` : "—"}
          tone={m.debt > 0 ? "red" : "ok"}
          href={m.debt > 0 ? "/cabinet/balance" : undefined}
          icon={m.debt > 0 ? <AlertIcon /> : <StarIcon />}
        />
      </div>

      {/* Today activity */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-primary-soft)] to-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[var(--color-primary)] shadow-sm">
              <PulseIcon />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                Активность за 24 часа
              </p>
              <p className="text-sm font-bold text-[var(--color-text)]">
                {data.todayActivity.total > 0
                  ? `${data.todayActivity.total} заявок в ${m.city}, ${data.todayActivity.taken} взято`
                  : `Сегодня в ${m.city} новых заказов нет`}
              </p>
            </div>
          </div>
          {data.todayActivity.total > 0 ? (
            <div className="ml-auto text-right">
              <p className="text-xs text-[var(--color-muted)]">Свободные сейчас</p>
              <p className="text-2xl font-extrabold text-[var(--color-primary)]">
                {Math.max(0, data.todayActivity.total - data.todayActivity.taken)}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {/* Active orders */}
      <Section
        title="В работе"
        sub="Текущие заказы — действия пока выполняются в старом приложении."
        emptyText="В работе сейчас ничего нет."
        items={data.activeOrders}
        renderItem={(o) => <ActiveOrderCard key={o.id} order={o} />}
      />

      {/* Available orders */}
      <Section
        title="Новые заявки"
        sub="Свободные заказы, которые подходят под ваш профиль."
        emptyText={
          data.fomoBlock.isBlocked
            ? "Новые заявки сейчас заблокированы — разберитесь с предупреждением выше."
            : "Свободных заявок пока нет — мы ищем для вас новые."
        }
        items={data.availableOrders.slice(0, 3)}
        renderItem={(o) => <AvailableOrderCard key={o.id} order={o} />}
        moreHref={data.availableOrders.length > 3 ? "https://sfera-master.ru/master-pwa/" : undefined}
        moreLabel="Все заявки в старом приложении"
      />

      {/* Pending orders */}
      {data.pendingOrders.length > 0 ? (
        <Section
          title="Откликнулись — ждём диспетчера"
          sub="Заявки, по которым вы откликнулись. Диспетчер выберет одного из мастеров."
          emptyText=""
          items={data.pendingOrders.slice(0, 3)}
          renderItem={(o) => <AvailableOrderCard key={o.id} order={o} variant="pending" />}
        />
      ) : null}

      {/* Quick links */}
      <section>
        <h2 className="text-lg font-bold tracking-tight text-[var(--color-text)]">
          Быстрые переходы
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          <QuickLink
            href="/cabinet/balance"
            title="Баланс и комиссии"
            sub="История транзакций и оплата"
            tone="primary"
            icon={<WalletIcon />}
          />
          <QuickLink
            href="/cabinet/profile"
            title="Профиль и публикация"
            sub="Имя, город, специализации, биография"
            tone="indigo"
            icon={<UserIcon />}
            badge="Скоро"
          />
          <QuickLink
            href="/cabinet/portfolio"
            title="Кейсы и портфолио"
            sub="Опубликованные работы для маркетплейса"
            tone="amber"
            icon={<ImageIcon />}
            badge="Скоро"
          />
          <QuickLink
            href="/cabinet/orders"
            title="Все заказы"
            sub="Список доступных, активных и завершённых"
            tone="primary"
            icon={<ListIcon />}
            badge="Скоро"
          />
        </ul>
      </section>
    </div>
  );
}

// ── Sections / cards ─────────────────────────────────────────────────────────

function Section<T>({
  title,
  sub,
  emptyText,
  items,
  renderItem,
  moreHref,
  moreLabel,
}: {
  title: string;
  sub?: string;
  emptyText: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  moreHref?: string;
  moreLabel?: string;
}) {
  return (
    <section>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-[var(--color-text)]">{title}</h2>
          {sub ? <p className="mt-1 text-xs text-[var(--color-muted)]">{sub}</p> : null}
        </div>
        {moreHref ? (
          <a
            href={moreHref}
            className="text-xs font-semibold text-[var(--color-primary)] hover:underline"
            rel="noopener noreferrer"
          >
            {moreLabel ?? "Все →"}
          </a>
        ) : null}
      </div>
      {items.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-6 text-center text-sm text-[var(--color-muted)]">
          {emptyText}
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => renderItem(item))}
        </ul>
      )}
    </section>
  );
}

function ActiveOrderCard({ order }: { order: ActiveOrderHomeCard }) {
  return (
    <li className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--color-text)]">
            {order.serviceType}{" "}
            <span className="text-[var(--color-muted)]">№{order.id}</span>
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {order.city}
            {order.district ? `, ${order.district}` : ""}
            {Number.isFinite(order.area) && order.area > 0 ? ` · ${order.area} м²` : ""}
          </p>
          {order.scheduledAt ? (
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              На {formatDateTime(order.scheduledAt)}
            </p>
          ) : null}
        </div>
        <StatusPill status={order.status} workStatus={order.masterWorkStatus} />
      </div>
      {order.proposedAmount != null && order.proposedAmount > 0 ? (
        <p className="mt-3 text-sm">
          <span className="text-[var(--color-muted)]">Сумма работ:</span>{" "}
          <span className="font-bold text-[var(--color-text)]">{formatRubles(order.proposedAmount)} ₽</span>
        </p>
      ) : null}
    </li>
  );
}

function AvailableOrderCard({
  order,
  variant = "available",
}: {
  order: OrderHomeCard;
  variant?: "available" | "pending";
}) {
  const tone = variant === "pending" ? "indigo" : "primary";
  return (
    <li
      className={`rounded-2xl border bg-white p-4 shadow-sm transition sm:p-5 ${
        tone === "indigo" ? "border-[var(--color-secondary-soft)]" : "border-[var(--color-border)] hover:border-[var(--color-primary)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--color-text)]">
            {order.serviceType}{" "}
            <span className="text-[var(--color-muted)]">№{order.id}</span>
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {order.city}
            {order.district ? `, ${order.district}` : ""}
            {Number.isFinite(order.area) && order.area > 0 ? ` · ${order.area} м²` : ""}
          </p>
          {order.scheduledAt ? (
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              На {formatDateTime(order.scheduledAt)}
            </p>
          ) : null}
        </div>
        {order.isRepeatClient ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-primary)]">
            ↻ Постоянный клиент
          </span>
        ) : null}
      </div>
      {order.comment ? (
        <p className="mt-3 line-clamp-2 text-sm text-[var(--color-text)]">{order.comment}</p>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-muted)]">
          {order.competitorCount > 0 ? (
            <span>+{order.competitorCount} мастеров</span>
          ) : (
            <span>Вы первый</span>
          )}
          {order.dispatchedAt ? <span>· {timeAgo(order.dispatchedAt)}</span> : null}
        </div>
        <a
          href="https://sfera-master.ru/master-pwa/"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-[var(--color-primary)] hover:underline"
        >
          {variant === "pending" ? "Открыть отклик →" : "Откликнуться →"}
        </a>
      </div>
    </li>
  );
}

function StatusPill({ status, workStatus }: { status: string; workStatus: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    master_assigned: { label: "Назначен", cls: "bg-blue-50 text-blue-700" },
    in_progress: { label: workStatus ?? "В процессе", cls: "bg-emerald-50 text-emerald-700" },
    cancellation_requested: { label: "Отмена", cls: "bg-amber-50 text-amber-700" },
    waiting_master: { label: "Ожидает", cls: "bg-[var(--color-background)] text-[var(--color-muted)]" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-[var(--color-background)] text-[var(--color-muted)]" };
  return (
    <span className={`inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ── Building blocks ─────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  tone,
  sub,
  href,
  icon,
}: {
  label: string;
  value: number | string;
  tone: "primary" | "amber" | "indigo" | "ok" | "red";
  sub?: string;
  href?: string;
  icon: React.ReactNode;
}) {
  const TONE = {
    primary: "bg-[var(--color-primary-soft)] text-[var(--color-primary)]",
    amber: "bg-amber-50 text-amber-700",
    indigo: "bg-[var(--color-secondary-soft)] text-[var(--color-secondary)]",
    ok: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
  } as const;
  const VALUE_TONE = {
    primary: "text-[var(--color-text)]",
    amber: "text-amber-700",
    indigo: "text-[var(--color-secondary)]",
    ok: "text-emerald-700",
    red: "text-red-700",
  } as const;

  const inner = (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <span className={`inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${TONE[tone]}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          {label}
        </p>
        <p className={`mt-0.5 text-2xl font-extrabold tracking-tight ${VALUE_TONE[tone]}`}>{value}</p>
        {sub ? <p className="text-[11px] text-[var(--color-muted)]">{sub}</p> : null}
      </div>
    </div>
  );

  if (href) {
    if (href.startsWith("/")) {
      return (
        <Link href={href} className="block">
          {inner}
        </Link>
      );
    }
    return (
      <a href={href} rel="noopener noreferrer" className="block">
        {inner}
      </a>
    );
  }
  return inner;
}

function QuickLink({
  href,
  title,
  sub,
  tone,
  icon,
  badge,
}: {
  href: string;
  title: string;
  sub: string;
  tone: "primary" | "amber" | "indigo";
  icon: React.ReactNode;
  badge?: string;
}) {
  const TONE = {
    primary: "bg-[var(--color-primary-soft)] text-[var(--color-primary)]",
    amber: "bg-amber-50 text-amber-700",
    indigo: "bg-[var(--color-secondary-soft)] text-[var(--color-secondary)]",
  } as const;

  return (
    <li>
      <Link
        href={href}
        className="group flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      >
        <span className={`inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${TONE[tone]}`}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-base font-bold text-[var(--color-text)]">
            {title}
            {badge ? (
              <span className="inline-flex items-center rounded-full bg-[var(--color-background)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
                {badge}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">{sub}</p>
        </div>
        <span aria-hidden className="text-[var(--color-muted)] transition group-hover:translate-x-1">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </span>
      </Link>
    </li>
  );
}

function AvailabilityBadge({ available }: { available: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-xs font-semibold sm:self-auto ${
        available
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : "bg-[var(--color-background)] text-[var(--color-muted)] ring-1 ring-[var(--color-border)]"
      }`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${available ? "bg-emerald-500" : "bg-[var(--color-muted)]/50"}`}
      />
      {available ? "На связи" : "Не принимаю заказы"}
    </span>
  );
}

function FomoBanner({ block }: { block: { type: string | null; reason: string | null; orderId: number | null } }) {
  const titles: Record<string, string> = {
    no_estimate: "Нужна смета по одному из заказов",
    no_payment: "Ожидается предоплата по заказу",
    limit_reached: "Достигнут лимит активных заказов",
    debt: "Есть задолженность",
  };
  const title = block.type ? titles[block.type] ?? "Доступ к новым заявкам ограничен" : "Доступ к новым заявкам ограничен";
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
      <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white text-amber-700 shadow-sm">
        <AlertIcon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-amber-900">{title}</p>
        {block.reason ? <p className="mt-1 text-xs text-amber-800">{block.reason}</p> : null}
        <a
          href="https://sfera-master.ru/master-pwa/"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-900 hover:underline"
        >
          Открыть в старом приложении →
        </a>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function pickGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "Доброе утро";
  if (hour >= 11 && hour < 17) return "Добрый день";
  if (hour >= 17 && hour < 23) return "Добрый вечер";
  return "Доброй ночи";
}

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

function timeAgo(iso: string): string {
  try {
    const d = new Date(iso).getTime();
    const diff = Math.max(0, Date.now() - d);
    const min = Math.round(diff / 60_000);
    if (min < 1) return "только что";
    if (min < 60) return `${min} мин назад`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} ч назад`;
    const day = Math.round(h / 24);
    return `${day} дн назад`;
  } catch {
    return "";
  }
}

// ── Inline icons ────────────────────────────────────────────────────────────

function ZapIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </svg>
  );
}
