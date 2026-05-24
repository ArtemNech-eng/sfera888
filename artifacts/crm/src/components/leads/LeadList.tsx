import { StatusBadge } from "@/components/status-badge";
import {
  Loader2, Search, Filter, X, Calendar, ChevronLeft, ChevronRight,
  Play, Trash2, Eye, Clock, MapPin, Images, ExternalLink,
} from "lucide-react";

interface ServiceItem {
  type: string;
  area: number;
  pricePerM2: number;
}

interface LeadRow {
  id: number;
  clientName: string;
  clientPhone: string;
  city: string;
  district: string | null;
  serviceType: string;
  area: number;
  services: ServiceItem[] | null;
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

const SOURCE_OPTIONS = [
  { value: "call", label: "Входящий звонок" },
  { value: "website", label: "Сайт" },
  { value: "landing", label: "Лендинг" },
  { value: "ads", label: "Реклама" },
  { value: "avito", label: "Авито" },
  { value: "referral", label: "Рекомендация" },
  { value: "repeat", label: "Повторный клиент" },
  { value: "other", label: "Другое" },
];

const LeadStatus = {
  new: "new",
  processing: "processing",
  sent_to_work: "sent_to_work",
  non_target: "non_target",
  client_refusal: "client_refusal",
} as const;

function fmtMoney(n: number) { return n.toLocaleString("ru-RU") + " ₽"; }

function formatDate(d: string) {
  const dt = new Date(d);
  return dt.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function leadAge(lead: LeadRow): { label: string; urgent: boolean; warning: boolean } | null {
  if (lead.status !== "new" && lead.status !== "processing") return null;
  const ms = Date.now() - new Date(lead.createdAt).getTime();
  const m = Math.floor(ms / 60000);
  let label: string;
  if (m < 60) label = `${m} мин`;
  else if (m < 1440) label = `${Math.floor(m / 60)} ч`;
  else label = `${Math.floor(m / 1440)} дн`;
  return { label, urgent: m > 30, warning: m > 15 && m <= 30 };
}

interface LeadListProps {
  leads: LeadRow[];
  activeLeads: LeadRow[];
  loading: boolean;
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: string;
  onStatusChange: (v: string) => void;
  sourceFilter: string;
  onSourceChange: (v: string) => void;
  dateFilter: "all" | "today" | "yesterday" | "week" | "month";
  onDateChange: (v: "all" | "today" | "yesterday" | "week" | "month") => void;
  selectedIds: number[];
  onSelectedIdsChange: (ids: number[]) => void;
  isMobile: boolean;
  onSelectLead: (lead: LeadRow) => void;
  onSendToWork: (lead: LeadRow) => void;
  onOpenOrder: (orderId: number) => void;
  onDeleteLead: (id: number) => void;
  deletePending: boolean;
  deleteTargetId?: number;
}

export default function LeadList({
  leads,
  activeLeads,
  loading,
  total,
  page,
  limit,
  onPageChange,
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  sourceFilter,
  onSourceChange,
  dateFilter,
  onDateChange,
  selectedIds,
  onSelectedIdsChange,
  isMobile,
  onSelectLead,
  onSendToWork,
  onOpenOrder,
  onDeleteLead,
  deletePending,
  deleteTargetId,
}: LeadListProps) {
  const allSelected = leads.length > 0 && leads.every(l => selectedIds.includes(l.id));

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 bg-card p-4 rounded-2xl border border-border/50 shadow-sm flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
          <input type="text" value={search} onChange={e => onSearchChange(e.target.value)} placeholder="Поиск по имени, телефону, городу..." className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
          {search && <button onClick={() => onSearchChange("")} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
        </div>
        <div className="w-full sm:w-44 relative">
          <Filter className="w-4 h-4 absolute left-3 top-3 text-muted-foreground pointer-events-none" />
          <select value={statusFilter} onChange={e => onStatusChange(e.target.value)} className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none text-sm">
            <option value="">Все статусы</option>
            <option value={LeadStatus.new}>Новые</option>
            <option value={LeadStatus.processing}>В обработке</option>
            <option value={LeadStatus.sent_to_work}>Отправлены в работу</option>
            <option value={LeadStatus.non_target}>Нецелевые</option>
            <option value={LeadStatus.client_refusal}>Отказ</option>
          </select>
        </div>
        <div className="w-full sm:w-44 relative">
          <Filter className="w-4 h-4 absolute left-3 top-3 text-muted-foreground pointer-events-none" />
          <select value={sourceFilter} onChange={e => onSourceChange(e.target.value)} className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none text-sm">
            <option value="">Все источники</option>
            {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="w-full sm:w-44 relative">
          <Calendar className="w-4 h-4 absolute left-3 top-3 text-muted-foreground pointer-events-none" />
          <select value={dateFilter} onChange={e => onDateChange(e.target.value as any)} className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none text-sm">
            <option value="all">Все даты</option>
            <option value="today">Сегодня</option>
            <option value="yesterday">Вчера</option>
            <option value="week">Неделя</option>
            <option value="month">Месяц</option>
          </select>
        </div>
        <div className="flex items-center gap-3 self-center">
          {!loading && <span className="text-xs text-muted-foreground whitespace-nowrap">{leads.length} заявок</span>}
          {(statusFilter || sourceFilter || dateFilter !== "all" || search) && (
            <button onClick={() => { onStatusChange(""); onSourceChange(""); onDateChange("all"); onSearchChange(""); }} className="text-xs text-primary hover:underline whitespace-nowrap">Сбросить</button>
          )}
        </div>
      </div>

      {/* Bulk actions */}
      {selectedIds.length > 0 && (
        <div className="w-full flex items-center gap-2 bg-primary/5 border border-primary/20 p-2 rounded-xl">
          <span className="text-xs font-medium text-primary px-2">{selectedIds.length} выбрано</span>
          <div className="flex-1" />
          <button onClick={() => { for (const id of selectedIds) { const lead = leads.find(l => l.id === id); if (lead) onSendToWork(lead); } onSelectedIdsChange([]); }} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"><Play className="w-3 h-3" />Отправить</button>
          <button onClick={() => { if (confirm(`Удалить ${selectedIds.length} заявок?`)) { for (const id of selectedIds) onDeleteLead(id); } onSelectedIdsChange([]); }} disabled={deletePending} className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 disabled:opacity-50 transition-colors"><Trash2 className="w-3 h-3" />Удалить</button>
          <button onClick={() => onSelectedIdsChange([])} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">Отмена</button>
        </div>
      )}

      {/* Table / Cards */}
      {isMobile ? (
        <div className="flex flex-col gap-2">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : leads.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">{search || statusFilter || sourceFilter || dateFilter !== "all" ? "Ничего не найдено" : "Новых заявок нет"}</div>
          ) : leads.map(lead => {
            const srvs = lead.services;
            const estimate = srvs ? srvs.reduce((sum, s) => sum + s.area * (s.pricePerM2 || 0), 0) : 0;
            const sourceName = SOURCE_OPTIONS.find(o => o.value === lead.source)?.label;
            const isActive = lead.status === LeadStatus.new || lead.status === LeadStatus.processing;
            const firstService = srvs && srvs.length > 0 ? srvs[0] : null;
            const serviceLabel = firstService ? `${firstService.type}${srvs!.length > 1 ? ` +${srvs!.length - 1}` : ""}` : lead.serviceType;
            const totalArea2 = srvs ? srvs.reduce((s, r) => s + r.area, 0) : lead.area;
            const age = leadAge(lead);
            const isSelected = selectedIds.includes(lead.id);
            return (
              <div key={lead.id} onClick={() => onSelectLead(lead)} className={`bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden cursor-pointer active:scale-[0.99] transition-transform ${isActive ? "" : "opacity-80"} ${isSelected ? "ring-2 ring-primary/30" : ""}`}>
                <div className="px-4 pt-3 pb-2">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input type="checkbox" checked={isSelected} onChange={e => { e.stopPropagation(); onSelectedIdsChange(e.target.checked ? [...selectedIds, lead.id] : selectedIds.filter(id => id !== lead.id)); }} className="w-4 h-4 rounded border-border accent-primary cursor-pointer" />
                      <StatusBadge status={lead.status} type="lead" />
                      <span className="text-xs font-bold text-foreground/60">#{lead.orderId ?? lead.id}</span>
                      {age && <span className={`text-[10px] font-medium flex items-center gap-0.5 ${age.urgent ? "text-red-500" : age.warning ? "text-orange-500" : "text-muted-foreground"}`}><Clock className="w-2.5 h-2.5" />{age.label}</span>}
                    </div>
                    {estimate > 0 && <span className="text-sm font-bold text-emerald-600 flex-shrink-0">{fmtMoney(estimate)}</span>}
                  </div>
                  <p className="font-semibold text-foreground text-sm truncate">{lead.clientName}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <a href={`tel:${lead.clientPhone}`} onClick={e => e.stopPropagation()} className="text-xs text-blue-600">{lead.clientPhone}</a>
                    <span className="text-xs text-muted-foreground flex items-center gap-0.5"><MapPin className="w-3 h-3" />{lead.city}{lead.district ? `, ${lead.district}` : ""}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{serviceLabel} · {totalArea2} м²</p>
                </div>
                <div className="flex border-t border-border/50 divide-x divide-border/50" onClick={e => e.stopPropagation()}>
                  {isActive && <button onClick={() => onSendToWork(lead)} className="flex-1 flex items-center justify-center gap-1 py-2.5 text-primary hover:bg-primary/5 text-xs font-medium"><Play className="w-3.5 h-3.5" />Отправить</button>}
                  {lead.status === "sent_to_work" && lead.orderId && <button onClick={() => onOpenOrder(lead.orderId!)} className="flex-1 flex items-center justify-center gap-1 py-2.5 text-emerald-700 hover:bg-emerald-50 text-xs font-medium"><ExternalLink className="w-3.5 h-3.5" />Заказ #{lead.orderId}</button>}
                  <button onClick={() => onSelectLead(lead)} className="flex-1 flex items-center justify-center gap-1 py-2.5 text-muted-foreground hover:bg-muted text-xs font-medium"><Eye className="w-3.5 h-3.5" />Открыть</button>
                  <button onClick={() => onDeleteLead(lead.id)} disabled={deletePending} className="flex items-center justify-center px-4 py-2.5 text-muted-foreground/50 hover:text-red-500 hover:bg-red-50 text-xs disabled:opacity-30">{deletePending && deleteTargetId === lead.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50/50 text-muted-foreground font-medium border-b border-border/50 text-xs">
                <tr>
                  <th className="px-2 py-2.5 pl-4 w-8">
                    <input type="checkbox" checked={allSelected} onChange={e => onSelectedIdsChange(e.target.checked ? leads.map(l => l.id) : [])} className="w-4 h-4 rounded border-border accent-primary cursor-pointer" />
                  </th>
                  <th className="px-3 py-2.5">Статус</th>
                  <th className="px-3 py-2.5">ID</th>
                  <th className="px-3 py-2.5">Клиент</th>
                  <th className="px-3 py-2.5">Город · Источник</th>
                  <th className="px-3 py-2.5">Услуги</th>
                  <th className="px-3 py-2.5">Смета</th>
                  <th className="px-3 py-2.5 pr-4 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" /></td></tr>
                ) : leads.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">{search || statusFilter || sourceFilter || dateFilter !== "all" ? "Ничего не найдено" : "Новых заявок нет"}</td></tr>
                ) : leads.map(lead => {
                  const srvs = lead.services;
                  const estimate = srvs ? srvs.reduce((sum, s) => sum + s.area * (s.pricePerM2 || 0), 0) : 0;
                  const sourceName = SOURCE_OPTIONS.find(o => o.value === lead.source)?.label;
                  const isActive = lead.status === LeadStatus.new || lead.status === LeadStatus.processing;
                  const firstService = srvs && srvs.length > 0 ? srvs[0] : null;
                  const serviceLabel = firstService ? `${firstService.type}${srvs!.length > 1 ? ` +${srvs!.length - 1}` : ""}` : lead.serviceType;
                  const totalArea2 = srvs ? srvs.reduce((s, r) => s + r.area, 0) : lead.area;
                  const age = leadAge(lead);
                  const isSelected = selectedIds.includes(lead.id);
                  return (
                    <tr key={lead.id} onClick={() => onSelectLead(lead)} className={`cursor-pointer hover:bg-slate-50 transition-colors ${isActive ? "" : "opacity-75"} ${isSelected ? "bg-primary/5" : ""}`}>
                      <td className="px-2 py-2.5 pl-4" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={isSelected} onChange={e => onSelectedIdsChange(e.target.checked ? [...selectedIds, lead.id] : selectedIds.filter(id => id !== lead.id))} className="w-4 h-4 rounded border-border accent-primary cursor-pointer" />
                      </td>
                      <td className="px-3 py-2.5 pl-4">
                        <StatusBadge status={lead.status} type="lead" />
                        {lead.scheduledAt && <div className="flex items-center gap-1 mt-0.5 text-[10px] text-blue-500 font-medium"><Clock className="w-2.5 h-2.5" />{new Date(lead.scheduledAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}</div>}
                        {age && <div className={`flex items-center gap-0.5 mt-0.5 text-[10px] font-medium ${age.urgent ? "text-red-500" : age.warning ? "text-orange-500" : "text-muted-foreground"}`}><Clock className="w-2.5 h-2.5" />{age.label}</div>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="font-semibold text-foreground">#{lead.orderId ?? lead.id}</span>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{formatDate(lead.createdAt)}</div>
                      </td>
                      <td className="px-3 py-2.5 max-w-[160px]">
                        <p className="font-medium text-foreground truncate">{lead.clientName}</p>
                        <a href={`tel:${lead.clientPhone}`} onClick={e => e.stopPropagation()} className="text-xs text-blue-600 hover:underline">{lead.clientPhone}</a>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <p className="text-sm text-foreground">{lead.city}</p>
                        {lead.district && <p className="text-[10px] text-muted-foreground">{lead.district}</p>}
                        {sourceName && <p className="text-[10px] text-muted-foreground/70">{sourceName}</p>}
                      </td>
                      <td className="px-3 py-2.5 max-w-[180px]">
                        <p className="text-sm text-foreground truncate">{serviceLabel}</p>
                        <p className="text-xs text-muted-foreground">{totalArea2} м²</p>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {estimate > 0 ? <span className="font-semibold text-emerald-600">{fmtMoney(estimate)}</span> : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-3 py-2.5 pr-4">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {(lead.photos?.length ?? 0) > 0 && <span className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5"><Images className="w-2.5 h-2.5" />{lead.photos!.length}</span>}
                          {lead.status === "sent_to_work" && lead.orderId && (
                            <button onClick={e => { e.stopPropagation(); onOpenOrder(lead.orderId!); }} className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-medium hover:bg-emerald-100 transition-colors"><ExternalLink className="w-2.5 h-2.5" />Заказ #{lead.orderId}</button>
                          )}
                          {isActive && (
                            <button onClick={e => { e.stopPropagation(); onSendToWork(lead); }} className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium hover:bg-primary/20 transition-colors"><Play className="w-2.5 h-2.5" />Отправить</button>
                          )}
                          <button onClick={e => { e.stopPropagation(); onDeleteLead(lead.id); }} disabled={deletePending} title="В корзину" className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground/30 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-30">{deletePending && deleteTargetId === lead.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between bg-card p-3 rounded-2xl border border-border/50 shadow-sm mt-2">
          <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1 || loading} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronLeft className="w-4 h-4" />Назад</button>
          <span className="text-sm text-muted-foreground">Страница <span className="font-semibold text-foreground">{page}</span> из {Math.ceil(total / limit)} <span className="text-muted-foreground/60">({total} всего)</span></span>
          <button onClick={() => onPageChange(page + 1)} disabled={page >= Math.ceil(total / limit) || loading} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Вперёд<ChevronRight className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}
