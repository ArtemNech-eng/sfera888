const PHONE_KEY = "client_phone";

export function getStoredPhone(): string | null {
  try { return localStorage.getItem(PHONE_KEY); } catch { return null; }
}

export function setStoredPhone(phone: string): void {
  try { localStorage.setItem(PHONE_KEY, phone); } catch { /* ignore */ }
}

export function clearStoredPhone(): void {
  try { localStorage.removeItem(PHONE_KEY); } catch { /* ignore */ }
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
