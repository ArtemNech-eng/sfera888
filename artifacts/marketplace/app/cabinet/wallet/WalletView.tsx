"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  cabinetWallet,
  type WalletBalance,
  type ServiceFeeRow,
  type TopupRequestRow,
} from "../_lib/cabinetClient";

/**
 * Master wallet view.
 *
 * Three sources, fetched in parallel: balance summary, recent service-fee
 * transactions, recent topup requests. Topup form posts a pending request
 * — admin approves it from CRM, then balance updates next time the master
 * reloads the page.
 */
export function WalletView() {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [fees, setFees] = useState<ServiceFeeRow[]>([]);
  const [topups, setTopups] = useState<TopupRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupNote, setTopupNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const [b, f, t] = await Promise.all([
        cabinetWallet.fetch().catch(() => null),
        cabinetWallet.serviceFees().catch(() => [] as ServiceFeeRow[]),
        cabinetWallet.topupRequests().catch(() => [] as TopupRequestRow[]),
      ]);
      setBalance(b);
      setFees(f);
      setTopups(t);
      if (!b) setError("Не удалось загрузить баланс");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Не удалось загрузить кошелёк";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleSubmit() {
    const n = parseInt(topupAmount.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Укажите сумму пополнения");
      return;
    }
    setSubmitting(true);
    try {
      await cabinetWallet.topupRequest(n, topupNote.trim() || undefined);
      toast.success("Заявка отправлена. Администратор подтвердит её, и баланс обновится.");
      setTopupAmount("");
      setTopupNote("");
      const t = await cabinetWallet.topupRequests().catch(() => topups);
      setTopups(t);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Не удалось отправить заявку";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="inline-block h-9 w-9 animate-spin rounded-full border-4 border-[var(--color-primary-soft)] border-t-[var(--color-primary)]" />
      </div>
    );
  }

  if (error || !balance) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-8 text-center text-sm text-[var(--color-muted)]">
        {error ?? "Кошелёк недоступен"}.{" "}
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

  const negative = balance.balance < 0;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
          Кошелёк
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
          Ваш счёт
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Внутренний баланс для платных функций (например, повторное распределение заявок).
          Не путать с задолженностью по комиссиям — она в разделе{" "}
          <a href="/cabinet/balance" className="font-semibold text-[var(--color-primary)] hover:underline">
            «Баланс»
          </a>
          .
        </p>
      </header>

      {/* Big balance card */}
      <section
        className={`overflow-hidden rounded-2xl border p-6 shadow-sm ${
          negative
            ? "border-red-200 bg-gradient-to-br from-red-50 to-white"
            : "border-[var(--color-primary-soft)] bg-gradient-to-br from-[var(--color-primary-soft)] to-white"
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Доступно к трате
        </p>
        <p className={`mt-1 text-4xl font-bold ${negative ? "text-red-700" : "text-[var(--color-text)]"} sm:text-5xl`}>
          {formatRubles(balance.available)} ₽
        </p>
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          На счёте: {formatRubles(balance.balance)} ₽ · Кредитный лимит: {formatRubles(balance.creditLimit)} ₽
        </p>
      </section>

      {/* Summary tiles */}
      <div className="grid gap-3 sm:grid-cols-2">
        <SmallTile label="Всего пополнено" value={formatRubles(balance.totalTopups)} suffix="₽" />
        <SmallTile label="Всего потрачено" value={formatRubles(balance.totalServiceFeesSpent)} suffix="₽" />
      </div>

      {/* Topup form */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-bold text-[var(--color-text)]">Запрос на пополнение</h2>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          Заявка отправляется администратору. После подтверждения сумма зачисляется на счёт.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[180px,1fr,auto] sm:items-end">
          <Field label="Сумма, ₽">
            <input
              type="text"
              inputMode="numeric"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 8))}
              placeholder="1000"
              className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
            />
          </Field>
          <Field label="Комментарий (опционально)">
            <input
              type="text"
              value={topupNote}
              onChange={(e) => setTopupNote(e.target.value.slice(0, 200))}
              placeholder="Например: «Перевёл на карту 1234»"
              className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
            />
          </Field>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-primary-strong)] disabled:opacity-50"
          >
            {submitting ? <Spinner /> : null}
            Отправить
          </button>
        </div>
      </section>

      {/* Topup history */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          История пополнений
        </h2>
        {topups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-6 text-center text-sm text-[var(--color-muted)]">
            Заявок ещё не было.
          </div>
        ) : (
          <ul className="space-y-2">
            {topups.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[var(--color-text)]">
                    {formatRubles(r.amount)} ₽
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {formatDate(r.createdAt)}
                    {r.approvedAt ? ` · подтверждено ${formatDate(r.approvedAt)}` : ""}
                  </p>
                  {r.note ? (
                    <p className="mt-1 text-xs italic text-[var(--color-muted)]">
                      «{r.note}»
                    </p>
                  ) : null}
                </div>
                <TopupStatusPill status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Service fees */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Списания за сервисы
        </h2>
        {fees.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-6 text-center text-sm text-[var(--color-muted)]">
            Списаний ещё не было.
          </div>
        ) : (
          <ul className="space-y-2">
            {fees.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[var(--color-text)]">
                    -{formatRubles(f.amount)} ₽
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {f.reason ?? f.type}
                    {f.orderId ? ` · заказ №${f.orderId}` : ""}
                  </p>
                  <p className="text-[11px] text-[var(--color-muted)]">{formatDate(f.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SmallTile({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-[var(--color-text)]">
        {value}
        {suffix ? <span className="ml-1 text-sm text-[var(--color-muted)]">{suffix}</span> : null}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-[var(--color-text)]">{label}</label>
      {children}
    </div>
  );
}

function TopupStatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Ожидает", cls: "bg-amber-100 text-amber-700" },
    approved: { label: "Подтверждена", cls: "bg-emerald-100 text-emerald-700" },
    rejected: { label: "Отклонена", cls: "bg-red-100 text-red-700" },
  };
  const m = map[status] ?? { label: status, cls: "bg-[var(--color-background)] text-[var(--color-muted)]" };
  return (
    <span className={`inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${m.cls}`}>
      {m.label}
    </span>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />
  );
}

function formatRubles(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}
