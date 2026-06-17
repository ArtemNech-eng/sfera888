"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ProfileData, ServicePrice } from "../../../_lib/cabinetClient";
import type { SectionPatchFn } from "../ProfileEditor";
import { SectionCard } from "./_SectionCard";
import { SaveButton } from "./IdentitySection";

interface Props {
  data: ProfileData;
  onPatch: SectionPatchFn;
}

interface Row {
  service: string;
  priceFrom: string;
}

/**
 * Service prices — dynamic list of (service name, "from" price) pairs.
 *
 * Stored on the master record as `servicePrices: { service, priceFrom }[]`.
 * Displayed on the public master card under the bio. Server filters out
 * empty / zero-price rows on save, but we already strip those client-side
 * to keep the UI honest.
 */
export function ServicePricesSection({ data, onPatch }: Props) {
  const initialRows: Row[] = (data.servicePrices ?? []).map((p) => ({
    service: p.service,
    priceFrom: String(p.priceFrom),
  }));
  const [rows, setRows] = useState<Row[]>(
    initialRows.length > 0 ? initialRows : [{ service: "", priceFrom: "" }],
  );
  const [busy, setBusy] = useState(false);

  const cleanRows: ServicePrice[] = rows
    .map((r) => ({
      service: r.service.trim(),
      priceFrom: parseInt(r.priceFrom.replace(/[^\d]/g, ""), 10) || 0,
    }))
    .filter((r) => r.service.length > 0 && r.priceFrom > 0);

  const dirty = JSON.stringify(cleanRows) !== JSON.stringify(data.servicePrices ?? []);

  function setRow(idx: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { service: "", priceFrom: "" }]);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setBusy(true);
    try {
      await onPatch(
        { servicePrices: cleanRows },
        { servicePrices: cleanRows },
      );
      toast.success(cleanRows.length === 0 ? "Прайс очищен" : "Прайс сохранён");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка сохранения";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title="Прайс-лист"
      description="Список услуг с ценой «от ₽». Видно на публичной странице и помогает закрывать сделки."
      action={<SaveButton onClick={handleSave} disabled={!dirty} busy={busy} />}
    >
      <div className="space-y-2">
        {rows.map((row, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              value={row.service}
              onChange={(e) => setRow(idx, { service: e.target.value.slice(0, 120) })}
              placeholder="Например: «Поклейка обоев»"
              className="h-10 flex-1 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
            />
            <div className="relative w-32">
              <input
                type="text"
                inputMode="numeric"
                value={row.priceFrom}
                onChange={(e) =>
                  setRow(idx, { priceFrom: e.target.value.replace(/[^\d]/g, "").slice(0, 8) })
                }
                placeholder="от 250"
                className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-white pl-3 pr-7 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-muted)]">
                ₽
              </span>
            </div>
            <button
              type="button"
              onClick={() => removeRow(idx)}
              aria-label="Удалить строку"
              className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white text-[var(--color-muted)] transition hover:border-red-200 hover:text-red-600"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addRow}
        className="inline-flex items-center gap-2 rounded-xl border border-dashed border-[var(--color-primary)] bg-white px-3 py-2 text-sm font-semibold text-[var(--color-primary)] transition hover:bg-[var(--color-primary-soft)]/30"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </svg>
        Добавить услугу
      </button>
    </SectionCard>
  );
}
