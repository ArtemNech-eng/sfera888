"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cabinetCheckin, type CheckinToday } from "../_lib/cabinetClient";

/**
 * Daily checkin view. Three logical states:
 *   • `pending`     — нет записи или respondedAt = null
 *   • `ready`       — isAvailable === true, respondedAt set
 *   • `not_ready`   — isAvailable === false, respondedAt set
 *
 * Re-submitting overrides the existing value — server uses ON CONFLICT to
 * upsert per (masterId, date), so the master can change their mind any time
 * before midnight.
 */
export function CheckinView() {
  const [today, setToday] = useState<CheckinToday | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await cabinetCheckin.today();
      setToday(res ?? null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Не удалось загрузить статус";
      toast.error(msg);
      setToday(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(isAvailable: boolean) {
    setBusy(true);
    try {
      await cabinetCheckin.submit(isAvailable);
      toast.success(isAvailable ? "Хорошего дня! Принимаем заявки на вас." : "Записали — отдыхайте.");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  const status = computeStatus(today);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
          Готовность на сегодня
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
          {greeting()}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {formatToday()}. Скажите диспетчеру, готовы ли брать заявки сегодня.
        </p>
      </header>

      {today === undefined ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <span className="inline-block h-9 w-9 animate-spin rounded-full border-4 border-[var(--color-primary-soft)] border-t-[var(--color-primary)]" />
        </div>
      ) : (
        <>
          <StatusCard status={status} respondedAt={today?.respondedAt ?? null} />

          <div className="grid gap-3 sm:grid-cols-2">
            <ActionButton
              tone="ok"
              icon={<CheckIcon />}
              title="Готов работать"
              subtitle="Беру заявки в обычном режиме."
              busy={busy}
              active={status === "ready"}
              onClick={() => submit(true)}
            />
            <ActionButton
              tone="muted"
              icon={<MoonIcon />}
              title="Не сегодня"
              subtitle="Не присылайте новые заявки. Приходите позже."
              busy={busy}
              active={status === "not_ready"}
              onClick={() => submit(false)}
            />
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5 text-sm text-[var(--color-muted)]">
            <p className="font-semibold text-[var(--color-text)]">Можно поменять решение</p>
            <p className="mt-1">
              Статус действует до полуночи. Если планы изменились — нажмите другую кнопку, мы
              перезапишем ответ.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

type Status = "pending" | "ready" | "not_ready";

function StatusCard({ status, respondedAt }: { status: Status; respondedAt: string | null }) {
  if (status === "ready") {
    return (
      <div className="flex items-start gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
        <span className="mt-0.5 inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
          <CheckIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-emerald-900">Готов сегодня</p>
          <p className="mt-1 text-sm text-emerald-800">
            Диспетчер подбирает вам заявки. Ответ зафиксирован
            {respondedAt ? ` ${formatTime(respondedAt)}.` : "."}
          </p>
        </div>
      </div>
    );
  }
  if (status === "not_ready") {
    return (
      <div className="flex items-start gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5 sm:p-6">
        <span className="mt-0.5 inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-muted)] text-white">
          <MoonIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-[var(--color-text)]">Не работаете сегодня</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Заявки сегодня не приходят. Хорошего отдыха
            {respondedAt ? `; ответ записан в ${formatTime(respondedAt)}.` : "."}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
      <span className="mt-0.5 inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
        <BellIcon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-amber-900">Нужен ваш ответ</p>
        <p className="mt-1 text-sm text-amber-800">
          Диспетчер ждёт — пока статус не подтверждён, мы держим заявки в очереди и не назначаем их вам.
        </p>
      </div>
    </div>
  );
}

function ActionButton({
  tone,
  icon,
  title,
  subtitle,
  busy,
  active,
  onClick,
}: {
  tone: "ok" | "muted";
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  busy: boolean;
  active: boolean;
  onClick: () => void;
}) {
  const base =
    "flex items-start gap-3 rounded-2xl border p-5 text-left shadow-sm transition disabled:opacity-50";
  const cls =
    tone === "ok"
      ? active
        ? "border-emerald-300 bg-emerald-50"
        : "border-[var(--color-border)] bg-white hover:border-emerald-300 hover:bg-emerald-50/50"
      : active
        ? "border-[var(--color-border)] bg-[var(--color-background)]"
        : "border-[var(--color-border)] bg-white hover:bg-[var(--color-background)]";
  const iconCls =
    tone === "ok"
      ? "bg-emerald-500 text-white"
      : "bg-[var(--color-muted)] text-white";
  return (
    <button type="button" onClick={onClick} disabled={busy || active} className={`${base} ${cls}`}>
      <span className={`mt-0.5 inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${iconCls}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-[var(--color-text)]">
          {title}
          {active ? <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">— текущий выбор</span> : null}
        </p>
        <p className="mt-0.5 text-sm text-[var(--color-muted)]">{subtitle}</p>
      </div>
    </button>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function computeStatus(t: CheckinToday | null | undefined): Status {
  if (!t || t.respondedAt == null) return "pending";
  if (t.isAvailable === true) return "ready";
  if (t.isAvailable === false) return "not_ready";
  return "pending";
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "Хорошей ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

function formatToday(): string {
  return new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
