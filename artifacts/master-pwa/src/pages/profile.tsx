import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  User, Phone, MapPin, Star, Briefcase,
  TrendingUp, ShieldCheck, LogOut, ExternalLink,
  BadgeCheck, Camera, Pencil, Check, X, Loader2,
  BarChart2, Clock, Filter, ChevronDown, Plus, Download,
  DollarSign, ChevronRight,
} from "lucide-react";
import { useInstallPrompt } from "@/lib/useInstallPrompt";

interface WorkingHours { start: string; end: string; days: number[]; }

interface ServicePrice { service: string; priceFrom: number; }

interface ProfileData {
  id: number;
  alias: string;
  city: string;
  specialization: string;
  specializations: string[];
  phone: string | null;
  rating: number;
  debt: number;
  totalOrders: number;
  acceptedOrders: number;
  isTestMaster: boolean;
  customAvatarUrl: string | null;
  contractLink: string | null;
  tags: string[];
  workingHours: WorkingHours | null;
  preferredDistricts: string[];
  minArea: number;
  servicePrices: ServicePrice[];
  stats: {
    conversionRate: number;
    paymentRate: number;
  };
  createdAt: string;
}


function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3.5 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">{icon}{label}</div>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function EditProfileModal({
  data,
  onSave,
  onClose,
}: {
  data: ProfileData;
  onSave: (updated: Partial<ProfileData>) => void;
  onClose: () => void;
}) {
  const [alias, setAlias] = useState(data.alias);
  const [city, setCity] = useState(data.city);
  const [phone, setPhone] = useState(data.phone ?? "");
  const [selectedSpecs, setSelectedSpecs] = useState<string[]>(data.specializations ?? []);
  // prices: spec name → price string
  const [prices, setPrices] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const p of data.servicePrices ?? []) {
      map[p.service] = String(p.priceFrom);
    }
    return map;
  });
  const [availableSpecs, setAvailableSpecs] = useState<string[]>([]);
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/settings/services")
      .then(r => r.ok ? r.json() : [])
      .then((d: { id: number; name: string }[]) => setAvailableSpecs(d.map(s => s.name)))
      .catch(() => {});
    fetch("/api/settings/cities")
      .then(r => r.ok ? r.json() : [])
      .then((d: { id: number; name: string }[]) => setAvailableCities(d.map(c => c.name)))
      .catch(() => {});
  }, []);

  const toggleSpec = (s: string) => {
    setSelectedSpecs(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  };

  const handleSave = async () => {
    if (!alias.trim()) { toast.error("Введите имя"); return; }
    if (!city.trim()) { toast.error("Введите город"); return; }
    if (selectedSpecs.length === 0) { toast.error("Выберите хотя бы одну специализацию"); return; }

    const servicePrices = selectedSpecs
      .filter(s => Number(prices[s]) > 0)
      .map(s => ({ service: s, priceFrom: Number(prices[s]) }));

    setLoading(true);
    try {
      await api.updateProfile({
        alias: alias.trim(),
        city: city.trim(),
        phone: phone.trim() || undefined,
        specializations: selectedSpecs,
        servicePrices,
      });
      toast.success("Профиль обновлён");
      onSave({
        alias: alias.trim(),
        city: city.trim(),
        phone: phone.trim() || null,
        specializations: selectedSpecs,
        specialization: selectedSpecs.join(", "),
        servicePrices,
      });
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка сохранения");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-[480px] bg-card rounded-t-2xl flex flex-col"
        style={{ height: "92dvh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-card border-b border-border px-4 py-3 flex items-center gap-3 flex-shrink-0 rounded-t-2xl">
          <button
            onClick={onClose}
            className="text-muted-foreground h-9 w-9 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
          >
            <X size={18} />
          </button>
          <h3 className="font-bold text-base flex-1">Редактировать профиль</h3>
          <button
            onClick={handleSave}
            disabled={loading}
            className="h-9 px-4 bg-primary text-white font-semibold rounded-xl text-sm active:opacity-80 disabled:opacity-50 flex items-center gap-1.5"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            Сохранить
          </button>
        </div>

        {/* Scrollable body — min-h-0 required for overflow to work inside flex column */}
        <div className="overflow-y-auto overscroll-contain flex-1 min-h-0 p-5 space-y-5">

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Имя / псевдоним</label>
            <input
              value={alias}
              onChange={e => setAlias(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Иван Мастеров"
            />
          </div>

          {/* City */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Город</label>
            <select
              value={city}
              onChange={e => setCity(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
            >
              {city && !availableCities.includes(city) && <option value={city}>{city}</option>}
              <option value="">{availableCities.length === 0 ? "Загрузка городов..." : "Выберите город"}</option>
              {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Телефон</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="+7 (999) 000-00-00"
            />
          </div>

          {/* Specializations + prices (combined) */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Специализации и цены</label>
              <p className="text-xs text-muted-foreground mt-0.5">Выберите все виды работ и укажите стартовую цену</p>
            </div>

            {/* Chips grid */}
            <div className="flex flex-wrap gap-2">
              {availableSpecs.length === 0 && (
                <p className="text-xs text-muted-foreground">Загрузка...</p>
              )}
              {availableSpecs.map(s => {
                const selected = selectedSpecs.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSpec(s)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      selected
                        ? "bg-primary text-white border-primary"
                        : "bg-background text-foreground border-border"
                    }`}
                  >
                    {selected && <Check size={11} />}
                    {s}
                  </button>
                );
              })}
            </div>

            {/* Price inputs for selected specs */}
            {selectedSpecs.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-xs text-muted-foreground">Укажите стартовую цену для каждой услуги (необязательно):</p>
                {selectedSpecs.map(s => (
                  <div key={s} className="flex items-center gap-2">
                    <span className="flex-1 text-sm text-foreground truncate">{s}</span>
                    <div className="relative flex-shrink-0">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={prices[s] ?? ""}
                        onChange={e => setPrices(p => ({ ...p, [s]: e.target.value.replace(/\D/g, "") }))}
                        placeholder="от ₽"
                        className="w-28 h-9 pl-3 pr-7 rounded-xl border border-border bg-muted/40 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">₽</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Analytics Section ────────────────────────────────────────────────────────

function AnalyticsSection() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setData(await api.analytics()); }
    catch { toast.error("Ошибка загрузки аналитики"); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open && !data) load(); }, [open]);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <BarChart2 size={16} className="text-primary" /> Моя аналитика
        </div>
        <ChevronDown size={16} className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border space-y-3 pt-3">
          {loading ? (
            <div className="flex items-center justify-center h-24">
              <div className="w-6 h-6 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : data ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/50 rounded-xl p-3 space-y-0.5">
                  <p className="text-xs text-muted-foreground">Получено заявок</p>
                  <p className="text-xl font-bold">{data.totalDispatched}</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-3 space-y-0.5">
                  <p className="text-xs text-muted-foreground">Откликнулся</p>
                  <p className="text-xl font-bold">{data.totalResponded}</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 space-y-0.5">
                  <p className="text-xs text-muted-foreground">Выбрали вас</p>
                  <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{data.totalAssigned}</p>
                </div>
                <div className="bg-primary/5 rounded-xl p-3 space-y-0.5">
                  <p className="text-xs text-muted-foreground">Конверсия</p>
                  <p className="text-xl font-bold text-primary">{data.winRate}%</p>
                </div>
              </div>

              <div className="bg-muted/40 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">За последние 30 дней</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Заявок получено:</span>
                  <span className="font-semibold">{data.last30Days.dispatched}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Откликнулся:</span>
                  <span className="font-semibold">{data.last30Days.responded}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Назначен:</span>
                  <span className="font-semibold text-emerald-600">{data.last30Days.assigned}</span>
                </div>
              </div>

              {data.avgOrderAmount > 0 && (
                <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 rounded-xl px-4 py-3">
                  <span className="text-sm text-muted-foreground">Средний заказ</span>
                  <span className="font-bold text-amber-700 dark:text-amber-400">
                    {data.avgOrderAmount.toLocaleString("ru-RU")} ₽
                  </span>
                </div>
              )}

              {Object.keys(data.rejectionReasons).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">Частые причины отказа</p>
                  {Object.entries(data.rejectionReasons as Record<string, number>)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3)
                    .map(([reason, count]) => (
                      <div key={reason} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{reason}</span>
                        <span className="font-medium">{count}×</span>
                      </div>
                    ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Order Filters Section ────────────────────────────────────────────────────

function OrderFiltersSection({ data, onSave }: { data: ProfileData; onSave: (u: Partial<ProfileData>) => void }) {
  const [open, setOpen] = useState(false);
  const [minArea, setMinArea] = useState(String(data.minArea ?? 0));
  const [districts, setDistricts] = useState<string[]>(data.preferredDistricts ?? []);
  const [newDistrict, setNewDistrict] = useState("");
  const [saving, setSaving] = useState(false);

  const addDistrict = () => {
    const d = newDistrict.trim();
    if (d && !districts.includes(d)) setDistricts(p => [...p, d]);
    setNewDistrict("");
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.updateProfile({ minArea: parseInt(minArea) || 0, preferredDistricts: districts });
      onSave({ minArea: parseInt(minArea) || 0, preferredDistricts: districts });
      toast.success("Фильтры сохранены");
    } catch (e: any) { toast.error(e.message ?? "Ошибка"); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Filter size={15} className="text-primary" /> Фильтры заявок
          {(districts.length > 0 || parseInt(minArea) > 0) && (
            <span className="text-xs text-primary font-normal">
              ({[districts.length > 0 ? `${districts.length} район` : "", parseInt(minArea) > 0 ? `от ${minArea} м²` : ""].filter(Boolean).join(", ")})
            </span>
          )}
        </div>
        <ChevronDown size={16} className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border pt-3 space-y-4">
          <p className="text-xs text-muted-foreground">Заявки не соответствующие фильтрам не будут показаны в списке.</p>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground">Минимальная площадь (м²)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={minArea}
                onChange={e => setMinArea(e.target.value)}
                placeholder="0 = без ограничений"
                className="flex-1 h-10 px-3 rounded-xl border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground">Предпочтительные районы</label>
            {districts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {districts.map(d => (
                  <span key={d} className="flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    {d}
                    <button onClick={() => setDistricts(p => p.filter(x => x !== d))}><X size={11} /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={newDistrict}
                onChange={e => setNewDistrict(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addDistrict()}
                placeholder="Название района..."
                className="flex-1 h-10 px-3 rounded-xl border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button onClick={addDistrict}
                className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Plus size={16} />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Оставьте пустым чтобы получать заявки из всех районов</p>
          </div>

          <button onClick={save} disabled={saving}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : "Сохранить фильтры"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Service Prices Section ───────────────────────────────────────────────────

function ServicePricesSection({ data, onSave }: { data: ProfileData; onSave: (u: Partial<ProfileData>) => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<{ service: string; priceFrom: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const prices = data.servicePrices ?? [];

  const startEdit = () => {
    setRows(prices.length > 0
      ? prices.map(p => ({ service: p.service, priceFrom: String(p.priceFrom) }))
      : [{ service: "", priceFrom: "" }]
    );
    setOpen(true);
  };

  const save = async () => {
    const servicePrices = rows
      .filter(r => r.service.trim() && Number(r.priceFrom) > 0)
      .map(r => ({ service: r.service.trim(), priceFrom: Number(r.priceFrom) }));
    setSaving(true);
    try {
      await api.updateProfile({ servicePrices });
      onSave({ servicePrices });
      toast.success("Цены сохранены");
      setOpen(false);
    } catch (e: any) { toast.error(e.message ?? "Ошибка"); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button onClick={() => open ? setOpen(false) : startEdit()}
        className="w-full flex items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <DollarSign size={15} className="text-primary" /> Мои цены на услуги
          {prices.length > 0
            ? <span className="text-xs text-primary font-normal">({prices.length} позиц.)</span>
            : <span className="text-xs text-muted-foreground font-normal">(не указаны)</span>}
        </div>
        <ChevronDown size={16} className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
          <p className="text-xs text-muted-foreground">Укажите стартовую цену для каждой услуги. Это помогает клиентам оценить стоимость.</p>

          {rows.map((row, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                value={row.service}
                onChange={e => setRows(r => r.map((x, j) => j === i ? { ...x, service: e.target.value } : x))}
                placeholder="Название услуги"
                className="flex-1 h-10 px-3 rounded-xl border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <input
                value={row.priceFrom}
                onChange={e => setRows(r => r.map((x, j) => j === i ? { ...x, priceFrom: e.target.value.replace(/\D/g, "") } : x))}
                placeholder="от ₽"
                className="w-24 h-10 px-3 rounded-xl border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button onClick={() => setRows(r => r.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive transition-colors">
                <X size={16} />
              </button>
            </div>
          ))}

          <button onClick={() => setRows(r => [...r, { service: "", priceFrom: "" }])}
            className="flex items-center gap-1.5 text-xs text-primary font-medium">
            <Plus size={13} /> Добавить услугу
          </button>

          <button onClick={save} disabled={saving}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
            {saving
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Check size={15} />}
            Сохранить цены
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Working Hours Section ────────────────────────────────────────────────────

const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function WorkingHoursSection({ data, onSave }: { data: ProfileData; onSave: (u: Partial<ProfileData>) => void }) {
  const [open, setOpen] = useState(false);
  const wh = data.workingHours;
  const [enabled, setEnabled] = useState(!!wh);
  const [start, setStart] = useState(wh?.start ?? "09:00");
  const [end, setEnd] = useState(wh?.end ?? "20:00");
  const [days, setDays] = useState<number[]>(wh?.days ?? [1, 2, 3, 4, 5]);
  const [saving, setSaving] = useState(false);

  const toggleDay = (d: number) => setDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d].sort());

  const save = async () => {
    setSaving(true);
    const payload = enabled ? { start, end, days } : null;
    try {
      await api.updateProfile({ workingHours: payload });
      onSave({ workingHours: payload });
      toast.success(enabled ? "Рабочие часы сохранены" : "Расписание отключено");
    } catch (e: any) { toast.error(e.message ?? "Ошибка"); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Clock size={15} className="text-primary" /> Рабочие часы
          {wh && <span className="text-xs text-primary font-normal">({wh.start}–{wh.end})</span>}
          {!wh && <span className="text-xs text-muted-foreground font-normal">(не настроено)</span>}
        </div>
        <ChevronDown size={16} className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border pt-3 space-y-4">
          <p className="text-xs text-muted-foreground">Заявки вне рабочих часов будут скрыты из вашего списка.</p>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Включить расписание</span>
            <button onClick={() => setEnabled(p => !p)}
              className={`w-12 h-6 rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted"}`}>
              <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${enabled ? "translate-x-6" : "translate-x-0.5"}`} />
            </button>
          </div>

          {enabled && (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground">Начало</label>
                  <input type="time" value={start} onChange={e => setStart(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground">Конец</label>
                  <input type="time" value={end} onChange={e => setEnd(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Рабочие дни</label>
                <div className="flex gap-2">
                  {DAY_LABELS.map((label, i) => {
                    const dayNum = i + 1;
                    return (
                      <button key={dayNum} onClick={() => toggleDay(dayNum)}
                        className={`flex-1 h-9 rounded-xl text-xs font-semibold transition-all ${
                          days.includes(dayNum)
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <button onClick={save} disabled={saving}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : "Сохранить"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { logout } = useAuth();
  const [, navigate] = useLocation();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { canInstall, isInstalled, install } = useInstallPrompt();

  useEffect(() => {
    api.profile()
      .then(setData)
      .catch(() => toast.error("Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      setLoggingOut(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Выберите изображение"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Файл не должен превышать 5 МБ"); return; }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const res = await fetch("/api/master-pwa/profile/avatar", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) throw new Error("Ошибка загрузки");
      const { customAvatarUrl } = await res.json();
      setData(d => d ? { ...d, customAvatarUrl } : d);
      toast.success("Фото обновлено");
    } catch {
      toast.error("Не удалось загрузить фото");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const initials = data.alias?.slice(0, 2)?.toUpperCase() ?? "МС";

  return (
    <div className="px-4 pt-5 pb-4 space-y-5">
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          {data.customAvatarUrl ? (
            <img
              src={data.customAvatarUrl}
              alt={data.alias}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-white text-xl font-bold">
              {initials}
            </div>
          )}

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary border-2 border-background flex items-center justify-center shadow-md active:opacity-80 disabled:opacity-50 transition-opacity"
          >
            {uploading
              ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Camera size={13} className="text-white" />}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold truncate">{data.alias}</h1>
            {data.isTestMaster && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium shrink-0">
                Тест
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin size={13} />
            <span>{data.city}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Briefcase size={13} />
            <span className="truncate">{data.specialization}</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1 text-amber-500">
            <Star size={18} fill="currentColor" />
            <span className="font-bold text-base">{data.rating.toFixed(1)}</span>
          </div>
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium active:opacity-80"
          >
            <Pencil size={12} />
            Изменить
          </button>
        </div>
      </div>

      {data.phone && (
        <a
          href={`tel:${data.phone}`}
          className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3"
        >
          <Phone size={16} className="text-muted-foreground" />
          <span className="text-sm">{data.phone}</span>
        </a>
      )}

      {data.specializations && data.specializations.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {data.specializations.map(s => (
            <span key={s} className="text-xs px-3 py-1 rounded-full bg-primary/10 text-primary font-medium">
              {s}
            </span>
          ))}
        </div>
      )}

      {data.tags && data.tags.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-3.5 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Метки</p>
          <div className="flex flex-wrap gap-2">
            {data.tags.map(tag => (
              <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium border border-border">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Всего заказов" value={data.totalOrders} icon={<Briefcase size={13} />} />
        <StatCard label="Принято" value={data.acceptedOrders} icon={<BadgeCheck size={13} />} />
        <StatCard label="Конверсия" value={`${data.stats.conversionRate}%`} icon={<TrendingUp size={13} />} />
        <StatCard label="Оплат в срок" value={`${data.stats.paymentRate}%`} icon={<ShieldCheck size={13} />} />
      </div>

      {/* Analytics */}
      <AnalyticsSection />

      {/* Order filters */}
      <OrderFiltersSection data={data} onSave={updated => setData(d => d ? { ...d, ...updated } : d)} />

      {/* Working hours */}
      <WorkingHoursSection data={data} onSave={updated => setData(d => d ? { ...d, ...updated } : d)} />

      {/* Service prices — read-only, edit via profile modal */}
      {(data.servicePrices ?? []).length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <DollarSign size={15} className="text-primary" />
              Мои цены на услуги
            </div>
            <button
              onClick={() => setShowEdit(true)}
              className="text-xs text-primary font-medium"
            >
              Изменить
            </button>
          </div>
          <div className="divide-y divide-border">
            {(data.servicePrices ?? []).map((p, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                <span className="text-sm text-foreground">{p.service}</span>
                <span className="text-sm font-semibold text-primary">от {p.priceFrom.toLocaleString("ru-RU")} ₽</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => navigate("/work-rules")}
        className="w-full flex items-center justify-between px-4 h-12 rounded-xl border border-border bg-card text-foreground font-semibold text-sm active:opacity-80 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="2" width="12" height="16" rx="2" />
              <line x1="7" y1="7" x2="13" y2="7" />
              <line x1="7" y1="10" x2="13" y2="10" />
              <line x1="7" y1="13" x2="11" y2="13" />
            </svg>
          </span>
          Правила работы
        </div>
        <ChevronRight size={16} className="text-muted-foreground" />
      </button>

      {data.contractLink && (
        <a
          href={data.contractLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 text-primary font-medium text-sm"
        >
          <ExternalLink size={16} />
          Мой договор
        </a>
      )}

      <p className="text-xs text-muted-foreground text-center">
        В системе с {new Date(data.createdAt).toLocaleDateString("ru-RU", {
          day: "numeric", month: "long", year: "numeric",
        })}
      </p>

      {/* PWA install button — shown only when browser supports it and app isn't installed */}
      {canInstall && (
        <button
          onClick={async () => {
            const result = await install();
            if (result === "accepted") toast.success("Приложение установлено!");
            else if (result === "dismissed") toast("Установка отменена");
            else toast("Нажмите «Установить» в адресной строке браузера");
          }}
          className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:opacity-80"
        >
          <Download size={16} />
          Установить приложение
        </button>
      )}

      {isInstalled && (
        <div className="flex items-center justify-center gap-2 h-10 text-sm text-muted-foreground">
          <Check size={14} className="text-green-500" />
          Приложение установлено
        </div>
      )}

      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="w-full flex items-center justify-center gap-2 h-12 rounded-xl border border-border text-destructive font-semibold text-sm active:opacity-80 disabled:opacity-50"
      >
        {loggingOut
          ? <div className="w-4 h-4 border-2 border-destructive border-t-transparent rounded-full animate-spin" />
          : <LogOut size={16} />}
        Выйти
      </button>

      {showEdit && (
        <EditProfileModal
          data={data}
          onSave={updated => {
            setData(d => d ? { ...d, ...updated } : d);
            setShowEdit(false);
          }}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  );
}
