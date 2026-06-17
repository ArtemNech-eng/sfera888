"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  cabinetBalance,
  uploadPhoto,
  type BalanceData,
  type BalanceTransaction,
} from "../_lib/cabinetClient";

const BANK_NUMBER = "89892860863";
const BANK_NAME = "Альфа Банк · Игорь К.";

const STATUS_LABELS: Record<string, { label: string; tone: "ok" | "pending" | "debt" | "muted" }> = {
  paid: { label: "Оплачено", tone: "ok" },
  pending: { label: "Ожидает", tone: "pending" },
  debt: { label: "Долг", tone: "debt" },
  cancelled: { label: "Отменён", tone: "muted" },
};

function fmt(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

// ── Page ────────────────────────────────────────────────────────────────────

export function BalanceView() {
  const [data, setData] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cabinetBalance
      .fetch()
      .then(setData)
      .catch((err: Error) => toast.error(err.message ?? "Ошибка загрузки баланса"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="inline-block h-9 w-9 animate-spin rounded-full border-4 border-[var(--color-primary-soft)] border-t-[var(--color-primary)]" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-8 text-center text-sm text-[var(--color-muted)]">
        Не удалось загрузить баланс. Обновите страницу или зайдите позже.
      </div>
    );
  }

  const netIncome = data.totalEarned - data.totalPaidCommission;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text)]">Баланс</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Заработок, комиссия и оплата по выполненным заказам.
        </p>
      </header>

      {/* Debt banner — primary attention spot when masters owe commission */}
      {data.debt > 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 sm:p-6">
          <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white text-red-600 shadow-sm">
            <AlertIcon />
          </span>
          <div>
            <p className="text-sm font-semibold text-red-700">Задолженность</p>
            <p className="mt-1 text-3xl font-extrabold text-red-700">{fmt(data.debt)} ₽</p>
            <p className="mt-1 text-xs text-red-600">
              Погасите до следующего заказа. После оплаты пришлите скриншот менеджеру для подтверждения.
            </p>
          </div>
        </div>
      ) : null}

      {/* Numeric stats grid */}
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label="Заработано (по оплаченным)"
          value={`${fmt(data.totalEarned)} ₽`}
          icon={<TrendIcon />}
          tint="muted"
        />
        <StatCard
          label="Чистый доход"
          value={`${fmt(netIncome)} ₽`}
          icon={<WalletIcon />}
          tint="ok"
        />
        <StatCard
          label="Комиссия оплачена"
          value={`${fmt(data.totalPaidCommission)} ₽`}
          icon={<WalletIcon />}
          tint="muted"
        />
        {data.pendingCommission > 0 ? (
          <StatCard
            label="Ожидает оплаты"
            value={`${fmt(data.pendingCommission)} ₽`}
            icon={<ClockIcon />}
            tint="pending"
            sub={`с ${fmt(data.pendingEarnings)} ₽ заработка`}
          />
        ) : null}
      </div>

      {/* Payment section */}
      <PaymentSection initiallyOpen={data.debt > 0} />

      {/* Transactions */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight text-[var(--color-text)]">
            История транзакций
          </h2>
          <span className="text-xs text-[var(--color-muted)]">
            {data.transactions.length} {pluralTx(data.transactions.length)}
          </span>
        </div>
        {data.transactions.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-8 text-center text-sm text-[var(--color-muted)]">
            Транзакций пока нет — они появятся после первого оплаченного заказа.
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {data.transactions.map((tx) => (
              <TransactionCard key={tx.id} tx={tx} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  tint,
  sub,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tint: "muted" | "ok" | "pending";
  sub?: string;
}) {
  const valueClass =
    tint === "ok"
      ? "text-emerald-600"
      : tint === "pending"
        ? "text-amber-700"
        : "text-[var(--color-text)]";
  const iconClass =
    tint === "ok"
      ? "bg-emerald-50 text-emerald-600"
      : tint === "pending"
        ? "bg-amber-50 text-amber-700"
        : "bg-[var(--color-primary-soft)] text-[var(--color-primary)]";

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
      <span className={`inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          {label}
        </p>
        <p className={`mt-0.5 text-2xl font-extrabold tracking-tight ${valueClass}`}>{value}</p>
        {sub ? <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">{sub}</p> : null}
      </div>
    </div>
  );
}

// ── Payment section ─────────────────────────────────────────────────────────

function PaymentSection({ initiallyOpen }: { initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(BANK_NUMBER);
      toast.success("Номер скопирован в буфер обмена");
    } catch {
      toast.error("Не удалось скопировать");
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const photoUrl = await uploadPhoto(file);
      await cabinetBalance.paymentProof(photoUrl);
      toast.success("Скриншот отправлен менеджеру — он подтвердит платёж");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ошибка отправки";
      toast.error(message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-[var(--color-background)] sm:px-6"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <CardIcon />
          </span>
          <span>
            <span className="block text-base font-bold text-[var(--color-text)]">
              Оплата комиссии
            </span>
            <span className="block text-xs text-[var(--color-muted)]">
              Реквизиты переводов и подтверждение скриншотом
            </span>
          </span>
        </span>
        <span
          aria-hidden
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-background)] text-[var(--color-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {open ? (
        <div className="space-y-5 border-t border-[var(--color-border)] px-5 py-5 sm:px-6 sm:py-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Реквизиты для перевода
            </p>
            <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-[var(--color-background)] p-4">
              <div>
                <p className="text-xs text-[var(--color-muted)]">{BANK_NAME}</p>
                <p className="mt-0.5 font-mono text-base font-bold tracking-wide text-[var(--color-text)]">
                  {BANK_NUMBER}
                </p>
              </div>
              <button
                type="button"
                onClick={copyNumber}
                className="inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-primary)]/10 px-3 text-xs font-semibold text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/15"
              >
                <CopyIcon />
                Копировать
              </button>
            </div>
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              После оплаты отправьте скриншот менеджеру — он подтвердит платёж.
            </p>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Подтверждение оплаты
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-primary)]/40 bg-[var(--color-primary-soft)] text-sm font-semibold text-[var(--color-primary)] transition hover:bg-[var(--color-primary-soft)]/80 disabled:opacity-50"
            >
              {uploading ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-primary)]/30 border-t-[var(--color-primary)]" />
              ) : (
                <CameraIcon />
              )}
              {uploading ? "Отправляем…" : "Отправить скриншот оплаты"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ── Transaction card ────────────────────────────────────────────────────────

function TransactionCard({ tx }: { tx: BalanceTransaction }) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_LABELS[tx.paymentStatus] ?? { label: tx.paymentStatus, tone: "muted" as const };
  const partials = tx.partialPayments ?? [];
  const paidFraction =
    tx.commission > 0
      ? Math.min(1, ((tx.prepaymentDeducted ?? 0) + (tx.totalPartialPaid ?? 0)) / tx.commission)
      : 0;

  const dateLabel = new Date(tx.createdAt).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <li className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm font-semibold text-[var(--color-text)]">
            {tx.orderServiceType ?? "Заказ"} <span className="text-[var(--color-muted)]">№{tx.orderId}</span>
          </p>
          {tx.orderCity ? (
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">{tx.orderCity}</p>
          ) : null}
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">{dateLabel}</p>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1 text-right">
          <p className="text-base font-bold text-[var(--color-text)]">{fmt(tx.orderAmount)} ₽</p>
          <p className="text-xs text-[var(--color-muted)]">Комиссия: {fmt(tx.commission)} ₽</p>
          {tx.netPayable !== undefined && tx.paymentStatus !== "paid" && tx.netPayable < tx.commission ? (
            <p className="text-xs font-semibold text-blue-600">Остаток: {fmt(tx.netPayable)} ₽</p>
          ) : null}
          <StatusPill status={status} />
        </div>
      </div>

      {paidFraction > 0 && paidFraction < 1 ? (
        <div className="mt-3 space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-background)]">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${paidFraction * 100}%` }}
            />
          </div>
          <p className="text-[10px] text-[var(--color-muted)]">
            Оплачено {Math.round(paidFraction * 100)}%
          </p>
        </div>
      ) : null}

      {partials.length > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex w-full items-center justify-between gap-2 text-xs font-semibold text-blue-600 transition hover:text-blue-700"
          aria-expanded={expanded}
        >
          <span>Частичные платежи ({partials.length})</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      ) : null}

      {expanded && partials.length > 0 ? (
        <ul className="mt-2 space-y-1.5 border-t border-[var(--color-border)] pt-2">
          {partials.map((p, i) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[var(--color-muted)]">
                №{i + 1} ·{" "}
                {new Date(p.paidAt).toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {p.note ? ` · ${p.note}` : ""}
              </span>
              <span className="font-semibold text-blue-700">{fmt(p.amount)} ₽</span>
            </li>
          ))}
          <li className="flex justify-between border-t border-[var(--color-border)]/50 pt-1.5 text-xs">
            <span className="text-[var(--color-muted)]">Итого частями</span>
            <span className="font-bold text-[var(--color-text)]">{fmt(tx.totalPartialPaid)} ₽</span>
          </li>
        </ul>
      ) : null}
    </li>
  );
}

function StatusPill({ status }: { status: { label: string; tone: "ok" | "pending" | "debt" | "muted" } }) {
  const cls =
    status.tone === "ok"
      ? "bg-emerald-50 text-emerald-700"
      : status.tone === "pending"
        ? "bg-amber-50 text-amber-700"
        : status.tone === "debt"
          ? "bg-red-50 text-red-700"
          : "bg-[var(--color-background)] text-[var(--color-muted)]";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {status.tone === "ok" ? <CheckCircleIcon /> : <ClockIcon size={11} />}
      {status.label}
    </span>
  );
}

// ── Pluralisation ───────────────────────────────────────────────────────────

function pluralTx(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "транзакций";
  if (mod10 === 1) return "транзакция";
  if (mod10 >= 2 && mod10 <= 4) return "транзакции";
  return "транзакций";
}

// ── Inline icons ────────────────────────────────────────────────────────────

function AlertIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

function ClockIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="6" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21.8 10A10 10 0 1 1 12 2" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
