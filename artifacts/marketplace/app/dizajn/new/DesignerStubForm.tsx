"use client";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

const ROOM_TYPES = [
  { value: "vannaya", label: "ванная" },
  { value: "kuhnya", label: "кухня" },
  { value: "gostinaya", label: "гостиная" },
  { value: "spalnya", label: "спальня" },
  { value: "prihozhaya", label: "прихожая" },
];

const STYLES = [
  { value: "sovremennyy", label: "современный" },
  { value: "skandinavskiy", label: "скандинавский" },
  { value: "loft", label: "лофт" },
  { value: "minimalizm", label: "минимализм" },
  { value: "neoklassika", label: "неоклассика" },
];

/**
 * Form skeleton for the future AI designer flow. INTENTIONALLY does not:
 *   • upload the file anywhere,
 *   • POST to an API,
 *   • persist anything to the server.
 *
 * The selected file is only previewed locally via `URL.createObjectURL`,
 * and the URL is revoked when the user picks a new file or unmounts.
 */
export function DesignerStubForm() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const previousUrlRef = useRef<string | null>(null);

  // Always release the previously-created object URL when we replace it
  // (so the browser doesn't leak memory across selections) and on unmount.
  useEffect(() => {
    return () => {
      if (previousUrlRef.current) {
        URL.revokeObjectURL(previousUrlRef.current);
        previousUrlRef.current = null;
      }
    };
  }, []);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (previousUrlRef.current) {
      URL.revokeObjectURL(previousUrlRef.current);
      previousUrlRef.current = null;
    }
    if (!file) {
      setPreviewUrl(null);
      setFileName(null);
      return;
    }
    const url = URL.createObjectURL(file);
    previousUrlRef.current = url;
    setPreviewUrl(url);
    setFileName(file.name);
  }

  return (
    // Disable native browser submission — there's no endpoint behind this form.
    <form
      onSubmit={(e) => e.preventDefault()}
      className="grid gap-5"
      aria-describedby="designer-stub-note"
    >
      <p id="designer-stub-note" className="sr-only">
        Форма-заглушка. Файл не отправляется на сервер.
      </p>

      <label className="grid gap-2 text-sm">
        <span className="font-medium text-[var(--color-text)]">Фото комнаты</span>
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="block w-full cursor-pointer rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--color-background)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--color-text)] hover:file:bg-[var(--color-border)]"
        />
        <span className="text-xs text-[var(--color-muted)]">
          Файл остаётся в вашем браузере. Мы пока ничего не отправляем на сервер.
        </span>
      </label>

      {previewUrl ? (
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]">
          {/* Local-only preview. Using <img> on purpose — next/image needs a
              configured remote host, and a blob: URL is per-tab anyway. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={fileName ?? "Превью загруженной фотографии"}
            className="block max-h-80 w-full object-contain"
          />
          {fileName ? (
            <div className="border-t border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted)]">
              {fileName}
            </div>
          ) : null}
        </div>
      ) : null}

      <label className="grid gap-2 text-sm">
        <span className="font-medium text-[var(--color-text)]">Тип помещения</span>
        <select
          name="roomType"
          defaultValue=""
          className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-base text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
        >
          <option value="" disabled>
            Выберите помещение
          </option>
          {ROOM_TYPES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-sm">
        <span className="font-medium text-[var(--color-text)]">Стиль</span>
        <select
          name="style"
          defaultValue=""
          className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-base text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
        >
          <option value="" disabled>
            Выберите стиль
          </option>
          {STYLES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled
        aria-disabled="true"
        title="Эта функция появится после подключения AI-движка"
        className="inline-flex cursor-not-allowed items-center justify-center rounded-xl bg-[var(--color-primary)] px-5 py-3 text-base font-medium text-white opacity-60"
      >
        Генерация скоро будет доступна
      </button>
    </form>
  );
}
