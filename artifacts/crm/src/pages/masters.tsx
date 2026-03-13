import { useState } from "react";
import { Layout } from "@/components/layout";
import { useGetMasters, useCreateMaster, useGetCities } from "@workspace/api-client-react";
import { ProtectedRoute } from "@/hooks/use-auth";
import { StatusBadge } from "@/components/status-badge";
import { Loader2, Plus, Star, ShieldAlert } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";

export default function Masters() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: masters, isLoading } = useGetMasters();
  const { data: cities } = useGetCities();

  const createMutation = useCreateMaster({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/masters"] });
        setIsCreateOpen(false);
      }
    }
  });

  const [formData, setFormData] = useState({
    alias: "",
    city: "",
    specialization: "",
    telegramId: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ data: formData });
  };

  return (
    <ProtectedRoute allowedRoles={['admin', 'master_operator']}>
      <Layout>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">База мастеров</h1>
              <p className="text-muted-foreground mt-1">Управление исполнителями</p>
            </div>
            <button 
              onClick={() => setIsCreateOpen(true)}
              className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20"
            >
              <Plus className="w-4 h-4" /> Добавить мастера
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoading ? (
              <div className="col-span-full py-12 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : masters?.map(master => (
              <div key={master.id} className="bg-card rounded-2xl p-6 border border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-display font-bold text-xl text-slate-700">
                      {master.alias.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-lg leading-tight">{master.alias}</h3>
                      <p className="text-sm text-muted-foreground">{master.city}</p>
                    </div>
                  </div>
                  <StatusBadge status={master.status} type="master" />
                </div>
                
                <div className="grid grid-cols-2 gap-4 py-4 border-y border-border/50 mb-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Рейтинг</p>
                    <div className="flex items-center gap-1 text-sm font-semibold">
                      <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                      {master.rating.toFixed(1)}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Заказов</p>
                    <p className="text-sm font-semibold">{master.totalOrders}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Специализация</p>
                    <p className="text-sm font-medium">{master.specialization}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Задолженность</p>
                    <p className={`text-sm font-semibold ${master.debt > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                      {formatCurrency(master.debt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button className="flex-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium transition-colors">
                    Профиль
                  </button>
                  {master.debt > 0 && (
                    <button className="p-2 bg-destructive/10 text-destructive rounded-xl hover:bg-destructive/20 transition-colors" title="Запросить оплату">
                      <ShieldAlert className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Create Modal */}
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
                <h2 className="text-lg font-display font-bold text-foreground">Новый мастер</h2>
                <button onClick={() => setIsCreateOpen(false)} className="text-muted-foreground hover:text-foreground">✕</button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Позывной / Имя</label>
                  <input required value={formData.alias} onChange={e => setFormData({...formData, alias: e.target.value})} className="w-full px-3 py-2 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Город</label>
                  <select required value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="w-full px-3 py-2 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-background">
                    <option value="">Выберите город</option>
                    {cities?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Специализация</label>
                  <input required value={formData.specialization} onChange={e => setFormData({...formData, specialization: e.target.value})} placeholder="Например: Плиточник, Сантехник" className="w-full px-3 py-2 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Telegram ID (для бота)</label>
                  <input value={formData.telegramId} onChange={e => setFormData({...formData, telegramId: e.target.value})} className="w-full px-3 py-2 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none" />
                </div>

                <div className="pt-4 flex justify-end gap-3">
                  <button type="button" onClick={() => setIsCreateOpen(false)} className="px-4 py-2.5 rounded-xl font-medium text-muted-foreground hover:bg-slate-100">
                    Отмена
                  </button>
                  <button type="submit" disabled={createMutation.isPending} className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 flex items-center gap-2">
                    {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Добавить
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
