"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  CabinetApiError,
  type ProfileData,
  type ProfileValidationError,
} from "../../../_lib/cabinetClient";
import type { SectionPatchFn } from "../ProfileEditor";
import { SectionCard } from "./_SectionCard";
import { SaveButton } from "./IdentitySection";

interface Props {
  data: ProfileData;
  onPatch: SectionPatchFn;
}

/**
 * Public marketplace profile — title / bio / years of experience.
 *
 * The api-server runs automoderation on these fields when the master is
 * already published; until publish, only length is enforced. We surface the
 * server's `errors[]` so the master can fix per-field issues inline.
 *
 * Auto-publish: when readiness is met for the first time and the server
 * decides to publish on this save, the response carries `autoPublished: true`
 * and the new slug. We toast a celebratory message in that case.
 */
export function PublicProfileSection({ data, onPatch }: Props) {
  const [publicTitle, setPublicTitle] = useState(data.publicTitle ?? "");
  const [publicBio, setPublicBio] = useState(data.publicBio ?? "");
  const [yearsExperience, setYearsExperience] = useState(
    data.yearsExperience != null ? String(data.yearsExperience) : "",
  );
  const [errors, setErrors] = useState<ProfileValidationError[]>([]);
  const [busy, setBusy] = useState(false);

  const titleLen = publicTitle.trim().length;
  const bioLen = publicBio.trim().length;

  const dirty =
    publicTitle !== (data.publicTitle ?? "")
    || publicBio !== (data.publicBio ?? "")
    || yearsExperience !== (data.yearsExperience != null ? String(data.yearsExperience) : "");

  function errorsByField(field: string) {
    return errors.filter((e) => e.field === field);
  }

  async function handleSave() {
    setBusy(true);
    setErrors([]);
    const yearsNum = yearsExperience.trim() === "" ? null : Number(yearsExperience.trim());
    try {
      const res = await onPatch(
        {
          publicTitle: publicTitle.trim() || null,
          publicBio: publicBio.trim() || null,
          yearsExperience: yearsNum,
        },
        {
          publicTitle: publicTitle.trim() || null,
          publicBio: publicBio.trim() || null,
          yearsExperience: yearsNum,
        },
      );
      if (res.autoPublished) {
        toast.success("Профиль опубликован на сайте 🎉");
      } else {
        toast.success("Сохранено");
      }
      if (res.readinessErrors.length > 0 && !res.isPublished) {
        // Show readiness hints — these are NOT blocking, server saved fine.
        const messages = res.readinessErrors.map((e) => e.message).join("; ");
        toast.message("До автопубликации остаётся: " + messages);
      }
    } catch (err) {
      const data = err instanceof CabinetApiError ? err.data : undefined;
      const validationErrors = (data as { errors?: ProfileValidationError[] })?.errors;
      if (validationErrors && Array.isArray(validationErrors)) {
        setErrors(validationErrors);
        toast.error("Исправьте ошибки в полях.");
      } else {
        const msg = err instanceof Error ? err.message : "Ошибка сохранения";
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title="Карточка на сайте"
      description="Эти поля отображаются на /master/[slug]. Меняйте редко — Яндекс ценит стабильный текст."
      action={<SaveButton onClick={handleSave} disabled={!dirty} busy={busy} />}
    >
      {/* Status pill */}
      <div className="flex items-center gap-2">
        {data.isPublished ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Опубликован
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-background)] px-3 py-1 text-xs font-semibold text-[var(--color-muted)]">
            Черновик
          </span>
        )}
        {data.profileUrl ? (
          <a
            href={data.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-[var(--color-primary)] hover:underline"
          >
            Открыть страницу →
          </a>
        ) : null}
      </div>

      <Field
        label="Заголовок"
        required
        right={
          <span className={titleLen < 10 || titleLen > 150 ? "text-red-600" : "text-[var(--color-muted)]"}>
            {titleLen}/150
            {titleLen < 10 ? " (мин. 10)" : ""}
          </span>
        }
        errors={errorsByField("publicTitle")}
      >
        <input
          value={publicTitle}
          onChange={(e) => setPublicTitle(e.target.value.slice(0, 150))}
          placeholder="Например: «Ремонт квартир под ключ — Москва»"
          className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
        />
      </Field>

      <Field
        label="О себе"
        required
        right={
          <span className={bioLen < 100 || bioLen > 2000 ? "text-red-600" : "text-[var(--color-muted)]"}>
            {bioLen}/2000
            {bioLen < 100 ? " (мин. 100)" : ""}
          </span>
        }
        errors={errorsByField("publicBio")}
      >
        <textarea
          value={publicBio}
          onChange={(e) => setPublicBio(e.target.value.slice(0, 2000))}
          rows={6}
          placeholder="Опыт, специализации, подход к работе. Без телефонов, ссылок, адресов."
          className="w-full resize-y rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm leading-relaxed focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
        />
      </Field>

      <Field
        label="Опыт работы, лет"
        hint="Целое число от 0 до 70."
        errors={errorsByField("yearsExperience")}
      >
        <input
          type="text"
          inputMode="numeric"
          value={yearsExperience}
          onChange={(e) => setYearsExperience(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
          placeholder="12"
          className="h-11 w-32 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
        />
      </Field>
    </SectionCard>
  );
}

function Field({
  label,
  required,
  hint,
  right,
  errors,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  right?: React.ReactNode;
  errors?: ProfileValidationError[];
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-semibold text-[var(--color-text)]">
        <span>
          {label}
          {required ? <span className="ml-1 text-red-600">*</span> : null}
        </span>
        {right ? <span className="font-normal">{right}</span> : null}
      </div>
      {children}
      {hint ? <p className="text-[11px] text-[var(--color-muted)]">{hint}</p> : null}
      {errors?.map((e, i) => (
        <p key={i} className="text-xs text-red-600">{e.message}</p>
      ))}
    </div>
  );
}
