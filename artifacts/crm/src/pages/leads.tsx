import { useState } from "react";
import { Layout } from "@/components/layout";
import { useGetLeads, useCreateLead, useSendLeadToBuffer, useGetCities, useGetServices, LeadStatus } from "@workspace/api-client-react";
import { ProtectedRoute } from "@/hooks/use-auth";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import { Loader2, Plus, Search, Filter, Play, Trash2 } from "lucide-react";
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

  const resetForm = () => {
    setFormData({ clientName: "", clientPhone: "", city: "", district: "", comment: "" });
    setServiceRows([{ type: "", area: "", pricePerM2: "" }]);
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
                        <td className="px-6 py-4 max-w-[260px]">
                          {srvs && srvs.length > 0 ? (
                            <div className="space-y-1">
                              {srvs.map((s, i) => (
                                <div key={i} className="text-xs">
                                  <span className="font-medium text-foreground">{s.type}</span>
                                  <span className="text-muted-foreground ml-1">{s.area} м²</span>
                                  {s.pricePerM2 > 0 && (
                                    <span className="text-muted-foreground ml-1">× {s.pricePerM2.toLocaleString("ru-RU")} ₽/м²</span>
                                  )}
                                </div>
                              ))}
                              {estimate > 0 && (
                                <div className="text-xs font-semibold text-green-700 mt-0.5">≈ {fmt(estimate)}</div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <div className="text-foreground">{lead.serviceType}</div>
                              <div className="text-xs text-muted-foreground mt-1">{lead.area} м²</div>
                            </div>
                          )}
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
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
              <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between sticky top-0 bg-card z-10">
                <h2 className="text-lg font-display font-bold text-foreground">Новая заявка</h2>
                <button onClick={() => { setIsCreateOpen(false); resetForm(); }} className="text-muted-foreground hover:text-foreground">✕</button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-5">

                {/* Client info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Имя клиента</label>
                    <input required value={formData.clientName} onChange={e => setFormData({...formData, clientName: e.target.value})} className="w-full px-3 py-2 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Телефон</label>
                    <input required value={formData.clientPhone} onChange={e => setFormData({...formData, clientPhone: e.target.value})} className="w-full px-3 py-2 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none" placeholder="+7..." />
                  </div>
                </div>

                {/* Location */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Город</label>
                    <select required value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="w-full px-3 py-2 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-background">
                      <option value="">Выберите город</option>
                      {cities?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Район</label>
                    <input required value={formData.district} onChange={e => setFormData({...formData, district: e.target.value})} className="w-full px-3 py-2 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                  </div>
                </div>

                {/* Services */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Услуги</label>
                    {(totalArea > 0 || totalEstimate > 0) && (
                      <span className="text-xs text-muted-foreground">
                        Итого: {totalArea} м²
                        {totalEstimate > 0 && <span className="ml-2 font-semibold text-green-700">≈ {fmt(totalEstimate)}</span>}
                      </span>
                    )}
                  </div>

                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="grid grid-cols-[1fr_90px_110px_32px] gap-0 bg-slate-50/70 border-b border-border/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                      <span>Тип услуги</span>
                      <span>Площадь, м²</span>
                      <span>Цена, ₽/м²</span>
                      <span />
                    </div>
                    <div className="divide-y divide-border/50">
                      {serviceRows.map((row, i) => (
                        <div key={i} className="grid grid-cols-[1fr_90px_110px_32px] gap-0 items-center px-3 py-2">
                          <select
                            required
                            value={row.type}
                            onChange={e => updateRow(i, "type", e.target.value)}
                            className="w-full pr-2 py-1.5 text-sm rounded-lg border border-transparent hover:border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-transparent"
                          >
                            <option value="">Выберите...</option>
                            {services?.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                          </select>
                          <input
                            required
                            type="number"
                            min="0.1"
                            step="0.1"
                            value={row.area}
                            onChange={e => updateRow(i, "area", e.target.value)}
                            placeholder="0"
                            className="w-full px-2 py-1.5 text-sm rounded-lg border border-transparent hover:border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-right"
                          />
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={row.pricePerM2}
                              onChange={e => updateRow(i, "pricePerM2", e.target.value)}
                              placeholder="0"
                              className="w-full pl-2 pr-7 py-1.5 text-sm rounded-lg border border-transparent hover:border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none text-right"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₽</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeRow(i)}
                            disabled={serviceRows.length === 1}
                            className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-red-500 disabled:opacity-30 transition-colors rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={addRow}
                    className="w-full py-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="w-3.5 h-3.5" /> Добавить услугу
                  </button>
                </div>

                {/* Comment */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Комментарий (необязательно)</label>
                  <textarea value={formData.comment} onChange={e => setFormData({...formData, comment: e.target.value})} rows={2} className="w-full px-3 py-2 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none" />
                </div>

                <div className="pt-2 flex justify-end gap-3">
                  <button type="button" onClick={() => { setIsCreateOpen(false); resetForm(); }} className="px-4 py-2.5 rounded-xl font-medium text-muted-foreground hover:bg-slate-100">
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending || serviceRows.every(r => !r.type || !r.area)}
                    className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50"
                  >
                    {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Создать заявку
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </Layout>
    </ProtectedRoute>
  );
}
