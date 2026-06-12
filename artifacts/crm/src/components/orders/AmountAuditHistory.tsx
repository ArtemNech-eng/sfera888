import { useQuery } from "@tanstack/react-query";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { History, Loader2 } from "lucide-react";

/**
 * AmountAuditHistory — раскрывающийся список изменений суммы заказа.
 * Показывает timestamp, actor (alias + role), какое поле менялось,
 * prev → new, source и reason. Используется в ClosingDrawer для Manager.
 *
 * Phase 3 of estimate-optional-flow.
 *
 * Флаг `payment_state_audit_ui_enabled` контролирует показ — если выключен,
 * компонент не рендерит ничего. Endpoint доступен только admin'ам, поэтому
 * для других ролей при ошибке 401/403 — тоже ничего не показываем.
 */

interface AuditRow {
  id: number;
  orderId: number;
  field: string;
  prevValue: string | null;
  newValue: string | null;
  source: string;
  reason: string | null;
  actorUserId: number | null;
  actorRole: string | null;
  actorAlias: string | null;
  createdAt: string;
}

interface Props {
  orderId: number;
  /** className на контейнер. */
  className?: string;
}

const SOURCE_LABELS: Record<string, string> = {
  agreement: "согласовано (Agreement_Path)",
  master_proposal: "принято предложение мастера",
  receipt: "из сметы мастера",
  manager_correction: "коррекция Manager",
  manager_force_paid: "Manager отметил оплачено",
  reconcile_use_receipt: "reconcile: принята смета",
  reconcile_keep_agreement: "reconcile: оставлена согласованная",
  system_recalc: "пересчёт системой",
  operator_edit: "правка оператора",
  unknown: "историческая запись",
};

const FIELD_LABELS: Record<string, string> = {
  orderAmount: "Сумма заказа",
  commission: "Комиссия",
  commissionPaid: "Флаг оплаты",
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtValue(field: string, value: string | null): string {
  if (value == null) return "—";
  if (field === "commissionPaid") return value === "true" ? "✓ оплачено" : "✗ не оплачено";
  // numeric fields: try format with separator
  const n = Number(value);
  if (!Number.isNaN(n) && Number.isFinite(n)) {
    return new Intl.NumberFormat("ru-RU").format(n) + " ₽";
  }
  return value;
}

export function AmountAuditHistory({ orderId, className = "" }: Props) {
  const { flags } = useFeatureFlags();
  const enabled = flags.payment_state_audit_ui_enabled;

  const { data: rows = [], isLoading, isError } = useQuery<AuditRow[]>({
    queryKey: ["/api/orders", orderId, "audit"],
    queryFn: async () => {
      const r = await fetch(`/api/orders/${orderId}/audit`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled,
    staleTime: 30_000,
  });

  if (!enabled) return null;
  // 401/403/404/500 — тихо скрываемся (не Manager или нет данных).
  if (isError) return null;

  return (
    <details className={`bg-slate-50 border border-slate-200 rounded-xl ${className}`}>
      <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-slate-700 flex items-center gap-2 select-none">
        <History className="w-4 h-4" />
        История изменений суммы
        {rows.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? "запись" : rows.length < 5 ? "записи" : "записей"}
          </span>
        )}
      </summary>
      <div className="px-4 pb-3 pt-1">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Загружаю историю…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">История пуста.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className="bg-white rounded-lg border border-slate-200 px-3 py-2 text-xs space-y-0.5"
              >
                <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                  <span className="font-medium text-slate-600">{fmtTime(row.createdAt)}</span>
                  <span>
                    {row.actorAlias ?? "—"}
                    {row.actorRole && (
                      <span className="ml-1 text-slate-400">({row.actorRole})</span>
                    )}
                  </span>
                </div>
                <div className="text-slate-800">
                  <span className="font-medium">{FIELD_LABELS[row.field] ?? row.field}:</span>{" "}
                  <span className="text-slate-500">{fmtValue(row.field, row.prevValue)}</span>
                  <span className="mx-1.5 text-slate-400">→</span>
                  <span className="text-slate-900 font-medium">{fmtValue(row.field, row.newValue)}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="inline-flex items-center px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-medium">
                    {SOURCE_LABELS[row.source] ?? row.source}
                  </span>
                  {row.reason && (
                    <span className="text-slate-600 italic">«{row.reason}»</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

export default AmountAuditHistory;
