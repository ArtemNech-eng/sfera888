import { useState, useMemo } from "react";
import { Layout } from "@/components/layout";
import { useGetLeads, useCreateLead, useSendLeadToBuffer, useGetCities, useGetServices, LeadStatus } from "@workspace/api-client-react";
import { ProtectedRoute } from "@/hooks/use-auth";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import { Loader2, Plus, Search, Filter, Play, Trash2, User, Phone, MapPin, ChevronDown, Sparkles, Images, Pencil, X, Calendar, Radio, Save } from "lucide-react";
import { PhotoUploader } from "@/components/photo-uploader";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface ServiceRow {
  type: string;
  area: string;
  pricePerM2: string;
}

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
}

const SOURCE_OPTIONS = [
  { value: "call", label: "Входящий звонок" },
  { value: "website", label: "Сайт" },
  { value: "ads", label: "Реклама" },
  { value: "referral", label: "Рекомендация" },
  { value: "repeat", label: "Повторный клиент" },
  { value: "other", label: "Другое" },
];

export default function Leads() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<LeadRow | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteLeadMutation = useMutation({
    mutationFn: (id: number) => fetch(`/api/leads/${id}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Перемещено в корзину", description: "Заявка будет удалена через 30 дней. Восстановите в разделе «Корзина»." });
    },
  });

  const { data: leads, isLoading } = useGetLeads(
    { status: statusFilter || undefined },
    { query: { refetchInterval: 10000 } }
  );

  const { data: cities } = useGetCities();
  const { data: services } = useGetServices();

  const createMutation = useCreateLead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
        setIsCreateOpen(false);
        resetForm();
      }
    }
  });

  const sendToWorkMutation = useSendLeadToBuffer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      }
    }
  });

  const [formData, setFormData] = useState({
    clientName: "",
    clientPhone: "",
    city: "",
    district: "",
    comment: "",
    scheduledAt: "",
    source: "",
  });

  const [serviceRows, setServiceRows] = useState<ServiceRow[]>([
    { type: "", area: "", pricePerM2: "" },
  ]);
  const [photosPaths, setPhotosPaths] = useState<string[]>([]);

  const resetForm = () => {
    setFormData({ clientName: "", clientPhone: "", city: "", district: "", comment: "", scheduledAt: "", source: "" });
    setServiceRows([{ type: "", area: "", pricePerM2: "" }]);
    setPhotosPaths([]);
  };

  // Edit form state (separate from create)
  const [editFormData, setEditFormData] = useState({
    clientName: "",
    clientPhone: "",
    city: "",
    district: "",
    comment: "",
    scheduledAt: "",
    source: "",
    status: "",
  });
  const [editServiceRows, setEditServiceRows] = useState<ServiceRow[]>([{ type: "", area: "", pricePerM2: "" }]);
  const [editPhotosPaths, setEditPhotosPaths] = useState<string[]>([]);

  const openEditModal = (lead: LeadRow) => {
    setEditingLead(lead);
    setEditFormData({
      clientName: lead.clientName,
      clientPhone: lead.clientPhone,
      city: lead.city,
      district: lead.district ?? "",
      comment: lead.comment ?? "",
      scheduledAt: lead.scheduledAt ? lead.scheduledAt.slice(0, 16) : "",
      source: lead.source ?? "",
      status: lead.status,
    });
    setEditServiceRows(
      lead.services && lead.services.length > 0
        ? lead.services.map(s => ({ type: s.type, area: String(s.area), pricePerM2: String(s.pricePerM2 ?? "") }))
        : [{ type: lead.serviceType, area: String(lead.area), pricePerM2: "" }]
    );
    setEditPhotosPaths(lead.photos ?? []);
  };

  const closeEditModal = () => {
    setEditingLead(null);
    setEditFormData({ clientName: "", clientPhone: "", city: "", district: "", comment: "", scheduledAt: "", source: "", status: "" });
    setEditServiceRows([{ type: "", area: "", pricePerM2: "" }]);
    setEditPhotosPaths([]);
  };

  const editMutation = useMutation({
    mutationFn: async (id: number) => {
      const validRows = editServiceRows.filter(r => r.type && r.area);
      const services = validRows.map(r => ({
        type: r.type,
        area: parseFloat(r.area),
        pricePerM2: parseFloat(r.pricePerM2) || 0,
      }));
      const body: any = {
        ...editFormData,
        services,
        photos: editPhotosPaths,
        scheduledAt: editFormData.scheduledAt || null,
        source: editFormData.source || null,
        comment: editFormData.comment || null,
      };
      const r = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Ошибка сохранения");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Заявка обновлена" });
      closeEditModal();
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const editAddRow = () => setEditServiceRows(r => [...r, { type: "", area: "", pricePerM2: "" }]);
  const editRemoveRow = (i: number) => setEditServiceRows(r => r.filter((_, idx) => idx !== i));
  const editUpdateRow = (i: number, field: keyof ServiceRow, value: string) =>
    setEditServiceRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: value } : row));

  const editTotalArea = editServiceRows.reduce((sum, r) => sum + (parseFloat(r.area) || 0), 0);
  const editTotalEstimate = editServiceRows.reduce((sum, r) => sum + (parseFloat(r.area) || 0) * (parseFloat(r.pricePerM2) || 0), 0);

  const addRow = () => setServiceRows(r => [...r, { type: "", area: "", pricePerM2: "" }]);
  const removeRow = (i: number) => setServiceRows(r => r.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: keyof ServiceRow, value: string) =>
    setServiceRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: value } : row));

  const totalArea = serviceRows.reduce((sum, r) => sum + (parseFloat(r.area) || 0), 0);
  const totalEstimate = serviceRows.reduce((sum, r) => {
    const area = parseFloat(r.area) || 0;
    const price = parseFloat(r.pricePerM2) || 0;
    return sum + area * price;
  }, 0);

  const filteredLeads = useMemo(() => {
    if (!leads) return [];
    const q = searchQuery.trim().toLowerCase();
    return (leads as unknown as LeadRow[]).filter(l => {
      if (q) {
        const matches =
          l.clientName?.toLowerCase().includes(q) ||
          l.clientPhone?.toLowerCase().includes(q) ||
          l.city?.toLowerCase().includes(q) ||
          l.district?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [leads, searchQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validRows = serviceRows.filter(r => r.type && r.area);
    if (validRows.length === 0) return;
    const srvs = validRows.map(r => ({
      type: r.type,
      area: parseFloat(r.area),
      pricePerM2: parseFloat(r.pricePerM2) || 0,
    }));
    createMutation.mutate({
      data: {
        ...formData,
        services: srvs as any,
        serviceType: srvs.map(s => s.type).join(", "),
        area: srvs.reduce((sum, s) => sum + s.area, 0),
        photos: photosPaths.length > 0 ? photosPaths as any : undefined,
      }
    });
  };

  const fmt = (n: number) => n.toLocaleString("ru-RU") + " ₽";

  return (
    <ProtectedRoute allowedRoles={['admin', 'lead_operator', 'master_operator']} permissionKey="leads">
      <Layout>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">Заявки</h1>
              <p className="text-muted-foreground mt-1">Управление входящими обращениями</p>
            </div>
            <button 
              onClick={() => setIsCreateOpen(true)}
              className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20"
            >
              <Plus className="w-4 h-4" /> Новая заявка
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-2xl border border-border/50 shadow-sm">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <input 
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Поиск по имени, телефону, городу..."
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="w-full sm:w-64 relative">
              <Filter className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <select 
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none"
              >
                <option value="">Все статусы</option>
                <option value={LeadStatus.new}>Новые</option>
                <option value={LeadStatus.processing}>В обработке</option>
                <option value={LeadStatus.sent_to_work}>Отправлены в работу</option>
                <option value={LeadStatus.non_target}>Нецелевые</option>
                <option value={LeadStatus.client_refusal}>Отказ</option>
              </select>
            </div>
            {!isLoading && (
              <div className="flex items-center text-xs text-muted-foreground whitespace-nowrap self-center">
                {filteredLeads.length} {filteredLeads.length === 1 ? "заявка" : filteredLeads.length < 5 ? "заявки" : "заявок"}
                {leads && filteredLeads.length !== leads.length && (
                  <span className="text-muted-foreground/50 ml-1">из {leads.length}</span>
                )}
              </div>
            )}
          </div>

          {/* Table */}
          <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50/50 text-muted-foreground font-medium border-b border-border/50">
                  <tr>
                    <th className="px-6 py-4">ID / Дата</th>
                    <th className="px-6 py-4">Клиент</th>
                    <th className="px-6 py-4">Локация</th>
                    <th className="px-6 py-4">Услуги</th>
                    <th className="px-4 py-4">Фото</th>
                    <th className="px-6 py-4">Статус</th>
                    <th className="px-6 py-4 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center">
                        <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
                      </td>
                    </tr>
                  ) : filteredLeads.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                        {searchQuery ? "Ничего не найдено по запросу" : "Заявок не найдено"}
                      </td>
                    </tr>
                  ) : filteredLeads.map((lead) => {
                    const srvs = lead.services;
                    const estimate = srvs ? srvs.reduce((sum, s) => sum + s.area * (s.pricePerM2 || 0), 0) : 0;
                    const sourceName = SOURCE_OPTIONS.find(o => o.value === lead.source)?.label;
                    return (
                      <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="font-medium text-foreground">#{lead.id}</span>
                          <div className="text-xs text-muted-foreground mt-1">{formatDate(lead.createdAt)}</div>
                          {lead.scheduledAt && (
                            <div className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded-full">
                              <Calendar className="w-2.5 h-2.5" />
                              {new Date(lead.scheduledAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-foreground">{lead.clientName}</div>
                          <div className="text-xs text-muted-foreground mt-1">{lead.clientPhone}</div>
                          {sourceName && (
                            <div className="text-[10px] mt-1 text-slate-400">{sourceName}</div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-foreground">{lead.city}</div>
                          <div className="text-xs text-muted-foreground mt-1">{lead.district}</div>
                        </td>
                        <td className="px-6 py-4 max-w-[280px]">
                          {srvs && srvs.length > 0 ? (
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap gap-1.5">
                                {srvs.map((s, i) => {
                                  const lineTotal = s.area * (s.pricePerM2 || 0);
                                  return (
                                    <div key={i} className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                                      <span className="text-xs font-medium text-slate-700">{s.type}</span>
                                      <span className="w-px h-3 bg-slate-300" />
                                      <span className="text-xs text-slate-500">{s.area} м²</span>
                                      {lineTotal > 0 && (
                                        <>
                                          <span className="w-px h-3 bg-slate-300" />
                                          <span className="text-xs font-semibold text-emerald-600">{lineTotal.toLocaleString("ru-RU")} ₽</span>
                                        </>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              {estimate > 0 && (
                                <div className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                                  <span>Итого:</span>
                                  <span>{fmt(estimate)}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                              <span className="text-xs font-medium text-slate-700">{lead.serviceType}</span>
                              <span className="w-px h-3 bg-slate-300" />
                              <span className="text-xs text-slate-500">{lead.area} м²</span>
                            </div>
                          )}
                        </td>
                        {/* Photos thumbnails */}
                        <td className="px-4 py-4">
                          {(() => {
                            const photos = (lead as any).photos as string[] | null;
                            if (!photos || photos.length === 0) return <span className="text-xs text-gray-300">—</span>;
                            return (
                              <div className="flex items-center gap-1">
                                {photos.slice(0, 3).map((p, i) => (
                                  <img
                                    key={i}
                                    src={`/api/storage${p}`}
                                    alt=""
                                    className="w-9 h-9 rounded-lg object-cover border border-gray-200 shadow-sm"
                                  />
                                ))}
                                {photos.length > 3 && (
                                  <span className="w-9 h-9 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-xs font-semibold text-gray-500">
                                    +{photos.length - 3}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={lead.status} type="lead" />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {(lead.status === LeadStatus.new || lead.status === LeadStatus.processing) && (
                              <button
                                onClick={() => sendToWorkMutation.mutate({ id: lead.id })}
                                disabled={sendToWorkMutation.isPending}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground rounded-lg font-medium text-xs transition-colors"
                              >
                                <Play className="w-3 h-3" /> В работу
                              </button>
                            )}
                            <button
                              onClick={() => openEditModal(lead)}
                              title="Редактировать"
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-all"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteLeadMutation.mutate(lead.id)}
                              title="В корзину"
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/30 hover:text-red-500 hover:bg-red-50 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Create Modal */}
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(6px)" }}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200" style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)" }}>

              {/* Header */}
              <div className="relative px-7 pt-7 pb-5 flex items-center justify-between flex-shrink-0">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-primary" />
                    </div>
                    <h2 className="text-xl font-display font-bold text-gray-900">Новая заявка</h2>
                  </div>
                  <p className="text-sm text-gray-400 ml-10">Заполните данные клиента и список работ</p>
                </div>
                <button
                  onClick={() => { setIsCreateOpen(false); resetForm(); }}
                  className="w-9 h-9 flex items-center justify-center rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-all"
                >
                  ✕
                </button>
              </div>

              {/* Scrollable body */}
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-y-auto">
                <div className="px-7 pb-6 space-y-5">

                  {/* Client section */}
                  <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4 space-y-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Клиент</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700">Имя клиента</label>
                        <div className="relative">
                          <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            required
                            value={formData.clientName}
                            onChange={e => setFormData({...formData, clientName: e.target.value})}
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm transition-all"
                            placeholder="Иван Иванов"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700">Телефон</label>
                        <div className="relative">
                          <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            required
                            value={formData.clientPhone}
                            onChange={e => setFormData({...formData, clientPhone: e.target.value})}
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm transition-all"
                            placeholder="+7 999 000-00-00"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700">Город</label>
                        <div className="relative">
                          <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                          <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                          <select
                            required
                            value={formData.city}
                            onChange={e => setFormData({...formData, city: e.target.value})}
                            className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm appearance-none transition-all"
                          >
                            <option value="">Выберите город</option>
                            {cities?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700">Район</label>
                        <input
                          required
                          value={formData.district}
                          onChange={e => setFormData({...formData, district: e.target.value})}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm transition-all"
                          placeholder="Центральный"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          Дата выезда
                          <span className="text-gray-400 font-normal text-xs ml-auto">необязательно</span>
                        </label>
                        <input
                          type="datetime-local"
                          value={formData.scheduledAt}
                          onChange={e => setFormData({...formData, scheduledAt: e.target.value})}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm transition-all"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                          <Radio className="w-3.5 h-3.5 text-gray-400" />
                          Источник
                          <span className="text-gray-400 font-normal text-xs ml-auto">необязательно</span>
                        </label>
                        <div className="relative">
                          <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                          <select
                            value={formData.source}
                            onChange={e => setFormData({...formData, source: e.target.value})}
                            className="w-full px-3 pr-8 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm appearance-none transition-all"
                          >
                            <option value="">Выберите источник</option>
                            {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Services section */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Услуги</p>
                      {(totalArea > 0 || totalEstimate > 0) && (
                        <div className="flex items-center gap-3 text-xs">
                          {totalArea > 0 && (
                            <span className="text-gray-500">Итого: <b className="text-gray-700">{totalArea} м²</b></span>
                          )}
                          {totalEstimate > 0 && (
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-0.5 rounded-full border border-emerald-100">
                              ≈ {fmt(totalEstimate)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
                      {/* Table header */}
                      <div className="grid items-center bg-gray-50 border-b border-gray-100 px-3 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide" style={{ gridTemplateColumns: "1fr 80px 100px 90px 32px" }}>
                        <span>Тип услуги</span>
                        <span className="text-center">м²</span>
                        <span className="text-center">₽/м²</span>
                        <span className="text-right pr-2">Итого</span>
                        <span />
                      </div>

                      {/* Rows */}
                      <div className="divide-y divide-gray-100">
                        {serviceRows.map((row, i) => {
                          const rowTotal = (parseFloat(row.area) || 0) * (parseFloat(row.pricePerM2) || 0);
                          return (
                            <div key={i} className="group px-3 py-1.5" style={{ gridTemplateColumns: "1fr 80px 100px 90px 32px", display: "grid", alignItems: "center", gap: 0 }}>
                              {/* Service type */}
                              <div className="relative">
                                <select
                                  required
                                  value={row.type}
                                  onChange={e => updateRow(i, "type", e.target.value)}
                                  className="w-full pl-2 pr-6 py-2 text-sm rounded-lg border border-transparent bg-transparent hover:bg-gray-50 hover:border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none appearance-none transition-all cursor-pointer"
                                >
                                  <option value="">Выберите...</option>
                                  {services?.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                </select>
                                <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                              </div>

                              {/* Area */}
                              <input
                                required
                                type="number"
                                min="0.1"
                                step="0.1"
                                value={row.area}
                                onChange={e => updateRow(i, "area", e.target.value)}
                                placeholder="—"
                                className="px-2 py-2 text-sm rounded-lg border border-transparent bg-transparent hover:bg-gray-50 hover:border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none text-center transition-all w-full"
                              />

                              {/* Price per m² */}
                              <div className="relative px-1">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={row.pricePerM2}
                                  onChange={e => updateRow(i, "pricePerM2", e.target.value)}
                                  placeholder="—"
                                  className="w-full pl-2 pr-5 py-2 text-sm rounded-lg border border-transparent bg-transparent hover:bg-gray-50 hover:border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none text-center transition-all"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">₽</span>
                              </div>

                              {/* Row total — always visible */}
                              <div className="text-right pr-2">
                                {rowTotal > 0 ? (
                                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                    {rowTotal.toLocaleString("ru-RU")} ₽
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-300">—</span>
                                )}
                              </div>

                              {/* Delete */}
                              <button
                                type="button"
                                onClick={() => removeRow(i)}
                                disabled={serviceRows.length === 1}
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 disabled:opacity-0 disabled:pointer-events-none transition-all mx-auto"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Add row */}
                      <div className="border-t border-dashed border-gray-200">
                        <button
                          type="button"
                          onClick={addRow}
                          className="w-full py-3 flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-primary hover:bg-primary/5 transition-all"
                        >
                          <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                            <Plus className="w-3 h-3" />
                          </div>
                          Добавить услугу
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Comment + Photos */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Комментарий</label>
                      <textarea
                        value={formData.comment}
                        onChange={e => setFormData({...formData, comment: e.target.value})}
                        rows={4}
                        placeholder="Дополнительная информация по заявке..."
                        className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none resize-none text-sm transition-all h-full min-h-[100px]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                        <Images className="w-3.5 h-3.5" />
                        Фотографии
                        {photosPaths.length > 0 && (
                          <span className="ml-auto text-primary font-bold">{photosPaths.length}</span>
                        )}
                      </label>
                      <PhotoUploader
                        value={photosPaths}
                        onChange={setPhotosPaths}
                        maxPhotos={8}
                      />
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-7 py-5 border-t border-gray-100 flex items-center justify-between flex-shrink-0 bg-gray-50/50 rounded-b-3xl">
                  {totalEstimate > 0 ? (
                    <div className="text-sm">
                      <span className="text-gray-500">Смета:</span>
                      <span className="ml-2 font-bold text-emerald-600 text-base">{fmt(totalEstimate)}</span>
                      {totalArea > 0 && <span className="ml-2 text-gray-400 text-xs">{totalArea} м²</span>}
                    </div>
                  ) : (
                    <div />
                  )}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => { setIsCreateOpen(false); resetForm(); }}
                      className="px-5 py-2.5 rounded-xl font-medium text-gray-500 hover:bg-gray-200 transition-colors text-sm"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      disabled={createMutation.isPending || serviceRows.every(r => !r.type || !r.area)}
                      className="px-6 py-2.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50 transition-all text-sm shadow-sm shadow-primary/30"
                    >
                      {createMutation.isPending
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Sparkles className="w-4 h-4" />}
                      Создать заявку
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editingLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(6px)" }}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200" style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)" }}>

              {/* Header */}
              <div className="relative px-7 pt-7 pb-5 flex items-center justify-between flex-shrink-0">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
                      <Pencil className="w-4 h-4 text-amber-600" />
                    </div>
                    <h2 className="text-xl font-display font-bold text-gray-900">Редактировать заявку #{editingLead.id}</h2>
                  </div>
                  <p className="text-sm text-gray-400 ml-10">Изменения сохранятся сразу после нажатия «Сохранить»</p>
                </div>
                <button onClick={closeEditModal} className="w-9 h-9 flex items-center justify-center rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-all">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable body */}
              <form onSubmit={e => { e.preventDefault(); editMutation.mutate(editingLead.id); }} className="flex flex-col flex-1 overflow-y-auto">
                <div className="px-7 pb-6 space-y-5">

                  {/* Client section */}
                  <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4 space-y-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Клиент</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700">Имя клиента</label>
                        <div className="relative">
                          <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input required value={editFormData.clientName} onChange={e => setEditFormData({...editFormData, clientName: e.target.value})}
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm transition-all" placeholder="Иван Иванов" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700">Телефон</label>
                        <div className="relative">
                          <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input required value={editFormData.clientPhone} onChange={e => setEditFormData({...editFormData, clientPhone: e.target.value})}
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm transition-all" placeholder="+7 999 000-00-00" />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700">Город</label>
                        <div className="relative">
                          <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                          <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                          <select required value={editFormData.city} onChange={e => setEditFormData({...editFormData, city: e.target.value})}
                            className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm appearance-none transition-all">
                            <option value="">Выберите город</option>
                            {cities?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700">Район</label>
                        <input required value={editFormData.district} onChange={e => setEditFormData({...editFormData, district: e.target.value})}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm transition-all" placeholder="Центральный" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />Дата выезда
                          <span className="text-gray-400 font-normal text-xs ml-auto">необязательно</span>
                        </label>
                        <input type="datetime-local" value={editFormData.scheduledAt} onChange={e => setEditFormData({...editFormData, scheduledAt: e.target.value})}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm transition-all" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                          <Radio className="w-3.5 h-3.5 text-gray-400" />Источник
                        </label>
                        <div className="relative">
                          <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                          <select value={editFormData.source} onChange={e => setEditFormData({...editFormData, source: e.target.value})}
                            className="w-full px-3 pr-8 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm appearance-none transition-all">
                            <option value="">Не указан</option>
                            {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700">Статус заявки</label>
                      <div className="relative">
                        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        <select value={editFormData.status} onChange={e => setEditFormData({...editFormData, status: e.target.value})}
                          className="w-full px-3 pr-8 py-2.5 rounded-xl border border-gray-200 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none text-sm appearance-none transition-all">
                          <option value="new">Новая</option>
                          <option value="processing">В обработке</option>
                          <option value="sent_to_work">Отправлена в работу</option>
                          <option value="non_target">Нецелевая</option>
                          <option value="client_refusal">Отказ клиента</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Services */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Услуги</p>
                      {(editTotalArea > 0 || editTotalEstimate > 0) && (
                        <div className="flex items-center gap-3 text-xs">
                          {editTotalArea > 0 && <span className="text-gray-500">Итого: <b className="text-gray-700">{editTotalArea} м²</b></span>}
                          {editTotalEstimate > 0 && (
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-0.5 rounded-full border border-emerald-100">≈ {fmt(editTotalEstimate)}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
                      <div className="grid items-center bg-gray-50 border-b border-gray-100 px-3 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide" style={{ gridTemplateColumns: "1fr 80px 100px 90px 32px" }}>
                        <span>Тип услуги</span><span className="text-center">м²</span><span className="text-center">₽/м²</span><span className="text-right pr-2">Итого</span><span />
                      </div>
                      <div className="divide-y divide-gray-100">
                        {editServiceRows.map((row, i) => {
                          const rowTotal = (parseFloat(row.area) || 0) * (parseFloat(row.pricePerM2) || 0);
                          return (
                            <div key={i} className="px-3 py-1.5" style={{ gridTemplateColumns: "1fr 80px 100px 90px 32px", display: "grid", alignItems: "center", gap: 0 }}>
                              <div className="relative">
                                <select required value={row.type} onChange={e => editUpdateRow(i, "type", e.target.value)}
                                  className="w-full pl-2 pr-6 py-2 text-sm rounded-lg border border-transparent bg-transparent hover:bg-gray-50 hover:border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none appearance-none transition-all cursor-pointer">
                                  <option value="">Выберите...</option>
                                  {services?.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                </select>
                                <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                              </div>
                              <input required type="number" min="0.1" step="0.1" value={row.area} onChange={e => editUpdateRow(i, "area", e.target.value)}
                                className="w-full pl-2 pr-5 py-2 text-sm rounded-lg border border-transparent bg-transparent hover:bg-gray-50 hover:border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none text-center transition-all" placeholder="0" />
                              <div className="relative">
                                <input type="number" min="0" step="1" value={row.pricePerM2} onChange={e => editUpdateRow(i, "pricePerM2", e.target.value)}
                                  className="w-full pl-2 pr-5 py-2 text-sm rounded-lg border border-transparent bg-transparent hover:bg-gray-50 hover:border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none text-center transition-all" placeholder="0" />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">₽</span>
                              </div>
                              <div className="text-right pr-2">
                                {rowTotal > 0 ? <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{rowTotal.toLocaleString("ru-RU")} ₽</span> : <span className="text-xs text-gray-300">—</span>}
                              </div>
                              <button type="button" onClick={() => editRemoveRow(i)} disabled={editServiceRows.length === 1}
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 disabled:opacity-0 disabled:pointer-events-none transition-all mx-auto">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <div className="border-t border-dashed border-gray-200">
                        <button type="button" onClick={editAddRow}
                          className="w-full py-3 flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-primary hover:bg-primary/5 transition-all">
                          <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center"><Plus className="w-3 h-3" /></div>
                          Добавить услугу
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Comment + Photos */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Комментарий</label>
                      <textarea value={editFormData.comment} onChange={e => setEditFormData({...editFormData, comment: e.target.value})}
                        rows={4} placeholder="Дополнительная информация..."
                        className="w-full px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50/60 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white outline-none resize-none text-sm transition-all h-full min-h-[100px]" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                        <Images className="w-3.5 h-3.5" />Фотографии
                        {editPhotosPaths.length > 0 && <span className="ml-auto text-primary font-bold">{editPhotosPaths.length}</span>}
                      </label>
                      <PhotoUploader value={editPhotosPaths} onChange={setEditPhotosPaths} maxPhotos={8} />
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-7 py-5 border-t border-gray-100 flex items-center justify-between flex-shrink-0 bg-gray-50/50 rounded-b-3xl">
                  {editTotalEstimate > 0 ? (
                    <div className="text-sm">
                      <span className="text-gray-500">Смета:</span>
                      <span className="ml-2 font-bold text-emerald-600 text-base">{fmt(editTotalEstimate)}</span>
                      {editTotalArea > 0 && <span className="ml-2 text-gray-400 text-xs">{editTotalArea} м²</span>}
                    </div>
                  ) : <div />}
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={closeEditModal}
                      className="px-5 py-2.5 rounded-xl font-medium text-gray-500 hover:bg-gray-200 transition-colors text-sm">
                      Отмена
                    </button>
                    <button type="submit" disabled={editMutation.isPending || editServiceRows.every(r => !r.type || !r.area)}
                      className="px-6 py-2.5 bg-amber-500 text-white rounded-xl font-semibold hover:bg-amber-600 flex items-center gap-2 disabled:opacity-50 transition-all text-sm shadow-sm shadow-amber-500/30">
                      {editMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Сохранить
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </Layout>
    </ProtectedRoute>
  );
}
