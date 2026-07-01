/**
 * Сетевые ошибки уровня браузера («Failed to fetch», «Load failed», разрыв
 * соединения) — это НЕ ответ сервера, а признак того, что запрос вообще не
 * дошёл: нет интернета, слетел DNS/VPN, или застрял старый service worker
 * PWA. Отличаем их от прикладных ошибок (400/403/500 с телом), чтобы:
 *   • показывать мастеру понятный текст вместо «Failed to fetch»;
 *   • предложить «сбросить кэш и обновить» — лечит застрявший PWA.
 */

/** Дружелюбный текст для сетевого сбоя (нет ответа от сервера). */
export const NETWORK_ERROR_MESSAGE =
  "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.";

/**
 * true, если ошибка — сетевая (fetch отклонился до получения ответа).
 * `fetch` бросает `TypeError` с сообщением вида «Failed to fetch» (Chrome),
 * «Load failed» (Safari), «NetworkError…» (Firefox).
 */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const msg = (err as { message?: string })?.message ?? "";
  return /failed to fetch|load failed|networkerror|network request failed/i.test(
    msg,
  );
}

/** Нормализованный текст ошибки для показа пользователю. */
export function friendlyErrorMessage(err: unknown, fallback = "Ошибка"): string {
  if (isNetworkError(err)) return NETWORK_ERROR_MESSAGE;
  return (err as { message?: string })?.message ?? fallback;
}

/**
 * «Жёсткий сброс» PWA: снимает регистрацию всех service worker'ов, чистит
 * Cache Storage и перезагружает страницу с обходом HTTP-кэша. Это штатный
 * способ вылечить ситуацию, когда старый закэшированный воркер/оболочка
 * ломают сетевые запросы («Failed to fetch»).
 */
export async function hardReset(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore */
  }
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }
  // Кэш-бустер в query, чтобы гарантированно взять свежий index.html.
  const url = new URL(window.location.href);
  url.searchParams.set("_r", Date.now().toString());
  window.location.replace(url.toString());
}
