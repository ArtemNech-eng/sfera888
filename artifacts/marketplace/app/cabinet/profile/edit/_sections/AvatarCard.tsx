"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { cabinetProfile, CabinetApiError } from "../../../_lib/cabinetClient";

const MAX_AVATAR_SIZE = 8 * 1024 * 1024; // 8 MB — server resamples down anyway.

interface Props {
  alias: string;
  customAvatarUrl: string | null;
  resolvePhoto: (url: string | null | undefined) => string;
  onUploaded: (url: string) => void;
}

/**
 * Avatar upload card. Sends the file to `POST /profile/avatar` (multipart)
 * via the cabinet proxy and updates the parent profile state on success.
 *
 * Mirrors master-pwa's avatar pattern. The api-server's
 * `uploadPwaAvatarToGCS` handles resampling — we just hand it a JPEG/PNG.
 */
export function AvatarCard({
  alias,
  customAvatarUrl,
  resolvePhoto,
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Выберите изображение");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error("Файл больше 8 МБ");
      return;
    }
    setBusy(true);
    try {
      const res = await cabinetProfile.uploadAvatar(file);
      onUploaded(res.customAvatarUrl);
      toast.success("Фото обновлено");
    } catch (err) {
      const msg = err instanceof CabinetApiError ? err.message : err instanceof Error ? err.message : "Ошибка загрузки";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  const initials = alias
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "М";

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white p-5 text-center shadow-sm">
      <div className="relative mx-auto h-24 w-24 sm:h-28 sm:w-28">
        {customAvatarUrl ? (
          <img
            src={resolvePhoto(customAvatarUrl)}
            alt={alias}
            className="h-full w-full rounded-full border-2 border-[var(--color-primary-soft)] object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-2xl font-bold text-[var(--color-primary)]">
            {initials}
          </div>
        )}
        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
            <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
          </div>
        ) : null}
      </div>
      <p className="mt-3 text-sm font-semibold text-[var(--color-text)]">{alias}</p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 text-xs font-semibold text-[var(--color-text)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
          <path d="M12 12v9" />
          <path d="m16 16-4-4-4 4" />
        </svg>
        {customAvatarUrl ? "Заменить фото" : "Загрузить фото"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <p className="mt-2 text-[11px] text-[var(--color-muted)]">
        JPG/PNG, до 8 МБ. Видно на странице мастера в каталоге.
      </p>
    </div>
  );
}
