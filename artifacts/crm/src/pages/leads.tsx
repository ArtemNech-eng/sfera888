import { useState } from "react";
import { Layout } from "@/components/layout";
import { useGetLeads, useCreateLead, useSendLeadToBuffer, useGetCities, useGetServices, LeadStatus } from "@workspace/api-client-react";
import { ProtectedRoute } from "@/hooks/use-auth";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import { Loader2, Plus, Search, Filter, Play, Trash2, User, Phone, MapPin, ChevronDown, Sparkles, Images } from "lucide-react";
import { PhotoUploader } from "@/components/photo-uploader";
import { useQueryClient } from "@tanstack/react-query";

interface ServiceRow {
  type: string;
  area: string;
  pricePerM2: string;
}

export default function Leads() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const queryClient = useQueryClient();

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
  });

  const [serviceRows, setServiceRows] = useState<ServiceRow[]>([
    { type: "", area: "", pricePerM2: "" },
  ]);
  const [photosPaths, setPhotosPaths] = useState<string[]>([]);

  const resetForm = () => {
    setFormData({ clientName: "", clientPhone: "", city: "", district: "", comment: "" });
    setServiceRows([{ type: "", area: "", pricePerM2: "" }]);
    setPhotosPaths([]);
  };

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
    <ProtectedRoute allowedRoles={['admin', 'lead_operator']}>
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
                placeholder="Поиск по имени или телефону..."
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
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
                  ) : leads?.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                        Заявок не найдено
                      </td>
                    </tr>
                  ) : leads?.map((lead) => {
                    const srvs = (lead as any).services as Array<{type: string; area: number; pricePerM2: number}> | null;
                    const estimate = srvs ? srvs.reduce((sum, s) => sum + s.area * (s.pricePerM2 || 0), 0) : 0;
                    return (
                      <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="font-medium text-foreground">#{lead.id}</span>
                          <div className="text-xs text-muted-foreground mt-1">{formatDate(lead.createdAt)}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-foreground">{lead.clientName}</div>
                          <div className="text-xs text-muted-foreground mt-1">{lead.clientPhone}</div>
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
                          {(lead.status === LeadStatus.new || lead.status === LeadStatus.processing) && (
                            <button
                              onClick={() => sendToWorkMutation.mutate({ id: lead.id })}
                              disabled={sendToWorkMutation.isPending}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground rounded-lg font-medium text-xs transition-colors"
                            >
                              <Play className="w-3 h-3" /> В работу
                            </button>
                          )}
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
      </Layout>
    </ProtectedRoute>
  );
}
