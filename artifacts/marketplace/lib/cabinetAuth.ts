import "server-only";
import { cookies } from "next/headers";
import { internalApiBase } from "./env";

/**
 * Master session shape returned by `GET /api/master-pwa/auth/me`. Mirrored
 * from `artifacts/api-server/src/routes/master-pwa.ts`. Kept here as a
 * narrow façade so cabinet UI can be type-checked without depending on the
 * full master-pwa types package.
 */
export interface CabinetMaster {
  id: number;
  alias: string;
  city: string;
  specialization: string;
  specializations?: string[] | null;
  rating: number;
  debt: number;
  phone: string | null;
  status: "active" | "suspended" | "pending" | string;
  totalOrders?: number;
  acceptedOrders?: number;
  isTestMaster?: boolean;
  customAvatarUrl?: string | null;
  pwaLogin?: string | null;
  maxChatId?: string | null;
  maxBotLink?: string | null;
  contractSignedAt?: string | null;
  passportVerified?: boolean;
}

/**
 * Server-side resolver for the current authenticated master.
 *
 * Called from cabinet layout / pages. Forwards the incoming `connect.sid`
 * cookie directly to `${INTERNAL_API_BASE_URL}/master-pwa/auth/me`. Returns
 * `null` on 401 so callers can `redirect("/login")` deterministically.
 *
 * IMPORTANT: this runs on every cabinet SSR request. If perf becomes a
 * concern (it shouldn't — internal Railway hop is ~5ms), we can memoize via
 * `react.cache()` per request. For now keeping it simple.
 */
export async function getCurrentMaster(): Promise<CabinetMaster | null> {
  const cookieStore = await cookies();
  const all = cookieStore.getAll();
  if (all.length === 0) return null;

  // Forward the entire cookie jar — `connect.sid` is what the api-server's
  // session middleware looks for, but harmless to send the rest.
  const cookieHeader = all.map((c) => `${c.name}=${c.value}`).join("; ");

  const apiBase = internalApiBase().replace(/\/+$/, "");
  const url = `${apiBase}/master-pwa/auth/me`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Cookie: cookieHeader,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch {
    // Upstream unreachable — treat as anonymous so cabinet redirects to login.
    // Better than throwing a 500 page on flaky network.
    return null;
  }

  if (res.status === 401) return null;
  if (!res.ok) return null;

  try {
    return (await res.json()) as CabinetMaster;
  } catch {
    return null;
  }
}
