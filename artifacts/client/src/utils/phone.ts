const PHONE_KEY = "client_phone";
const COOKIE_DAYS = 365;

function setCookie(value: string) {
  try {
    const expires = new Date();
    expires.setDate(expires.getDate() + COOKIE_DAYS);
    document.cookie = `${PHONE_KEY}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
  } catch { /* ignore */ }
}

function getCookie(): string | null {
  try {
    const match = document.cookie.split(";").map(c => c.trim()).find(c => c.startsWith(`${PHONE_KEY}=`));
    return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : null;
  } catch { return null; }
}

function deleteCookie() {
  try {
    document.cookie = `${PHONE_KEY}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`;
  } catch { /* ignore */ }
}

export function getStoredPhone(): string | null {
  try {
    const ls = localStorage.getItem(PHONE_KEY);
    if (ls) return ls;
    const cookie = getCookie();
    if (cookie) {
      try { localStorage.setItem(PHONE_KEY, cookie); } catch { /* ignore */ }
    }
    return cookie;
  } catch {
    return getCookie();
  }
}

export function setStoredPhone(phone: string): void {
  try { localStorage.setItem(PHONE_KEY, phone); } catch { /* ignore */ }
  setCookie(phone);
}

export function clearStoredPhone(): void {
  try { localStorage.removeItem(PHONE_KEY); } catch { /* ignore */ }
  deleteCookie();
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

export function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  return na.length >= 10 && nb.length >= 10 && na === nb;
}

export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11 && (d[0] === "7" || d[0] === "8")) {
    return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
  }
  return raw;
}
