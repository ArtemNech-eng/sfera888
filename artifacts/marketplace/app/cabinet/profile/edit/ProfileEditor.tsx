"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  cabinetProfile,
  CabinetApiError,
  type ProfileData,
  type ProfileUpdateInput,
  type ProfileValidationError,
  type ServicePrice,
  type WorkingHours,
} from "../../_lib/cabinetClient";
import { resolvePhotoUrl } from "../../_lib/photo";
import { IdentitySection } from "./_sections/IdentitySection";
import { PublicProfileSection } from "./_sections/PublicProfileSection";
import { WorkingHoursSection } from "./_sections/WorkingHoursSection";
import { OrderFiltersSection } from "./_sections/OrderFiltersSection";
import { ServicePricesSection } from "./_sections/ServicePricesSection";
import { AvailabilityCard } from "./_sections/AvailabilityCard";
import { AvatarCard } from "./_sections/AvatarCard";
import { PushNotificationCard } from "../../_components/PushNotificationCard";

/**
 * Top-level orchestrator for the cabinet profile editor.
 *
 * Loads the master profile once, then renders a vertical stack of section
 * cards. Each section owns its draft state and calls `cabinetProfile.update`
 * with only its fields. We pass an `onUpdate` callback so sections can merge
 * the server response (e.g. autoPublishedSlug) into the shared profile.
 */
export function ProfileEditor() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await cabinetProfile.fetch();
        if (cancelled) return;
        setData(res);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Не удалось загрузить профиль";
        setError(msg);
        toast.error(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Patch helper used by sections. Accepts the partial input plus an
   * optimistic merge of the same fields so the UI reflects the change while
   * the server response is in flight. Returns the parsed update response (so
   * sections can show "опубликован сейчас" toasts after the auto-publish gate).
   */
  async function patch(input: ProfileUpdateInput, optimistic: Partial<ProfileData>) {
    if (!data) throw new Error("Профиль ещё не загружен");
    const before = data;
    setData({ ...before, ...optimistic });
    try {
      const res = await cabinetProfile.update(input);
      // Reflect server-derived fields (e.g. publish state) onto the local copy.
      setData((prev) =>
        prev
          ? {
              ...prev,
              isPublished: res.isPublished,
              slug: res.slug,
              publishedAt: res.publishedAt,
              profileUrl: res.profileUrl,
            }
          : prev,
      );
      return res;
    } catch (err) {
      // Roll back optimistic merge on failure.
      setData(before);
      throw err;
    }
  }

  function setAvatarUrl(url: string) {
    setData((prev) => (prev ? { ...prev, customAvatarUrl: url } : prev));
  }

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
        {error ?? "Профиль не найден"}.{" "}
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <header>
        <Link
          href="/cabinet/profile"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
          Назад к профилю
        </Link>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
          Профиль мастера
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
          Редактирование
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Каждая секция сохраняется отдельно. Опубликованные поля появляются на
          {" "}
          <span className="font-semibold text-[var(--color-text)]">/master/{data.slug ?? "..."}</span>
          {" "}через несколько секунд после сохранения.
        </p>
      </header>

      {/* Top row: avatar + availability */}
      <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
        <AvatarCard
          alias={data.alias}
          customAvatarUrl={data.customAvatarUrl}
          resolvePhoto={resolvePhotoUrl}
          onUploaded={setAvatarUrl}
        />
        <AvailabilityCard masterId={data.id} />
      </div>

      {/* Identity */}
      <IdentitySection data={data} onPatch={patch} />

      {/* Public marketplace card */}
      <PublicProfileSection data={data} onPatch={patch} />

      {/* Working hours */}
      <WorkingHoursSection data={data} onPatch={patch} />

      {/* Order filters */}
      <OrderFiltersSection data={data} onPatch={patch} />

      {/* Service prices */}
      <ServicePricesSection data={data} onPatch={patch} />

      {/* Push notifications */}
      <PushNotificationCard />
    </div>
  );
}

export type SectionPatchFn = (
  input: ProfileUpdateInput,
  optimistic: Partial<ProfileData>,
) => Promise<{
  isPublished: boolean;
  autoPublished: boolean;
  readinessErrors: { field: string; code: string; message: string }[];
}>;

export type {
  ProfileData,
  ProfileUpdateInput,
  ProfileValidationError,
  ServicePrice,
  WorkingHours,
};
export { CabinetApiError };
