import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import { LeadStatus } from "@workspace/api-client-react";
import {
  X, History, ChevronDown, Loader2, CheckCircle2, ExternalLink,
  Clock, Ban, UserX, Play, Pencil, Trash2,
} from "lucide-react";
import { useState } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface LeadRow {
  id: number;
  clientName: string;
  clientPhone: string;
  city: string;
  district: string | null;
  serviceType: string;
  area: number;
  services: Array<{ type: string; area: number; pricePerM2: number }> | null;
  scheduledAt: string | null;
  comment: string | null;
  source: string | null;
  status: string;
  photos: string[] | null;
  createdAt: string;
  updatedAt: string;
  cancellationReason: string | null;
  orderId: number | null;
}

interface TimelineEvent {
  id: number;
  event_type: string;
  description: string;
  user_alias: string | null;
  created_at: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const SOURCE_OPTIONS = [
  { value: "call",     label: "Входящий звонок" },
  { value: "website",  label: "Сайт" },
  { value: "ads",      label: "Реклама" },
  { value: "avito",    label: "Авито" },
  { value: "referral", label: "Рекомендация" },
  { value: "repeat",   label: "Повторный клиент" },
  { value: "other",    label: "Другое" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMoney(n: number) { return n.toLocaleString("ru-RU") + " ₽"; }

// ─── Component ────────────────────────────────────────────────────────────────

interface LeadDetailPanelProps {
  lead: LeadRow;
  timelineEvents?: TimelineEvent[];
  onClose: () => void;
  onStatusChange: (id: number, status: string) => void;
  onDelete: (id: number) => void;
  onEdit: (lead: LeadRow) => void;
  onSendToWork: (lead: LeadRow) => void;
  onOpenOrder: (orderId: number) => void;
  onOpenReasonDialog: (targetStatus: "non_target" | "client_refusal") => void;
  statusPending?: boolean;
  deletePending?: boolean;
}

export default function LeadDetailPanel({
  lead,
  timelineEvents,
  onClose,
  onStatusChange,
  onDelete,
  onEdit,
  onSendToWork,
  onOpenOrder,
  onOpenReasonDialog,
  statusPending,
  deletePending,
}: LeadDetailPanelProps) {
  const [showLeadTimeline, setShowLeadTimeline] = useState(false);

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card rounded-t-3xl sm:rounded-3xl border border-border shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-border/50 flex items-start justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-display font-bold text-foreground">Заявка #{lead.orderId ?? lead.id}</h2>
              <StatusBadge status={lead.status} type="lead" />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{lead.city}{lead.district ? `, ${lead.district}` : ""}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 flex-shrink-0 ml-2"><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <div className="overflow-y-auto flex-1">
          <div className="p-6 space-y-4">
            {/* Client info */}
            <div className="bg-slate-50 rounded-2xl p-4 space-y-2.5 text-sm">
              <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Клиент</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div><p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Имя</p><p className="font-medium text-foreground">{lead.clientName}</p></div>
                <div><p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Телефон</p><a href={`tel:${lead.clientPhone}`} className="font-medium text-blue-600 hover:underline">{lead.clientPhone}</a></div>
                <div><p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Город · Адрес</p><p className="font-medium text-foreground">{lead.city}{lead.district ? `, ${lead.district}` : ""}</p></div>
                {lead.source && <div><p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Источник</p><p className="font-medium text-foreground">{SOURCE_OPTIONS.find(o => o.value === lead.source)?.label ?? lead.source}</p></div>}
                {lead.scheduledAt && <div><p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Дата выезда</p><p className="font-medium text-blue-600">{new Date(lead.scheduledAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p></div>}
                <div><p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">Создана</p><p className="font-medium text-foreground">{formatDate(lead.createdAt)}</p></div>
              </div>
            </div>
            {/* Services */}
            {(() => {
              const srvs = lead.services;
              const estimate = srvs ? srvs.reduce((sum, s) => sum + s.area * (s.pricePerM2 || 0), 0) : 0;
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Услуги</p>
                    {estimate > 0 && <span className="text-sm font-bold text-emerald-600">≈ {fmtMoney(estimate)}</span>}
                  </div>
                  <div className="rounded-xl border border-border/60 overflow-hidden">
                    {srvs && srvs.length > 0 ? srvs.map((s, i) => (
                      <div key={i} className={`flex items-center justify-between px-4 py-2.5 text-sm ${i > 0 ? "border-t border-border/40" : ""}`}>
                        <div><span className="font-medium text-foreground">{s.type}</span><span className="text-muted-foreground text-xs ml-2">{s.area} м²</span></div>
                        {s.area * (s.pricePerM2 || 0) > 0 && <span className="font-semibold text-emerald-600 text-xs">{(s.area * s.pricePerM2).toLocaleString("ru-RU")} ₽</span>}
                      </div>
                    )) : (
                      <div className="px-4 py-2.5 text-sm flex items-center justify-between">
                        <div><span className="font-medium text-foreground">{lead.serviceType}</span><span className="text-muted-foreground text-xs ml-2">{lead.area} м²</span></div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            {/* Comment */}
            {lead.comment && (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Комментарий</p>
                <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-foreground leading-relaxed">{lead.comment}</div>
              </div>
            )}
            {/* Photos */}
            {lead.photos && lead.photos.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Фотографии ({lead.photos.length})</p>
                <div className="flex flex-wrap gap-2">
                  {lead.photos.map((p, i) => (
                    <a key={i} href={`/api/storage${p}`} target="_blank" rel="noopener noreferrer"><img src={`/api/storage${p}`} alt={`Фото ${i+1}`} className="w-16 h-16 object-cover rounded-xl border border-border hover:opacity-80 transition-opacity" /></a>
                  ))}
                </div>
              </div>
            )}
            {/* Timeline */}
            <div className="space-y-2">
              <button onClick={() => setShowLeadTimeline(v => !v)} className="flex items-center gap-2 text-[10px] uppercase text-muted-foreground font-semibold tracking-wide hover:text-foreground transition-colors">
                <History className="w-3.5 h-3.5" />История событий<ChevronDown className={`w-3 h-3 transition-transform ${showLeadTimeline ? "rotate-180" : ""}`} />
              </button>
              {showLeadTimeline && (
                <div className="space-y-1">
                  {!timelineEvents ? (
                    <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                  ) : timelineEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">Событий не найдено</p>
                  ) : (
                    <div className="relative pl-4 space-y-0">
                      <div className="absolute left-1.5 top-0 bottom-0 w-px bg-border" />
                      {timelineEvents.map(ev => (
                        <div key={ev.id} className="relative flex gap-3 py-1.5">
                          <div className="absolute -left-2.5 top-2.5 w-2 h-2 rounded-full bg-primary/40 border-2 border-background" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-foreground leading-snug">{ev.description}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(ev.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{ev.user_alias ? ` · ${ev.user_alias}` : ""}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Link to order */}
            {lead.status === "sent_to_work" && lead.orderId && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" /><span className="text-sm font-medium text-emerald-700">Заявка отправлена в работу</span></div>
                <button onClick={() => { onClose(); onOpenOrder(lead.orderId!); }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 hover:underline">
                  Заказ #{lead.orderId} <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            )}
            {/* Cancellation reason */}
            {lead.cancellationReason && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide mb-1">Причина закрытия</p>
                <p className="text-sm text-foreground">{lead.cancellationReason}</p>
              </div>
            )}
            {/* Quick actions */}
            {(lead.status === LeadStatus.new || lead.status === LeadStatus.processing) && (
              <div className="space-y-2">
                <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Быстрые действия</p>
                <div className="grid grid-cols-2 gap-2">
                  {lead.status === LeadStatus.new && (
                    <button onClick={() => { onStatusChange(lead.id, "processing"); }} disabled={statusPending} className="flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-xs font-medium hover:bg-blue-100 transition-colors disabled:opacity-50">
                      <Clock className="w-3.5 h-3.5" />В обработке
                    </button>
                  )}
                  <button onClick={() => { onOpenReasonDialog("non_target"); }} disabled={statusPending} className="flex items-center justify-center gap-2 px-3 py-2.5 bg-orange-50 text-orange-700 border border-orange-200 rounded-xl text-xs font-medium hover:bg-orange-100 transition-colors disabled:opacity-50">
                    <Ban className="w-3.5 h-3.5" />Нецелевая
                  </button>
                  <button onClick={() => { onOpenReasonDialog("client_refusal"); }} disabled={statusPending} className="flex items-center justify-center gap-2 px-3 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-50">
                    <UserX className="w-3.5 h-3.5" />Отказ клиента
                  </button>
                </div>
              </div>
            )}
            {/* Main actions */}
            <div className="border-t border-border/50 pt-4 space-y-2">
              {(lead.status === LeadStatus.new || lead.status === LeadStatus.processing) && (
                <button onClick={() => { onSendToWork(lead); onClose(); }} className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors">
                  <Play className="w-4 h-4" />🚀 Отправить мастерам
                </button>
              )}
              <div className="flex gap-2">
                <button onClick={() => { onEdit(lead); onClose(); }} className="flex-1 flex items-center justify-center gap-2 py-2 px-4 bg-white border border-border rounded-xl font-medium text-sm text-foreground hover:bg-slate-50 transition-colors"><Pencil className="w-3.5 h-3.5" />Редактировать</button>
                <button onClick={() => { if (confirm(`Удалить заявку #${lead.id}?`)) { onDelete(lead.id); onClose(); } }} disabled={deletePending} className="flex items-center justify-center gap-2 py-2 px-4 bg-white border border-red-200 rounded-xl font-medium text-sm text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" />В корзину</button>
              </div>
              <button onClick={onClose} className="w-full py-2 text-sm font-medium text-muted-foreground hover:bg-slate-50 rounded-xl transition-colors">Закрыть</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
