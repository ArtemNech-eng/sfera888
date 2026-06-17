"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ProfileData } from "../../../_lib/cabinetClient";
import type { SectionPatchFn } from "../ProfileEditor";
import { SectionCard } from "./_SectionCard";

interface Props {
  data: ProfileData;
  onPatch: SectionPatchFn;
}

/**
 * Identity section — alias, phone, specializations.
 *
 * Specializations is a free-form comma-separated input; the backend stores
 * the array AND derives `specialization` (joined string) from it. Phone is
 * optional but shown as masked-friendly text input.
 */
export function IdentitySection({ data, onPatch }: Props) {
  const [alias, setAlias] = useState(data.alias);
  const [phone, setPhone] = useState(data.phone ?? "");
  const [specsText, setSpecsText] = useState(
    (data.specializations ?? []).join(", "),
  );
  const [busy, setBusy] = useState(false);

  const specs = specsText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const dirty =
    alias.trim() !== data.alias.trim()
    || (phone.trim() || null) !== (data.phone ?? null)
    || JSON.stringify(specs) !== JSON.stringify(data.specializations ?? []);

  async function handleSave() {
    if (!alias.trim()) {
      toast.error("Имя обязательно");
      return;
    }
    setBusy(true);
    try {
      await onPatch(
        {
          alias: alias.trim(),
          phone: phone.trim() || null,
          specializations: specs.length > 0 ? specs : undefined,
        },
        {
          alias: alias.trim(),
          phone: phone.trim() || null,
          specializations: specs.length > 0 ? specs : data.specializations,
          specialization: specs.length > 0 ? specs.join(", ") : data.specialization,
        },
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
      title="Личные данные"
      description="Имя, телефон и специализации. Видны диспетчеру и в шапке публичной карточки."
      action={
        <SaveButton onClick={handleSave} disabled={!dirty} busy={busy} />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Имя / алиас" required>
          <input
            value={alias}
            onChange={(e) => setAlias(e.target.value.slice(0, 80))}
            placeholder="Например: Алексей М."
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
          />
        </Field>
        <Field label="Телефон">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value.slice(0, 32))}
            placeholder="+7 999 123-45-67"
            inputMode="tel"
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
          />
        </Field>
      </div>
      <Field
        label="Специализации"
        hint="Через запятую: «отделочные работы, сантехника, электрика»"
      >
        <input
          value={specsText}
          onChange={(e) => setSpecsText(e.target.value.slice(0, 300))}
          placeholder="отделочные работы, сантехника"
          className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
        />
        {specs.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {specs.map((s, i) => (
              <span
                key={`${s}-${i}`}
                className="inline-flex items-center rounded-full bg-[var(--color-primary-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-primary)]"
              >
                {s}
              </span>
            ))}
          </div>
        ) : null}
      </Field>
      <p className="text-xs text-[var(--color-muted)]">
        Город — <span className="font-semibold text-[var(--color-text)]">{data.city}</span>.
        Чтобы поменять город, обратитесь к диспетчеру.
      </p>
    </SectionCard>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-[var(--color-text)]">
        {label}
        {required ? <span className="ml-1 text-red-600">*</span> : null}
      </label>
      {children}
      {hint ? <p className="text-[11px] text-[var(--color-muted)]">{hint}</p> : null}
    </div>
  );
}

export function SaveButton({
  onClick,
  disabled,
  busy,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-primary-strong)] disabled:opacity-50"
    >
      {busy ? (
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {label ?? "Сохранить"}
    </button>
  );
}
