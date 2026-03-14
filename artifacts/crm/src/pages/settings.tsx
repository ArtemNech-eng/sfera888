import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { useGetCities, useCreateCity, useDeleteCity, useGetServices, useCreateService, useDeleteService } from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Trash2, Plus, MapPin, Wrench, Percent, Save, Loader2 } from "lucide-react";

interface CommissionSettings {
  tier1Threshold: number;
  tier1Fixed: number;
  tier2Threshold: number;
  tier2Pct: number;
  tier3Pct: number;
}

function useCommission() {
  return useQuery<CommissionSettings>({
    queryKey: ["/api/settings/commission"],
    queryFn: async () => {
      const r = await fetch("/api/settings/commission", { credentials: "include" });
      return r.json();
    },
  });
}

function formatNum(n: number) {
  return n.toLocaleString("ru-RU");
}

export default function Settings() {
  const queryClient = useQueryClient();
  const { data: cities } = useGetCities();
  const { data: services } = useGetServices();
  const { data: commission } = useCommission();

  const [newCity, setNewCity] = useState("");
  const [newService, setNewService] = useState("");

  // Commission local state
  const [comm, setComm] = useState<CommissionSettings | null>(null);
  const [commSaved, setCommSaved] = useState(false);

  useEffect(() => {
    if (commission && !comm) setComm(commission);
  }, [commission]);

  const createCityMutation = useCreateCity({ onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/cities"] }); setNewCity(""); }});
  const deleteCityMutation = useDeleteCity({ onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/settings/cities"] })});
  const createServiceMutation = useCreateService({ onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/services"] }); setNewService(""); }});
  const deleteServiceMutation = useDeleteService({ onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/settings/services"] })});

  const saveCommMutation = useMutation({
    mutationFn: async (data: CommissionSettings) => {
      const r = await fetch("/api/settings/commission", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: (data) => {
      setComm(data);
      queryClient.invalidateQueries({ queryKey: ["/api/settings/commission"] });
      setCommSaved(true);
      setTimeout(() => setCommSaved(false), 2500);
    },
  });

  const numField = (label: string, field: keyof CommissionSettings, suffix: string, hint?: string) => (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="relative">
        <input
          type="number"
          min={0}
          value={comm?.[field] ?? ""}
          onChange={e => setComm(c => c ? { ...c, [field]: Number(e.target.value) } : c)}
          className="w-full pr-12 pl-4 py-2.5 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-background text-sm"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">{suffix}</span>
      </div>
    </div>
  );

  const exampleAmt = [30000, 75000, 150000];

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <Layout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Настройки</h1>
            <p className="text-muted-foreground mt-1">Справочники и системные параметры</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Cities */}
            <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden flex flex-col">
              <div className="p-6 border-b border-border/50 flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-xl"><MapPin className="w-5 h-5 text-primary" /></div>
                <h2 className="font-display font-bold text-lg">Города</h2>
              </div>
              <div className="p-6 flex-1 overflow-y-auto">
                <form
                  onSubmit={e => { e.preventDefault(); if (newCity) createCityMutation.mutate({ data: { name: newCity } }); }}
                  className="flex gap-2 mb-6"
                >
                  <input
                    value={newCity} onChange={e => setNewCity(e.target.value)}
                    placeholder="Новый город..."
                    className="flex-1 px-4 py-2.5 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                  <button disabled={createCityMutation.isPending || !newCity} className="px-4 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50">
                    <Plus className="w-5 h-5" />
                  </button>
                </form>
                <div className="space-y-2">
                  {cities?.map(city => (
                    <div key={city.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="font-medium text-slate-700">{city.name}</span>
                      <button
                        onClick={() => deleteCityMutation.mutate({ id: city.id })}
                        className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Services */}
            <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden flex flex-col">
              <div className="p-6 border-b border-border/50 flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-xl"><Wrench className="w-5 h-5 text-amber-500" /></div>
                <h2 className="font-display font-bold text-lg">Услуги</h2>
              </div>
              <div className="p-6 flex-1 overflow-y-auto">
                <form
                  onSubmit={e => { e.preventDefault(); if (newService) createServiceMutation.mutate({ data: { name: newService } }); }}
                  className="flex gap-2 mb-6"
                >
                  <input
                    value={newService} onChange={e => setNewService(e.target.value)}
                    placeholder="Новая услуга..."
                    className="flex-1 px-4 py-2.5 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                  <button disabled={createServiceMutation.isPending || !newService} className="px-4 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50">
                    <Plus className="w-5 h-5" />
                  </button>
                </form>
                <div className="space-y-2">
                  {services?.map(service => (
                    <div key={service.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="font-medium text-slate-700">{service.name}</span>
                      <button
                        onClick={() => deleteServiceMutation.mutate({ id: service.id })}
                        className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Commission Settings — full width */}
          <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-border/50 flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-xl"><Percent className="w-5 h-5 text-green-600" /></div>
              <div>
                <h2 className="font-display font-bold text-lg">Комиссия</h2>
                <p className="text-sm text-muted-foreground">Правила расчёта комиссии с заказов</p>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

                {/* Tier 1 */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">1</div>
                    <span className="font-semibold text-sm text-foreground">Малые заказы — фиксированная сумма</span>
                  </div>
                  {numField("Максимальная сумма заказа", "tier1Threshold", "₽", "До этой суммы действует фиксированная комиссия")}
                  {numField("Фиксированная комиссия", "tier1Fixed", "₽")}
                </div>

                {/* Tier 2 */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center">2</div>
                    <span className="font-semibold text-sm text-foreground">Средние заказы — процент</span>
                  </div>
                  {numField("Максимальная сумма заказа", "tier2Threshold", "₽", "От конца тарифа 1 до этой суммы")}
                  {numField("Процент комиссии", "tier2Pct", "%")}
                </div>

                {/* Tier 3 */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center">3</div>
                    <span className="font-semibold text-sm text-foreground">Крупные заказы — процент</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Свыше {comm ? formatNum(comm.tier2Threshold) : "…"} ₽ — расчёт вручную</p>
                  {numField("Процент комиссии", "tier3Pct", "%")}
                </div>
              </div>

              {/* Preview table */}
              {comm && (
                <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Примеры расчёта</p>
                  <div className="flex flex-wrap gap-3">
                    {exampleAmt.map(amt => {
                      let result = 0;
                      if (amt <= comm.tier1Threshold) result = comm.tier1Fixed;
                      else if (amt <= comm.tier2Threshold) result = amt * (comm.tier2Pct / 100);
                      else result = amt * (comm.tier3Pct / 100);
                      return (
                        <div key={amt} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm">
                          <span className="text-muted-foreground">{formatNum(amt)} ₽</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-semibold text-foreground">{formatNum(Math.round(result))} ₽</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Save button */}
              <div className="mt-6 flex items-center gap-3">
                {saveCommMutation.isError && (
                  <p className="text-sm text-destructive">{(saveCommMutation.error as Error).message}</p>
                )}
                {commSaved && (
                  <p className="text-sm text-green-600">✅ Настройки сохранены</p>
                )}
                <button
                  onClick={() => comm && saveCommMutation.mutate(comm)}
                  disabled={saveCommMutation.isPending || !comm}
                  className="ml-auto flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {saveCommMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Сохранить
                </button>
              </div>
            </div>
          </div>

        </div>
      </Layout>
    </ProtectedRoute>
  );
}
