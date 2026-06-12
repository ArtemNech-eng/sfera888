import { useEffect, useState } from "react";

/**
 * Lightweight feature-flags consumer for Master_PWA.
 *
 * Reads `GET /api/system/feature-flags` once on mount, caches result for
 * the session, and refetches every 5 minutes. No tanstack/react-query
 * dependency — simple useState + fetch.
 *
 * Used by `pages/orders.tsx` and `pages/wallet.tsx` to hide token-model
 * UI when the legacy flow is disabled. See
 * `.kiro/specs/remove-token-payment-model/`.
 */
export interface FeatureFlags {
  payment_state_engine_enabled: boolean;
  payment_state_audit_ui_enabled: boolean;
  payment_state_master_proposal_oneclick: boolean;
  token_model_enabled: boolean;
}

const FALLBACK: FeatureFlags = {
  payment_state_engine_enabled: false,
  payment_state_audit_ui_enabled: false,
  payment_state_master_proposal_oneclick: true,
  token_model_enabled: true,
};

const REFETCH_INTERVAL_MS = 5 * 60 * 1000;

let cached: { flags: FeatureFlags; ts: number } | null = null;

export function useFeatureFlags(): { flags: FeatureFlags; isLoading: boolean } {
  const [flags, setFlags] = useState<FeatureFlags>(cached?.flags ?? FALLBACK);
  const [isLoading, setIsLoading] = useState(!cached);

  useEffect(() => {
    let alive = true;

    const fetchFlags = async () => {
      // Use cache if fresh
      if (cached && Date.now() - cached.ts < REFETCH_INTERVAL_MS) {
        if (alive) {
          setFlags(cached.flags);
          setIsLoading(false);
        }
        return;
      }
      try {
        const r = await fetch("/api/system/feature-flags", { credentials: "include" });
        if (!r.ok) throw new Error("fetch failed");
        const data: FeatureFlags = await r.json();
        cached = { flags: data, ts: Date.now() };
        if (alive) {
          setFlags(data);
          setIsLoading(false);
        }
      } catch {
        // Fail-safe: keep fallback (token_model_enabled = true) so legacy
        // UI doesn't disappear due to a transient network error.
        if (alive) setIsLoading(false);
      }
    };

    fetchFlags();
    return () => {
      alive = false;
    };
  }, []);

  return { flags, isLoading };
}
