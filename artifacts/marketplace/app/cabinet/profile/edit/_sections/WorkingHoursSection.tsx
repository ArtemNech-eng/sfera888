"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ProfileData, WorkingHours } from "../../../_lib/cabinetClient";
import type { SectionPatchFn } from "../ProfileEditor";
import { SectionCard } from "./_SectionCard";
import { SaveButton } from "./IdentitySection";

interface Props {
  data: ProfileData;
  onPatch: SectionPatchFn;
}

const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 0]; // 0 = Sun (matches JS Date.getDay)

const DEFAULT: WorkingHours = { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] };

/**
 * Working hours section — start / end time + selected days. Stored as a JSON
 * blob on the master record. Used by the dispatcher to filter who's online
 * when a new lead lands.
 */
export function WorkingHoursSection({ data, onPatch }: Props) {
  const initial = data.workingHours ?? DEFAULT;
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [days, setDays] = useState<number[]>(initial.days ?? []);
  const [busy, setBusy] = useState(false);

  const dirty =
    start !== initial.start
    || end !== initial.end
    || JSON.stringify([...days].sort()) !== JSON.stringify([...(initial.days ?? [])].sort());

  function toggleDay(d: number) {
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b),
    );
  }

  async function handleSave() {
    if (days.length === 0) {
      toast.error("Выберите хотя бы один рабочий день");
      return;
    }
    if (start >= end) {
      toast.error("Время начала должно быть раньше времени окончания");
      return;
    }
    const next: WorkingHours = { start, end, days };
    setBusy(true);
    try {
      await onPatch({ workingHours: next }, { workingHours: next });
      toast.success("Сохранено");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка сохранения";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title="Рабочее время"
      description="Когда и в какие дни диспетчер может назначать вам новые заявки."
      action={<SaveButton onClick={handleSave} disabled={!dirty} busy={busy} />}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Начало">
          <input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
          />
        </Field>
        <Field label="Окончание">
          <input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
          />
        </Field>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold text-[var(--color-text)]">Рабочие дни</p>
        <div className="flex flex-wrap gap-2">
          {DAY_VALUES.map((d, i) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(d)}
              className={`inline-flex h-10 w-12 items-center justify-center rounded-xl text-sm font-semibold transition ${
                days.includes(d)
                  ? "bg-[var(--color-primary)] text-white shadow-sm"
                  : "border border-[var(--color-border)] bg-white text-[var(--color-text)] hover:border-[var(--color-primary)]"
              }`}
            >
              {DAY_LABELS[i]}
            </button>
          ))}
        </div>
      </div>
    </SectionCard>
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
