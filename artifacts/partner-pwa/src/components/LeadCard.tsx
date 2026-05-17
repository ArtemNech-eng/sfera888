import type { Lead } from "@/lib/api";

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  partner_review:  { label: "На проверке",        color: "#92400E", bg: "#FEF3C7" },
  waiting_master:  { label: "Подтверждён",         color: "#1D4ED8", bg: "#DBEAFE" },
  invalid:         { label: "Отклонён",            color: "#991B1B", bg: "#FEE2E2" },
  new:             { label: "Передан в работу",    color: "#6D28D9", bg: "#EDE9FE" },
  master_assigned: { label: "Принят мастером",     color: "#065F46", bg: "#D1FAE5" },
  in_progress:     { label: "В работе",            color: "#065F46", bg: "#D1FAE5" },
  completed:       { label: "Выполнен",            color: "#065F46", bg: "#D1FAE5" },
  cancelled:       { label: "Отменён",             color: "#374151", bg: "#F3F4F6" },
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

interface LeadCardProps {
  lead: Lead;
}

export default function LeadCard({ lead }: LeadCardProps) {
  const statusKey = lead.partnerLeadStatus ?? lead.status;
  const cfg = statusConfig[statusKey] ?? { label: statusKey, color: "#374151", bg: "#F3F4F6" };
  const isAccepted = lead.status === "master_assigned" || lead.status === "in_progress" || lead.status === "completed";

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E5E7EB] space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-[#111827] text-sm">{lead.serviceType}</div>
          <div className="text-xs text-[#6B7280]">{lead.city}{lead.district ? `, ${lead.district}` : ""}</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
            style={{ color: cfg.color, background: cfg.bg }}
          >
            {cfg.label}
          </span>
          {lead.isPossibleDuplicate && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
              Возможный дубль
            </span>
          )}
        </div>
      </div>

      {lead.partnerLeadStatus === "invalid" && lead.partnerRejectionReason && (
        <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-1.5">
          Причина: {lead.partnerRejectionReason}
        </div>
      )}

      {isAccepted && (
        <div className="bg-[#D1FAE5] text-[#065F46] text-xs font-semibold rounded-lg px-3 py-1.5">
          Заявку взяли — +250 ₽
        </div>
      )}

      <div className="text-xs text-[#6B7280]">{fmt(lead.createdAt)}</div>
    </div>
  );
}
