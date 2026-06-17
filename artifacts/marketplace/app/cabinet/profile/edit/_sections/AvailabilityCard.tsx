"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cabinetProfile, cabinetHome } from "../../../_lib/cabinetClient";

interface Props {
  masterId: number;
}

/**
 * Availability toggle card.
 *
 * `PATCH /availability` doesn't return the new state directly in `/profile`,
 * so we fetch the current `isAvailable` flag from `/home` (which derives it
 * from the master's voronka column). Toggling sends a single PATCH and
 * mirrors master-pwa's "Принимаю заказы" switch.
 */
export function AvailabilityCard({ masterId: _masterId }: Props) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    cabinetHome
      .fetch()
      .then((home) => {
        if (cancelled) return;
        setAvailable(home.master.isAvailable);
      })
      .catch(() => {
        // Silent — the toggle still works, we just lose the initial state.
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle() {
    if (available === null) return;
    const next = !available;
    setBusy(true);
    setAvailable(next); // optimistic
    try {
      const res = await cabinetProfile.setAvailability(next);
      setAvailable(res.isAvailable);
      toast.success(res.isAvailable ? "Принимаете заказы" : "Заявки приостановлены");
    } catch (err) {
      setAvailable(!next); // rollback
      const msg = err instanceof Error ? err.message : "Не удалось переключить";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  const showSpinner = available === null;

  return (
    <div className="flex items-center justify-between rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
      <div className="flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Доступность
        </p>
        <p className="mt-1 text-base font-semibold text-[var(--color-text)]">
          {showSpinner
            ? "Загружаем…"
            : available
              ? "Сейчас принимаю заказы"
              : "Заявки приостановлены"}
        </p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Когда выключено — мастер не получает новых заявок и пропадает из подбора.
        </p>
      </div>
      <button
        type="button"
        onClick={handleToggle}
        disabled={busy || showSpinner}
        role="switch"
        aria-checked={available ?? false}
        className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition disabled:opacity-50 ${
          available ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
            available ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
