"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ProfileData } from "../../../_lib/cabinetClient";
import type { SectionPatchFn } from "../ProfileEditor";
import { SectionCard } from "./_SectionCard";
import { SaveButton } from "./IdentitySection";

interface Props {
  data: ProfileData;
  onPatch: SectionPatchFn;
}

/**
 * Order filters — preferred districts (chips) + minimum job area.
 *
 * Districts are free-form for now (master types comma-separated). When
 * cities get a structured district registry we'll switch to a multiselect
 * dropdown.
 */
export function OrderFiltersSection({ data, onPatch }: Props) {
  const [districtsText, setDistrictsText] = useState(
    (data.preferredDistricts ?? []).join(", "),
  );
  const [minArea, setMinArea] = useState(
    data.minArea != null ? String(data.minArea) : "0",
  );
  const [busy, setBusy] = useState(false);

  const districts = districtsText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const dirty =
    JSON.stringify(districts) !== JSON.stringify(data.preferredDistricts ?? [])
    || (parseInt(minArea, 10) || 0) !== (data.minArea ?? 0);

  async function handleSave() {
    const minAreaNum = Math.max(0, parseInt(minArea, 10) || 0);
    setBusy(true);
    try {
      await onPatch(
        { preferredDistricts: districts, minArea: minAreaNum },
        { preferredDistricts: districts, minArea: minAreaNum },
      );
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
      title="Фильтры заявок"
      description="Где работаете и какой минимальный объём вам интересен."
      action={<SaveButton onClick={handleSave} disabled={!dirty} busy={busy} />}
    >
      <Field
        label="Районы / станции метро"
        hint="Через запятую. Пусто — принимаем заявки из любых районов вашего города."
      >
        <input
          value={districtsText}
          onChange={(e) => setDistrictsText(e.target.value.slice(0, 500))}
          placeholder="Центр, Юго-Запад, м. Тёплый стан"
          className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
        />
        {districts.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {districts.map((d, i) => (
              <span
                key={`${d}-${i}`}
                className="inline-flex items-center rounded-full bg-[var(--color-primary-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-primary)]"
              >
                {d}
              </span>
            ))}
          </div>
        ) : null}
      </Field>
      <Field
        label="Минимальная площадь, м²"
        hint="Заявки меньше этого порога не показываются. 0 — без ограничений."
      >
        <input
          type="text"
          inputMode="numeric"
          value={minArea}
          onChange={(e) => setMinArea(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
          placeholder="0"
          className="h-11 w-32 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
        />
      </Field>
    </SectionCard>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-[var(--color-text)]">{label}</label>
      {children}
      {hint ? <p className="text-[11px] text-[var(--color-muted)]">{hint}</p> : null}
    </div>
  );
}
