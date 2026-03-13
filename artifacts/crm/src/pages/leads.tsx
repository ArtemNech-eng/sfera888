import { useState } from "react";
import { Layout } from "@/components/layout";
import { useGetLeads, useCreateLead, useSendLeadToBuffer, useGetCities, useGetServices, LeadStatus } from "@workspace/api-client-react";
import { ProtectedRoute } from "@/hooks/use-auth";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import { Loader2, Plus, Search, Filter, Play } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

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
    serviceType: "",
    area: "",
    comment: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      data: {
        ...formData,
        area: Number(formData.area),
      }
    });
  };

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
                    <th className="px-6 py-4">Услуга</th>
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
                  ) : leads?.map((lead) => (
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
                      <td className="px-6 py-4">
                        <div className="text-foreground">{lead.serviceType}</div>
                        <div className="text-xs text-muted-foreground mt-1">{lead.area} м²</div>
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Create Modal */}
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
                <h2 className="text-lg font-display font-bold text-foreground">Новая заявка</h2>
                <button onClick={() => setIsCreateOpen(false)} className="text-muted-foreground hover:text-foreground">✕</button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Имя клиента</label>
                    <input required value={formData.clientName} onChange={e => setFormData({...formData, clientName: e.target.value})} className="w-full px-3 py-2 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Телефон</label>
                    <input required value={formData.clientPhone} onChange={e => setFormData({...formData, clientPhone: e.target.value})} className="w-full px-3 py-2 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                  </div>
                </div>
                
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Тип услуги</label>
                    <select required value={formData.serviceType} onChange={e => setFormData({...formData, serviceType: e.target.value})} className="w-full px-3 py-2 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-background">
                      <option value="">Выберите услугу</option>
                      {services?.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Площадь (м²)</label>
                    <input required type="number" min="1" value={formData.area} onChange={e => setFormData({...formData, area: e.target.value})} className="w-full px-3 py-2 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Комментарий (необязательно)</label>
                  <textarea value={formData.comment} onChange={e => setFormData({...formData, comment: e.target.value})} rows={3} className="w-full px-3 py-2 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none" />
                </div>

                <div className="pt-4 flex justify-end gap-3">
                  <button type="button" onClick={() => setIsCreateOpen(false)} className="px-4 py-2.5 rounded-xl font-medium text-muted-foreground hover:bg-slate-100">
                    Отмена
                  </button>
                  <button type="submit" disabled={createMutation.isPending} className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 flex items-center gap-2">
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
