import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { useGetCities, useCreateCity, useDeleteCity, useGetServices, useCreateService, useDeleteService } from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Trash2, Plus, MapPin, Wrench, Percent, Save, Loader2, Zap, UserCheck, Users, ToggleLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

function formatNum(n: number | undefined | null) {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("ru-RU");
}

function useAssignmentMode() {
  return useQuery<{ mode: "auto" | "manual" }>({
    queryKey: ["/api/masters/assignment-mode"],
    queryFn: async () => {
      const r = await fetch("/api/masters/assignment-mode", { credentials: "include" });
      return r.json();
    },
  });
}

function useAiDispatcher() {
  return useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/ai-dispatcher"],
    queryFn: async () => {
      const r = await fetch("/api/settings/ai-dispatcher", { credentials: "include" });
      return r.json();
    },
  });
}

export default function Settings() {
  const queryClient = useQueryClient();
  const { data: cities } = useGetCities();
  const { data: services } = useGetServices();
  const { data: commission } = useCommission();
  const { data: assignmentModeData } = useAssignmentMode();
  const { data: aiDispatcherData } = useAiDispatcher();
  const [assignMode, setAssignMode] = useState<"auto" | "manual">("auto");
  const [modeSaved, setModeSaved] = useState(false);
  const [aiDispatcherEnabled, setAiDispatcherEnabled] = useState(true);
  const [aiDispatcherSaved, setAiDispatcherSaved] = useState(false);

  useEffect(() => {
    if (assignmentModeData?.mode) setAssignMode(assignmentModeData.mode);
  }, [assignmentModeData]);

  useEffect(() => {
    if (aiDispatcherData?.enabled !== undefined) setAiDispatcherEnabled(aiDispatcherData.enabled);
  }, [aiDispatcherData]);

  const saveModeMutation = useMutation({
    mutationFn: async (mode: "auto" | "manual") => {
      const r = await fetch("/api/masters/assignment-mode", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: (_, mode) => {
      setAssignMode(mode);
      queryClient.invalidateQueries({ queryKey: ["/api/masters/assignment-mode"] });
      setModeSaved(true);
      setTimeout(() => setModeSaved(false), 2500);
    },
  });

  const saveAiDispatcherMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const r = await fetch("/api/settings/ai-dispatcher", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка"); }
      return r.json();
    },
    onSuccess: (_, enabled) => {
      setAiDispatcherEnabled(enabled);
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ai-dispatcher"] });
      setAiDispatcherSaved(true);
      setTimeout(() => setAiDispatcherSaved(false), 2500);
    },
  });

  const [newCity, setNewCity] = useState("");
  const [newService, setNewService] = useState("");
  const [cityError, setCityError] = useState("");
  const [serviceError, setServiceError] = useState("");

  // Commission local state
  const [comm, setComm] = useState<CommissionSettings | null>(null);
  const [commSaved, setCommSaved] = useState(false);

  // Partner settings
  const { toast } = useToast();
  interface PartnerSettings {
    partner_fixed_salary_max: number;
    partner_fixed_target_leads: number;
    partner_bonus_per_accepted_lead: number;
    partner_monthly_leads_plan: number;
    manual_partner_lead_review: boolean;
    partner_payout_day_start: number;
    partner_payout_day_end: number;
    partner_payout_model: "classic" | "hold";
    partner_hold_amount: number;
    partner_ad_budget_daily: number;
  }
  const [partnerSettings, setPartnerSettings] = useState<PartnerSettings>({
    partner_fixed_salary_max: 15000,
    partner_fixed_target_leads: 30,
    partner_bonus_per_accepted_lead: 250,
    partner_monthly_leads_plan: 50,
    manual_partner_lead_review: true,
    partner_payout_day_start: 1,
    partner_payout_day_end: 5,
    partner_payout_model: "classic",
    partner_hold_amount: 500,
    partner_ad_budget_daily: 500,
  });
  const [partnerSettingsLoaded, setPartnerSettingsLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/crm/settings/partner", { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        setPartnerSettings(data);
        setPartnerSettingsLoaded(true);
      })
      .catch(() => setPartnerSettingsLoaded(true));
  }, []);

  const savePartnerSettingsMutation = useMutation({
    mutationFn: async (data: PartnerSettings) => {
      const r = await fetch("/api/crm/settings/partner", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Ошибка сохранения");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Настройки сохранены" });
    },
    onError: () => {
      toast({ title: "Ошибка сохранения", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (commission && !comm) setComm(commission);
  }, [commission]);

  const createCityMutation = useCreateCity({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/cities"] }); setNewCity(""); setCityError(""); }, onError: (e: any) => setCityError(e?.message ?? "Ошибка")}});
  const deleteCityMutation = useDeleteCity({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/settings/cities"] })}});
  const createServiceMutation = useCreateService({ mutation: { onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/settings/services"] }); setNewService(""); setServiceError(""); }, onError: (e: any) => setServiceError(e?.message ?? "Ошибка")}});
  const deleteServiceMutation = useDeleteService({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/settings/services"] })}});

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
                  onSubmit={e => { e.preventDefault(); if (newCity.trim()) { setCityError(""); createCityMutation.mutate({ data: { name: newCity.trim() } }); } }}
                  className="space-y-1.5 mb-6"
                >
                  <div className="flex gap-2">
                    <input
                      value={newCity} onChange={e => { setNewCity(e.target.value); setCityError(""); }}
                      placeholder="Новый город..."
                      className={`flex-1 px-4 py-2.5 rounded-xl border focus:ring-1 outline-none ${cityError ? "border-destructive focus:border-destructive focus:ring-destructive/20" : "border-border focus:border-primary focus:ring-primary"}`}
                    />
                    <button disabled={createCityMutation.isPending || !newCity.trim()} className="px-4 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50">
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                  {cityError && <p className="text-xs text-destructive">{cityError}</p>}
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
                  onSubmit={e => { e.preventDefault(); if (newService.trim()) { setServiceError(""); createServiceMutation.mutate({ data: { name: newService.trim() } }); } }}
                  className="space-y-1.5 mb-6"
                >
                  <div className="flex gap-2">
                    <input
                      value={newService} onChange={e => { setNewService(e.target.value); setServiceError(""); }}
                      placeholder="Новая услуга..."
                      className={`flex-1 px-4 py-2.5 rounded-xl border focus:ring-1 outline-none ${serviceError ? "border-destructive focus:border-destructive focus:ring-destructive/20" : "border-border focus:border-primary focus:ring-primary"}`}
                    />
                    <button disabled={createServiceMutation.isPending || !newService.trim()} className="px-4 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50">
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                  {serviceError && <p className="text-xs text-destructive">{serviceError}</p>}
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

          {/* Assignment Mode — full width */}
          <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-border/50 flex items-center gap-3">
              <div className="p-2 bg-violet-500/10 rounded-xl">
                {assignMode === "auto" ? <Zap className="w-5 h-5 text-violet-600" /> : <UserCheck className="w-5 h-5 text-violet-600" />}
              </div>
              <div>
                <h2 className="font-display font-bold text-lg">Назначение мастеров</h2>
                <p className="text-sm text-muted-foreground">Как система выбирает мастера из откликнувшихся</p>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Auto mode */}
                <button
                  onClick={() => { setAssignMode("auto"); saveModeMutation.mutate("auto"); }}
                  disabled={saveModeMutation.isPending}
                  className={`relative flex flex-col gap-3 p-5 rounded-xl border-2 text-left transition-all ${
                    assignMode === "auto"
                      ? "border-violet-500 bg-violet-50"
                      : "border-border hover:border-violet-300 bg-background"
                  }`}
                >
                  {assignMode === "auto" && (
                    <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-violet-500" />
                  )}
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${assignMode === "auto" ? "bg-violet-100" : "bg-muted"}`}>
                      <Zap className={`w-4 h-4 ${assignMode === "auto" ? "text-violet-600" : "text-muted-foreground"}`} />
                    </div>
                    <span className={`font-semibold ${assignMode === "auto" ? "text-violet-700" : "text-foreground"}`}>
                      Автоматическое
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Через 30 минут система сама выбирает лучшего мастера по конверсии, рейтингу и скорости отклика. При 5+ откликах — раньше срока.
                  </p>
                </button>

                {/* Manual mode */}
                <button
                  onClick={() => { setAssignMode("manual"); saveModeMutation.mutate("manual"); }}
                  disabled={saveModeMutation.isPending}
                  className={`relative flex flex-col gap-3 p-5 rounded-xl border-2 text-left transition-all ${
                    assignMode === "manual"
                      ? "border-amber-500 bg-amber-50"
                      : "border-border hover:border-amber-300 bg-background"
                  }`}
                >
                  {assignMode === "manual" && (
                    <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-amber-500" />
                  )}
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${assignMode === "manual" ? "bg-amber-100" : "bg-muted"}`}>
                      <UserCheck className={`w-4 h-4 ${assignMode === "manual" ? "text-amber-600" : "text-muted-foreground"}`} />
                    </div>
                    <span className={`font-semibold ${assignMode === "manual" ? "text-amber-700" : "text-foreground"}`}>
                      Ручное
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Мастера откликаются, но назначение делает оператор вручную через CRM. Автоматический выбор отключён.
                  </p>
                </button>
              </div>

              {/* Status line */}
              <div className="mt-4 flex items-center gap-2 text-sm">
                {saveModeMutation.isPending && (
                  <><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /><span className="text-muted-foreground">Сохранение…</span></>
                )}
                {modeSaved && (
                  <span className="text-green-600">✅ Режим сохранён: {assignMode === "auto" ? "Автоматическое" : "Ручное"} назначение</span>
                )}
                {saveModeMutation.isError && (
                  <span className="text-destructive">{(saveModeMutation.error as Error).message}</span>
                )}
              </div>
            </div>
          </div>

          {/* AI Dispatcher Toggle */}
          <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-border/50 flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-xl">
                <Zap className="w-5 h-5 text-emerald-600" />
              </div>
              <h2 className="font-display font-bold text-lg">ИИ-диспетчер</h2>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <ToggleLeft className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">ИИ-диспетчер включён</div>
                    <div className="text-xs text-muted-foreground">
                      Включено → ИИ автоматически отвечает мастерам и шлёт proactive-напоминания.
                      Выключено → сообщения мастеров идут только операторам.
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => saveAiDispatcherMutation.mutate(!aiDispatcherEnabled)}
                  disabled={saveAiDispatcherMutation.isPending}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    aiDispatcherEnabled ? "bg-emerald-500" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      aiDispatcherEnabled ? "translate-x-6" : ""
                    }`}
                  />
                </button>
              </div>

              {/* Status line */}
              <div className="mt-4 flex items-center gap-2 text-sm">
                {saveAiDispatcherMutation.isPending && (
                  <><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /><span className="text-muted-foreground">Сохранение…</span></>
                )}
                {aiDispatcherSaved && (
                  <span className="text-green-600">✅ ИИ-диспетчер {aiDispatcherEnabled ? "включён" : "выключен"}</span>
                )}
                {saveAiDispatcherMutation.isError && (
                  <span className="text-destructive">{(saveAiDispatcherMutation.error as Error).message}</span>
                )}
              </div>
            </div>
          </div>

          {/* Partner Settings */}
          <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-border/50 flex items-center gap-3">
              <div className="p-2 bg-indigo-500/10 rounded-xl">
                <Users className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h2 className="font-display font-bold text-lg">Партнёры</h2>
                <p className="text-sm text-muted-foreground">Настройки расчёта вознаграждений и проверки лидов</p>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Max fixed salary */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Максимальный фикс</label>
                  <p className="text-xs text-muted-foreground">Максимальная сумма фиксированной части</p>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      value={partnerSettings.partner_fixed_salary_max}
                      onChange={e => setPartnerSettings(s => ({ ...s, partner_fixed_salary_max: Number(e.target.value) }))}
                      className="w-full pr-12 pl-4 py-2.5 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-background text-sm"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">₽</span>
                  </div>
                </div>

                {/* Target leads for full fixed */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Целевые лиды для полного фикса</label>
                  <p className="text-xs text-muted-foreground">Сколько лидов нужно для 100% фикса</p>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      value={partnerSettings.partner_fixed_target_leads}
                      onChange={e => setPartnerSettings(s => ({ ...s, partner_fixed_target_leads: Number(e.target.value) }))}
                      className="w-full pr-12 pl-4 py-2.5 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-background text-sm"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">лидов</span>
                  </div>
                </div>

                {/* Bonus per accepted lead */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Бонус за принятую заявку</label>
                  <p className="text-xs text-muted-foreground">Сколько платим за каждый принятый мастером лид</p>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      value={partnerSettings.partner_bonus_per_accepted_lead}
                      onChange={e => setPartnerSettings(s => ({ ...s, partner_bonus_per_accepted_lead: Number(e.target.value) }))}
                      className="w-full pr-12 pl-4 py-2.5 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-background text-sm"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">₽</span>
                  </div>
                </div>

                {/* Monthly leads plan */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">План лидов в месяц</label>
                  <p className="text-xs text-muted-foreground">Целевое количество лидов для плана</p>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      value={partnerSettings.partner_monthly_leads_plan}
                      onChange={e => setPartnerSettings(s => ({ ...s, partner_monthly_leads_plan: Number(e.target.value) }))}
                      className="w-full pr-12 pl-4 py-2.5 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-background text-sm"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">лидов</span>
                  </div>
                </div>

                {/* Payout day start */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Выплата с числа</label>
                  <p className="text-xs text-muted-foreground">Начало периода выплаты</p>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={partnerSettings.partner_payout_day_start}
                      onChange={e => setPartnerSettings(s => ({ ...s, partner_payout_day_start: Number(e.target.value) }))}
                      className="w-full pr-12 pl-4 py-2.5 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-background text-sm"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">число</span>
                  </div>
                </div>

                {/* Payout day end */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Выплата по число</label>
                  <p className="text-xs text-muted-foreground">Конец периода выплаты</p>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={partnerSettings.partner_payout_day_end}
                      onChange={e => setPartnerSettings(s => ({ ...s, partner_payout_day_end: Number(e.target.value) }))}
                      className="w-full pr-12 pl-4 py-2.5 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-background text-sm"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">число</span>
                  </div>
                </div>
              </div>

              {/* Payout model selector */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Модель оплаты партнёров</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    onClick={() => setPartnerSettings(s => ({ ...s, partner_payout_model: "classic" }))}
                    className={`relative flex flex-col gap-3 p-5 rounded-xl border-2 text-left transition-all ${
                      partnerSettings.partner_payout_model === "classic"
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-border hover:border-indigo-300 bg-background"
                    }`}
                  >
                    {partnerSettings.partner_payout_model === "classic" && (
                      <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-indigo-500" />
                    )}
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${partnerSettings.partner_payout_model === "classic" ? "bg-indigo-100" : "bg-muted"}`}>
                        <Percent className={`w-4 h-4 ${partnerSettings.partner_payout_model === "classic" ? "text-indigo-600" : "text-muted-foreground"}`} />
                      </div>
                      <span className={`font-semibold ${partnerSettings.partner_payout_model === "classic" ? "text-indigo-700" : "text-foreground"}`}>
                        Классическая
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Фиксированная зарплата + бонус за каждую принятую заявку. Партнёр видит план и прогресс.
                    </p>
                  </button>

                  <button
                    onClick={() => setPartnerSettings(s => ({ ...s, partner_payout_model: "hold" }))}
                    className={`relative flex flex-col gap-3 p-5 rounded-xl border-2 text-left transition-all ${
                      partnerSettings.partner_payout_model === "hold"
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-border hover:border-emerald-300 bg-background"
                    }`}
                  >
                    {partnerSettings.partner_payout_model === "hold" && (
                      <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    )}
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${partnerSettings.partner_payout_model === "hold" ? "bg-emerald-100" : "bg-muted"}`}>
                        <Zap className={`w-4 h-4 ${partnerSettings.partner_payout_model === "hold" ? "text-emerald-600" : "text-muted-foreground"}`} />
                      </div>
                      <span className={`font-semibold ${partnerSettings.partner_payout_model === "hold" ? "text-emerald-700" : "text-foreground"}`}>
                        Холд (по заявкам)
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Фиксированная сумма за каждый лид, который мастер взял в работу. Рекламный бюджет в первый месяц.
                    </p>
                  </button>
                </div>
              </div>

              {/* Hold model fields (conditional) */}
              {partnerSettings.partner_payout_model === "hold" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Сумма за холд-лид</label>
                    <p className="text-xs text-muted-foreground">Сколько платим за лид, принятый мастером</p>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        value={partnerSettings.partner_hold_amount}
                        onChange={e => setPartnerSettings(s => ({ ...s, partner_hold_amount: Number(e.target.value) }))}
                        className="w-full pr-12 pl-4 py-2.5 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-background text-sm"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">₽</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Рекламный бюджет в день</label>
                    <p className="text-xs text-muted-foreground">Инвестиции в рекламу для нового партнёра (первый период)</p>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        value={partnerSettings.partner_ad_budget_daily}
                        onChange={e => setPartnerSettings(s => ({ ...s, partner_ad_budget_daily: Number(e.target.value) }))}
                        className="w-full pr-12 pl-4 py-2.5 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-background text-sm"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">₽/день</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Manual review toggle */}
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <ToggleLeft className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">Ручная проверка лидов</div>
                    <div className="text-xs text-muted-foreground">
                      Включено → лиды ждут одобрения в «Лиды партнёров».
                      Выключено → лиды сразу в ленту мастеров.
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setPartnerSettings(s => ({ ...s, manual_partner_lead_review: !s.manual_partner_lead_review }))}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    partnerSettings.manual_partner_lead_review ? "bg-indigo-500" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      partnerSettings.manual_partner_lead_review ? "translate-x-6" : ""
                    }`}
                  />
                </button>
              </div>

              {/* Save button */}
              <div className="flex items-center justify-end">
                <button
                  onClick={() => savePartnerSettingsMutation.mutate(partnerSettings)}
                  disabled={savePartnerSettingsMutation.isPending || !partnerSettingsLoaded}
                  className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {savePartnerSettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
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
