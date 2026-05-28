import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { leadsApi, type LeadDetail } from "@/lib/api";
import { Loader2, ArrowLeft, Phone, MapPin, ClipboardList, Pencil, Check, X } from "lucide-react";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Timeline({ items }: { items: LeadDetail["timeline"] }) {
  return (
    <div className="space-y-0">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        const isRejected = item.status === "rejected" || item.status === "cancelled";
        const dotColor = isRejected ? "bg-red-500" : item.active ? "bg-[#34C759]" : "bg-[#D1D5DB]";
        const lineColor = isLast ? "bg-transparent" : item.active ? "bg-[#34C759]" : "bg-[#D1D5DB]";

        return (
          <div key={item.status + i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full ${dotColor} shrink-0`} />
              {!isLast && <div className={`w-0.5 flex-1 ${lineColor}`} />}
            </div>
            <div className="pb-4 -mt-1">
              <div className="text-sm font-medium text-[#111827]">{item.label}</div>
              <div className="text-xs text-[#6B7280]">{fmtDate(item.date)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const leadId = parseInt(params.id);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<{ clientPhone: string; city: string; district: string; serviceType: string; area: string; comment: string } | null>(null);

  const { data, isLoading } = useQuery<LeadDetail>({
    queryKey: ["lead", leadId],
    queryFn: () => leadsApi.get(leadId),
    enabled: !isNaN(leadId),
  });

  const startEdit = () => {
    if (!data) return;
    setEditForm({
      clientPhone: data.clientPhone,
      city: data.city,
      district: data.district,
      serviceType: data.serviceType,
      area: data.area ?? "",
      comment: data.comment ?? "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!editForm) return;
    setSaving(true);
    try {
      await leadsApi.update(leadId, {
        clientPhone: editForm.clientPhone,
        city: editForm.city,
        district: editForm.district,
        serviceType: editForm.serviceType,
        area: editForm.area || undefined,
        comment: editForm.comment || undefined,
      });
      await qc.invalidateQueries({ queryKey: ["lead", leadId] });
      await qc.invalidateQueries({ queryKey: ["leads"] });
      setEditing(false);
    } catch {}
    setSaving(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-[#F8F9FA]">
        <Loader2 className="w-8 h-8 animate-spin text-[#34C759]" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-dvh bg-[#F8F9FA] flex flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-[#6B7280]">Лид не найден</p>
        <button
          onClick={() => navigate("/my-leads")}
          className="mt-4 px-4 py-2 bg-[#34C759] text-white rounded-xl text-sm font-medium"
        >
          Назад к лидам
        </button>
      </div>
    );
  }

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    partner_review:  { label: "На проверке",      color: "#92400E", bg: "#FEF3C7" },
    waiting_master:  { label: "Подтверждён",       color: "#1D4ED8", bg: "#DBEAFE" },
    rejected:        { label: "Отклонён",          color: "#991B1B", bg: "#FEE2E2" },
    partner_validated:{ label: "Одобрен",          color: "#065F46", bg: "#D1FAE5" },
    token_spent:     { label: "В обработке",       color: "#6D28D9", bg: "#EDE9FE" },
    in_progress:     { label: "В работе",          color: "#065F46", bg: "#D1FAE5" },
    completed:       { label: "Выполнен",          color: "#065F46", bg: "#D1FAE5" },
    cancelled:       { label: "Отменён",           color: "#374151", bg: "#F3F4F6" },
  };
  const cfg = statusConfig[data.partnerLeadStatus ?? ""] ?? { label: data.partnerLeadStatus ?? "", color: "#374151", bg: "#F3F4F6" };

  return (
    <div className="min-h-dvh bg-[#F8F9FA] pb-6">
      {/* Header */}
      <div className="bg-white border-b border-[#E5E7EB] px-4 pt-12 pb-4 flex items-center gap-3">
        <button onClick={() => navigate("/my-leads")} className="p-2 -ml-2 rounded-xl hover:bg-[#F3F4F6] transition-colors">
          <ArrowLeft className="w-5 h-5 text-[#111827]" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#111827]">Заявка #{data.id}</h1>
          <p className="text-xs text-[#6B7280]">{fmtDate(data.createdAt)}</p>
        </div>
        {data.partnerLeadStatus === "partner_review" && !editing && (
          <button onClick={startEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F3F4F6] text-[#374151] text-xs font-medium">
            <Pencil size={13} /> Изменить
          </button>
        )}
        {editing && (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="p-2 rounded-xl bg-[#F3F4F6]">
              <X size={16} className="text-[#6B7280]" />
            </button>
            <button onClick={saveEdit} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#34C759] text-white text-xs font-semibold disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Сохранить
            </button>
          </div>
        )}
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Status badge */}
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
            style={{ color: cfg.color, background: cfg.bg }}
          >
            {cfg.label}
          </span>
          {data.isPossibleDuplicate && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
              Возможный дубль
            </span>
          )}
        </div>

        {/* Client card / Edit form */}
        {editing && editForm ? (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#34C759] space-y-3">
            <div className="text-sm font-semibold text-[#111827]">Редактирование</div>
            {[
              { label: "Телефон", key: "clientPhone" as const, type: "tel" },
              { label: "Город", key: "city" as const },
              { label: "Адрес", key: "district" as const },
              { label: "Вид работ", key: "serviceType" as const },
              { label: "Площадь", key: "area" as const },
            ].map(({ label, key, type }) => (
              <div key={key} className="space-y-1">
                <div className="text-xs text-[#9CA3AF]">{label}</div>
                <input
                  type={type ?? "text"}
                  value={editForm[key]}
                  onChange={e => setEditForm(f => f ? { ...f, [key]: e.target.value } : f)}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8F9FA] text-[#111827] text-sm focus:outline-none focus:ring-2 focus:ring-[#34C759] focus:border-transparent"
                />
              </div>
            ))}
            <div className="space-y-1">
              <div className="text-xs text-[#9CA3AF]">Комментарий</div>
              <textarea
                rows={2}
                value={editForm.comment}
                onChange={e => setEditForm(f => f ? { ...f, comment: e.target.value } : f)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8F9FA] text-[#111827] text-sm focus:outline-none focus:ring-2 focus:ring-[#34C759] focus:border-transparent resize-none"
              />
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E5E7EB] space-y-3">
            <div className="text-sm font-semibold text-[#111827]">Клиент</div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-[#6B7280]" />
                <a href={`tel:${data.clientPhone}`} className="text-[#1D4ED8] font-medium" onClick={e => e.stopPropagation()}>
                  {data.clientPhone}
                </a>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-[#6B7280]" />
                <span className="text-[#111827]">{data.city}{data.district ? `, ${data.district}` : ""}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <ClipboardList className="w-4 h-4 text-[#6B7280]" />
                <span className="text-[#111827]">{data.serviceType}</span>
              </div>
              {data.area && data.area !== "0" && (
                <div className="text-xs text-[#6B7280] pl-6">Площадь: {data.area} м²</div>
              )}
            </div>
          </div>
        )}

        {/* Comment */}
        {data.comment && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E5E7EB]">
            <div className="text-sm font-semibold text-[#111827] mb-1">Комментарий</div>
            <div className="text-sm text-[#374151]">{data.comment}</div>
          </div>
        )}

        {/* Rejection reason */}
        {data.partnerRejectionReason && (
          <div className="bg-red-50 rounded-2xl p-4 border border-red-100">
            <div className="text-sm font-semibold text-red-800 mb-1">Причина отклонения</div>
            <div className="text-sm text-red-700">{data.partnerRejectionReason}</div>
          </div>
        )}

        {/* Timeline */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E5E7EB]">
          <div className="text-sm font-semibold text-[#111827] mb-3">История заявки</div>
          <Timeline items={data.timeline} />
        </div>
      </div>
    </div>
  );
}
