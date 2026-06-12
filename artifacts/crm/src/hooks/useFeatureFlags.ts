import { useQuery } from "@tanstack/react-query";

/**
 * Feature flags consumer для CRM. Подтягивает whitelisted флаги из
 * `GET /api/system/feature-flags` (см. routes/system.ts).
 *
 * Используется компонентами:
 *   • OrderPanel — кнопка "Принять предложение мастера" под флагом
 *     `payment_state_master_proposal_oneclick`.
 *   • OrdersBanners — баннер "Сумма не зафиксирована >48ч" под флагом
 *     `payment_state_engine_enabled`.
 *   • AmountAuditHistory (Phase 3) — под флагом `payment_state_audit_ui_enabled`.
 *
 * Кешируется на 60 секунд; при ошибке fetch возвращает дефолты с сервера
 * (он сам делает fail-closed). Безопасно для условного рендера UI.
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

export function useFeatureFlags() {
  const query = useQuery({
    queryKey: ["/api/system/feature-flags"],
    queryFn: async (): Promise<FeatureFlags> => {
      const r = await fetch("/api/system/feature-flags", { credentials: "include" });
      if (!r.ok) throw new Error("feature-flags fetch failed");
      return r.json();
    },
    staleTime: 60_000,
    retry: false,
  });

  // While loading or on error fall back to safe defaults so UI doesn't flicker.
  const flags = query.data ?? FALLBACK;
  return { flags, isLoading: query.isLoading, isError: query.isError };
}
