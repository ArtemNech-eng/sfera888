import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  User, Phone, MapPin, Star, Briefcase,
  TrendingUp, ShieldCheck, LogOut, ExternalLink,
  BadgeCheck, Camera, Pencil, Check, X, Loader2,
  BarChart2, Clock, Filter, ChevronDown, Plus, Download, FileText,
  DollarSign, ChevronRight, BookOpen, FileSignature, Globe, Image as ImageIcon, Trash2,
  Sparkles, Wand2,
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
  contractSignedAt: string | null;
  tags: string[];
  workingHours: WorkingHours | null;
  preferredDistricts: string[];
  minArea: number;
  servicePrices: ServicePrice[];
  stats: {
    conversionRate: number;
    paymentRate: number;
  };
  activeCount: number;
  completedCount: number;
  cancelledCount: number;
  createdAt: string;
  maxChatId: string | null;
  maxBotLink: string | null;
  // ── Marketplace publication state ───────────────────────────────────────
  slug: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  publicTitle: string | null;
  publicBio: string | null;
  yearsExperience: number | null;
  profileUrl: string | null;
}

interface PublicationError {
  field?: string;
  code: string;
  message: string;
}


function StatCard({ label, value, icon, colorClass }: { label: string; value: string | number; icon: React.ReactNode; colorClass: string }) {
  return (
    <div className={`rounded-2xl p-4 shadow-sm space-y-2 ${colorClass}`}>
      <div className="flex items-center gap-1.5 text-white/80 text-xs">{icon}{label}</div>
      <p className="text-2xl font-bold tracking-tight text-white">{value}</p>
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
        style={{ height: "92dvh", maxHeight: "92dvh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="px-4 pt-1 pb-3 flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="text-muted-foreground h-9 w-9 flex items-center justify-center rounded-xl active:bg-muted transition-colors"
          >
            <X size={20} />
          </button>
          <h3 className="font-bold text-base flex-1 text-center">Редактировать профиль</h3>
          <button
            onClick={handleSave}
            disabled={loading}
            className="h-9 px-4 bg-primary text-primary-foreground font-semibold rounded-xl text-sm active:opacity-80 disabled:opacity-50 flex items-center gap-1.5"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : null}
            Готово
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto overscroll-contain flex-1 min-h-0 basis-0 px-4 pb-4 space-y-6">

          {/* Basic info — iOS grouped list */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">Основное</p>
            <div className="bg-muted/50 rounded-2xl overflow-hidden divide-y divide-border/60">

              {/* Name */}
              <div className="flex items-center px-4 gap-3 min-h-[52px]">
                <span className="text-sm text-muted-foreground w-20 flex-shrink-0">Имя</span>
                <input
                  value={alias}
                  onChange={e => setAlias(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-right focus:outline-none placeholder:text-muted-foreground/50 py-3"
                  placeholder="Иван Мастеров"
                />
              </div>

              {/* City */}
              <div className="flex items-center px-4 gap-3 min-h-[52px]">
                <span className="text-sm text-muted-foreground w-20 flex-shrink-0">Город</span>
                <select
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-right focus:outline-none appearance-none py-3 cursor-pointer"
                  dir="rtl"
                >
                  {city && !availableCities.includes(city) && <option value={city}>{city}</option>}
                  <option value="">{availableCities.length === 0 ? "Загрузка..." : "Выберите город"}</option>
                  {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Phone */}
              <div className="flex items-center px-4 gap-3 min-h-[52px]">
                <span className="text-sm text-muted-foreground w-20 flex-shrink-0">Телефон</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-right focus:outline-none placeholder:text-muted-foreground/50 py-3"
                  placeholder="+7 (999) 000-00-00"
                />
              </div>

            </div>
          </div>

          {/* Specializations + inline prices — iOS list */}
          <div>
            <div className="flex items-end justify-between mb-2 px-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Специализации</p>
              {selectedSpecs.length > 0 && (
                <p className="text-xs text-primary font-medium">{selectedSpecs.length} выбрано</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-3 px-1">
              Нажмите чтобы выбрать. Укажите цену «от» рядом с каждой.
            </p>

            {availableSpecs.length === 0 ? (
              <div className="flex items-center justify-center h-20 bg-muted/40 rounded-2xl">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="bg-muted/50 rounded-2xl overflow-hidden divide-y divide-border/60">
                {availableSpecs.map(s => {
                  const selected = selectedSpecs.includes(s);
                  return (
                    <div key={s} className="flex items-center gap-3 px-4 min-h-[52px]">
                      {/* Checkbox */}
                      <button
                        type="button"
                        onClick={() => toggleSpec(s)}
                        className="flex items-center gap-3 flex-1 min-w-0 py-3"
                      >
                        <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          selected
                            ? "bg-primary border-primary"
                            : "border-border bg-background"
                        }`}>
                          {selected && <Check size={13} className="text-primary-foreground" strokeWidth={2.5} />}
                        </span>
                        <span className={`text-sm leading-snug ${selected ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                          {s}
                        </span>
                      </button>

                      {/* Inline price input — only when selected */}
                      {selected && (
                        <div className="relative flex-shrink-0">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={prices[s] ?? ""}
                            onChange={e => setPrices(p => ({ ...p, [s]: e.target.value.replace(/\D/g, "") }))}
                            placeholder="0"
                            className="w-24 h-10 pl-3 pr-7 rounded-xl border border-border bg-background text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/40"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">₽</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Pinned save footer — always visible above bottom nav */}
        <div className="px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom,20px))] border-t border-border/60 flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full h-12 bg-primary text-primary-foreground font-bold rounded-2xl text-base active:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading
              ? <Loader2 size={18} className="animate-spin" />
              : <Check size={18} />}
            Сохранить изменения
          </button>
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
                  <p className="text-xs text-muted-foreground">Всего заявок</p>
                  <p className="text-xl font-bold">{data.totalDispatched}</p>
                  <p className="text-[10px] text-muted-foreground/60">за всё время</p>
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
              ({[districts.length > 0 ? `${districts.length} адрес` : "", parseInt(minArea) > 0 ? `от ${minArea} м²` : ""].filter(Boolean).join(", ")})
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
            <label className="text-xs font-semibold text-foreground">Предпочтительные адреса / районы</label>
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
                placeholder="Адрес или район..."
                className="flex-1 h-10 px-3 rounded-xl border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button onClick={addDistrict}
                className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Plus size={16} />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Оставьте пустым чтобы получать заявки из всех адресов и районов</p>
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

// ─── Marketplace Publication Section ─────────────────────────────────────────
//
// Self-service publication of master profile to chestnye-mastera.ru.
// Plan: see MARKETPLACE_PRODUCTION_PLAN.md §11.5
//
// Behaviour: fill the public fields → click «Сохранить». Backend's PATCH /profile
// auto-publishes the profile as soon as all readiness conditions are met for
// the first time (so the public marketplace fills up automatically and the
// master never has to think about a separate "publish" step). After the first
// auto-publish, the profile stays public — only an operator can hide it via
// CRM if there's a complaint.

function MarketplaceProfileSection({
  data,
  onSave,
}: {
  data: ProfileData;
  onSave: (u: Partial<ProfileData>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [publicTitle, setPublicTitle] = useState(data.publicTitle ?? "");
  const [publicBio, setPublicBio] = useState(data.publicBio ?? "");
  const [yearsExperience, setYearsExperience] = useState(
    data.yearsExperience !== null ? String(data.yearsExperience) : "",
  );
  const [errors, setErrors] = useState<PublicationError[]>([]);
  const [busy, setBusy] = useState(false);

  const errorsByField = (field: string) => errors.filter(e => e.field === field);
  const generalErrors = errors.filter(e => !e.field);

  const yearsNum = yearsExperience === "" ? null : Number(yearsExperience);
  const yearsValid = yearsNum !== null && Number.isInteger(yearsNum) && yearsNum >= 0 && yearsNum <= 70;

  const checklist: { ok: boolean; label: string }[] = [
    { ok: !!data.alias, label: "Имя в профиле" },
    { ok: !!data.city, label: "Город" },
    { ok: !!data.phone, label: "Телефон (для оператора, не публикуется)" },
    { ok: data.specializations.length > 0, label: "Специализация" },
    { ok: data.servicePrices.length >= 2, label: `Цены минимум на 2 услуги (сейчас ${data.servicePrices.length})` },
    { ok: !!data.customAvatarUrl, label: "Фото профиля" },
    { ok: publicBio.trim().length >= 300, label: `Описание о себе ≥ 300 символов (сейчас ${publicBio.trim().length})` },
    { ok: yearsValid, label: "Опыт работы (0–70 лет)" },
  ];
  const allFilled = checklist.every(c => c.ok);

  const handleSave = async () => {
    setBusy(true);
    setErrors([]);
    try {
      const payload = {
        publicTitle: publicTitle.trim() || null,
        publicBio: publicBio.trim() || null,
        yearsExperience: yearsValid ? yearsNum : null,
      };
      const res: any = await api.updateProfile(payload);

      // Update local state from backend response (source of truth)
      onSave({
        ...payload as Partial<ProfileData>,
        slug: res.slug ?? data.slug,
        isPublished: res.isPublished ?? data.isPublished,
        publishedAt: res.publishedAt ?? data.publishedAt,
        profileUrl: res.profileUrl ?? null,
      });

      // Toast based on auto-publish outcome
      if (res.autoPublished) {
        toast.success("Профиль обновлён и опубликован на сайте 🎉");
      } else if (res.isPublished) {
        toast.success("Сохранено и обновлено на сайте");
      } else if (res.readinessErrors && res.readinessErrors.length > 0) {
        toast.success("Сохранено. Заполните оставшиеся поля для публикации.");
      } else {
        toast.success("Сохранено");
      }
    } catch (e: any) {
      const errData = e.data;
      if (errData?.errors && Array.isArray(errData.errors)) {
        setErrors(errData.errors);
        toast.error("Не удалось сохранить — проверьте поля.");
      } else {
        toast.error(e.message ?? "Ошибка сохранения");
      }
    } finally {
      setBusy(false);
    }
  };

  // Banner state — drives header and call-to-action wording
  type BannerState = "complete-published" | "complete-ready" | "incomplete";
  const banner: BannerState = data.isPublished
    ? "complete-published"
    : allFilled
      ? "complete-ready"
      : "incomplete";

  const saveBtnLabel =
    banner === "complete-ready"
      ? "Сохранить и опубликовать"
      : banner === "complete-published"
        ? "Сохранить"
        : "Сохранить";

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Globe size={15} className="text-primary" />
          <span>Публичный профиль на сайте</span>
          {data.isPublished
            ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">Опубликован</span>
            : <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">Заполните для публикации</span>}
        </div>
        <ChevronDown size={16} className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border pt-3 space-y-4">
          {/* Status banner */}
          {banner === "complete-published" && data.profileUrl && (
            <a
              href={data.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 text-xs font-medium"
            >
              <span className="truncate">Открыть карточку: {data.profileUrl.replace(/^https?:\/\//, "")}</span>
              <ExternalLink size={14} className="flex-shrink-0" />
            </a>
          )}

          {banner === "complete-ready" && (
            <div className="px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200 text-xs">
              Готово к публикации. После сохранения карточка появится на сайте автоматически.
            </div>
          )}

          {banner === "incomplete" && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Заполните поля ниже — карточка появится в каталоге <strong>chestnye-mastera.ru</strong> автоматически,
              как только все пункты будут готовы. Клиенты находят мастеров в Яндексе по услугам и городу.
            </p>
          )}

          {/* Readiness checklist (helpful for both states) */}
          <div className="bg-muted/40 rounded-xl p-3 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">
              {data.isPublished ? "Чек-лист профиля:" : "Готовность:"}
            </p>
            {checklist.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${c.ok ? "bg-green-500" : "bg-muted-foreground/30"}`}>
                  {c.ok && <Check size={10} className="text-white" strokeWidth={3} />}
                </span>
                <span className={c.ok ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
              </div>
            ))}
          </div>

          {/* publicTitle */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Заголовок карточки <span className="text-muted-foreground font-normal">(опц.)</span></span>
              <span className="text-muted-foreground font-normal">{publicTitle.length}/150</span>
            </label>
            <input
              value={publicTitle}
              onChange={e => setPublicTitle(e.target.value.slice(0, 150))}
              placeholder={`${data.alias}, ${data.specializations[0] ?? "мастер"} в ${data.city}`}
              className="w-full h-10 px-3 rounded-xl border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {errorsByField("publicTitle").map((e, i) => (
              <p key={i} className="text-xs text-destructive">{e.message}</p>
            ))}
            <p className="text-[11px] text-muted-foreground">
              Если оставить пустым — будет «{data.alias}, {data.specializations[0] ?? "мастер"} в {data.city}».
            </p>
          </div>

          {/* publicBio */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>О себе <span className="text-destructive">*</span></span>
              <span className={`font-normal ${publicBio.trim().length < 300 ? "text-destructive" : "text-muted-foreground"}`}>
                {publicBio.trim().length}/2000 (мин. 300)
              </span>
            </label>
            <textarea
              value={publicBio}
              onChange={e => setPublicBio(e.target.value.slice(0, 2000))}
              rows={6}
              placeholder="Расскажите о своём опыте, любимых видах работ, подходе к клиентам. Без телефонов, email и ссылок — связь идёт через сайт."
              className="w-full px-3 py-2 rounded-xl border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y leading-relaxed"
            />
            {errorsByField("publicBio").map((e, i) => (
              <p key={i} className="text-xs text-destructive">{e.message}</p>
            ))}
          </div>

          {/* yearsExperience */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">
              Опыт работы (лет) <span className="text-destructive">*</span>
            </label>
            <input
              type="number"
              min={0}
              max={70}
              value={yearsExperience}
              onChange={e => setYearsExperience(e.target.value)}
              placeholder="Например, 5"
              className="w-32 h-10 px-3 rounded-xl border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {errorsByField("yearsExperience").map((e, i) => (
              <p key={i} className="text-xs text-destructive">{e.message}</p>
            ))}
            <p className="text-[11px] text-muted-foreground">Можно указать 0, если только начинаете.</p>
          </div>

          {/* General (no field) errors */}
          {generalErrors.length > 0 && (
            <div className="bg-destructive/10 rounded-xl p-3 space-y-1">
              {generalErrors.map((e, i) => (
                <p key={i} className="text-xs text-destructive">{e.message}</p>
              ))}
            </div>
          )}

          {/* Single Save button */}
          <button
            onClick={handleSave}
            disabled={busy}
            className={`w-full h-11 rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2 ${
              banner === "complete-ready"
                ? "bg-primary text-primary-foreground"
                : "bg-primary/10 text-primary"
            }`}
          >
            {busy
              ? <div className={`w-4 h-4 border-2 border-t-transparent rounded-full animate-spin ${banner === "complete-ready" ? "border-primary-foreground" : "border-primary"}`} />
              : banner === "complete-ready" ? <Globe size={14} /> : <Check size={14} />}
            {saveBtnLabel}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Portfolio Section ─────────────────────────────────────────────────────
//
// Self-service portfolio CRUD for master-pwa. Each case is a before/after
// photo set + description + price/area/date metadata. Master adds, edits,
// or deletes their own cases. Cases auto-publish when title + description
// pass moderation AND ≥1 photo is uploaded (backend evaluates on every save).
//
// Plan: see MARKETPLACE_PRODUCTION_PLAN.md §11.5 → "Портфолио в V1".

interface PortfolioItem {
  id: number;
  title: string;
  description: string | null;
  serviceTypeId: number | null;
  cityId: number | null;
  beforePhotos: string[];
  afterPhotos: string[];
  priceFrom: string | null;
  priceTo: string | null;
  area: string | null;
  completedAt: string | null;
  isPublished: boolean;
  isFeatured: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface ServiceOption { id: number; name: string }

function PortfolioSection({ data }: { data: ProfileData }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PortfolioItem[] | null>(null);
  const [limit, setLimit] = useState(30);
  const [editing, setEditing] = useState<{ item: PortfolioItem | null } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.portfolio.list();
      setItems(res.items ?? []);
      setLimit(res.limit ?? 30);
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && items === null) load();
  }, [open]);

  const upsertItem = (item: PortfolioItem) => {
    setItems((prev) => {
      if (!prev) return [item];
      const idx = prev.findIndex((p) => p.id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = item;
        return next;
      }
      return [item, ...prev];
    });
  };
  const removeItem = (id: number) => {
    setItems((prev) => prev?.filter((p) => p.id !== id) ?? null);
  };

  const used = items?.length ?? 0;
  const canAdd = items !== null && used < limit;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <button onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <Briefcase size={15} className="text-primary" />
          <span>Мои работы</span>
          {items !== null && (
            <span className="text-xs text-muted-foreground font-normal">{used}/{limit}</span>
          )}
        </div>
        <ChevronDown size={16} className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Покажите свои работы клиентам. Фото «до/после» — самое важное:
            на них смотрят в первую очередь. Кейсы появятся на вашей странице
            сайта <strong>chestnye-mastera.ru</strong> сразу после сохранения.
          </p>

          {loading && items === null ? (
            <div className="flex items-center justify-center h-20">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : null}

          {items && items.length === 0 ? (
            <div className="bg-muted/40 rounded-xl p-6 text-center text-xs text-muted-foreground">
              Кейсов пока нет. Добавьте первый — это поднимет вашу карточку в Яндексе.
            </div>
          ) : null}

          {items && items.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {items.map((item) => (
                <PortfolioCard key={item.id} item={item} onEdit={() => setEditing({ item })} />
              ))}
            </div>
          ) : null}

          {canAdd ? (
            <button
              onClick={() => setEditing({ item: null })}
              className="w-full h-11 rounded-xl border border-dashed border-primary/50 text-primary text-sm font-semibold hover:bg-primary/5 flex items-center justify-center gap-2"
            >
              <Plus size={15} /> Добавить кейс
            </button>
          ) : items && used >= limit ? (
            <p className="text-xs text-muted-foreground text-center">
              Достигнут лимит {limit} кейсов. Удалите старые перед добавлением новых.
            </p>
          ) : null}
        </div>
      )}

      {editing && (
        <PortfolioEditor
          masterCity={data.city}
          existingItem={editing.item}
          onSaved={(item) => { upsertItem(item); setEditing(null); }}
          onDeleted={(id) => { removeItem(id); setEditing(null); }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function PortfolioCard({ item, onEdit }: { item: PortfolioItem; onEdit: () => void }) {
  const cover = item.afterPhotos[0] ?? item.beforePhotos[0] ?? null;
  return (
    <button
      onClick={onEdit}
      className="text-left rounded-xl overflow-hidden border border-border bg-muted/30 hover:border-primary/40 transition-colors"
    >
      <div className="aspect-square bg-muted relative">
        {cover ? (
          <img src={cover} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <ImageIcon size={28} />
          </div>
        )}
        <span
          className={`absolute top-1.5 left-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            item.isPublished
              ? "bg-green-100 text-green-700"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {item.isPublished ? "На сайте" : "Черновик"}
        </span>
      </div>
      <div className="p-2">
        <p className="text-xs font-semibold text-foreground line-clamp-2 leading-tight min-h-[2.4em]">
          {item.title}
        </p>
      </div>
    </button>
  );
}

function PortfolioEditor({
  masterCity,
  existingItem,
  onSaved,
  onDeleted,
  onClose,
}: {
  masterCity: string;
  existingItem: PortfolioItem | null;
  onSaved: (item: PortfolioItem) => void;
  onDeleted: (id: number) => void;
  onClose: () => void;
}) {
  const [currentId, setCurrentId] = useState<number | null>(existingItem?.id ?? null);
  const [title, setTitle] = useState(existingItem?.title ?? "");
  const [description, setDescription] = useState(existingItem?.description ?? "");
  const [serviceTypeId, setServiceTypeId] = useState<number | null>(existingItem?.serviceTypeId ?? null);
  const [priceFrom, setPriceFrom] = useState(existingItem?.priceFrom ?? "");
  const [priceTo, setPriceTo] = useState(existingItem?.priceTo ?? "");
  const [area, setArea] = useState(existingItem?.area ?? "");
  const [completedAt, setCompletedAt] = useState(
    existingItem?.completedAt ? new Date(existingItem.completedAt).toISOString().slice(0, 10) : "",
  );
  const [beforePhotos, setBeforePhotos] = useState<string[]>(existingItem?.beforePhotos ?? []);
  const [afterPhotos, setAfterPhotos] = useState<string[]>(existingItem?.afterPhotos ?? []);
  const [errors, setErrors] = useState<PublicationError[]>([]);
  const [busy, setBusy] = useState(false);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const beforeInputRef = useRef<HTMLInputElement>(null);
  const afterInputRef = useRef<HTMLInputElement>(null);

  // ── "Помощник" state — structured description builder + AI smoother ─────
  // Discussed in chat (auto-generated text hurts SEO; structured user-supplied
  // tezisy + optional AI light-edit is the safe pattern). The fields below
  // are NOT persisted server-side — they live only inside the editor session
  // and are converted into the `description` paragraph via api.portfolio.assembleDescription().
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistBefore, setAssistBefore] = useState("");
  const [assistSteps, setAssistSteps] = useState("");
  const [assistMaterials, setAssistMaterials] = useState("");
  const [assistChallenges, setAssistChallenges] = useState("");
  const [assistOther, setAssistOther] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [smoothBusy, setSmoothBusy] = useState(false);
  // 503 from /smooth-description means AI is not configured — hide the
  // button after the first failure to avoid teasing masters with a feature
  // that doesn't work on this deployment.
  const [smoothDisabled, setSmoothDisabled] = useState(false);

  const handleAssemble = async () => {
    setAssistantBusy(true);
    try {
      const res = await api.portfolio.assembleDescription({
        before: assistBefore.trim() || undefined,
        steps: assistSteps.trim() || undefined,
        materials: assistMaterials.trim() || undefined,
        challenges: assistChallenges.trim() || undefined,
        otherDetails: assistOther.trim() || undefined,
      });
      const text = (res.description ?? "").trim();
      if (!text) {
        toast.error("Заполните хотя бы одно поле в помощнике.");
        return;
      }
      // If user already had a description, ask before overwriting.
      if (description.trim().length > 0
          && !confirm("Заменить текущее описание собранным текстом?")) {
        return;
      }
      setDescription(text.slice(0, 2000));
      toast.success("Готово. Можно отредактировать вручную.");
      setAssistantOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Не удалось собрать абзац");
    } finally {
      setAssistantBusy(false);
    }
  };

  const handleSmooth = async () => {
    const text = description.trim();
    if (text.length < 20) {
      toast.error("Слишком короткий текст для AI-редактирования.");
      return;
    }
    setSmoothBusy(true);
    try {
      const res = await api.portfolio.smoothDescription(text);
      if (!res.description) {
        toast.error(res.note ?? "Не удалось обработать текст.");
        return;
      }
      if (!confirm("Заменить текущее описание AI-улучшенным вариантом?\n\nAI не добавляет фактов — только полирует грамматику и связки.")) {
        return;
      }
      setDescription(res.description.slice(0, 2000));
      toast.success("Готово.");
    } catch (e: any) {
      if (e?.status === 503) {
        setSmoothDisabled(true);
        toast.error("AI-помощник временно недоступен.");
        return;
      }
      toast.error(e?.message ?? "Ошибка");
    } finally {
      setSmoothBusy(false);
    }
  };

  useEffect(() => {
    fetch("/api/settings/services")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: ServiceOption[]) => setServices(d ?? []))
      .catch(() => {});
  }, []);

  const errorsByField = (field: string) => errors.filter((e) => e.field === field);
  const titleLen = title.trim().length;
  const descLen = description.trim().length;
  const totalPhotos = beforePhotos.length + afterPhotos.length;

  // Photos can only be uploaded after a draft case exists in DB. Auto-create
  // the draft on first photo upload (or first save).
  const ensureCaseId = async (): Promise<number> => {
    if (currentId) return currentId;
    const res = await api.portfolio.create({
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      serviceTypeId,
      priceFrom: priceFrom || undefined,
      priceTo: priceTo || undefined,
      area: area || undefined,
      completedAt: completedAt || undefined,
    });
    setCurrentId(res.item.id);
    return res.item.id;
  };

  const handleAddPhoto = async (type: "before" | "after", file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Выберите изображение");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Файл больше 8 МБ — слишком большой");
      return;
    }
    setBusy(true);
    try {
      const id = await ensureCaseId();
      const res = await api.portfolio.uploadPhoto(id, type, file);
      if (type === "before") setBeforePhotos((p) => [...p, res.url]);
      else setAfterPhotos((p) => [...p, res.url]);
    } catch (e: any) {
      const data = e.data;
      const msg = data?.errors?.[0]?.message ?? e.message ?? "Ошибка загрузки фото";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleRemovePhoto = async (type: "before" | "after", url: string) => {
    if (!currentId) return;
    setBusy(true);
    try {
      await api.portfolio.removePhoto(currentId, type, url);
      if (type === "before") setBeforePhotos((p) => p.filter((u) => u !== url));
      else setAfterPhotos((p) => p.filter((u) => u !== url));
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    setBusy(true);
    setErrors([]);
    try {
      const id = await ensureCaseId();
      const res = await api.portfolio.update(id, {
        title: title.trim() || null,
        description: description.trim() || null,
        serviceTypeId,
        priceFrom: priceFrom || null,
        priceTo: priceTo || null,
        area: area || null,
        completedAt: completedAt || null,
      });
      onSaved(res.item);
      toast.success(res.item.isPublished
        ? "Кейс сохранён и опубликован на сайте 🎉"
        : "Сохранено. Добавьте фото для публикации.");
    } catch (e: any) {
      const data = e.data;
      if (data?.errors && Array.isArray(data.errors)) {
        setErrors(data.errors);
        toast.error("Исправьте ошибки в полях.");
      } else {
        toast.error(e.message ?? "Ошибка сохранения");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!currentId) { onClose(); return; }
    if (!confirm("Удалить кейс? Действие не отменить.")) return;
    setBusy(true);
    try {
      await api.portfolio.remove(currentId);
      onDeleted(currentId);
      toast.success("Кейс удалён");
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-[480px] bg-card rounded-t-2xl flex flex-col"
        style={{ height: "94dvh", maxHeight: "94dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        <div className="px-4 pt-1 pb-3 flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="text-muted-foreground h-9 w-9 flex items-center justify-center rounded-xl active:bg-muted"
          >
            <X size={20} />
          </button>
          <h3 className="font-bold text-base flex-1 text-center">
            {existingItem ? "Редактировать кейс" : "Новый кейс"}
          </h3>
          <button
            onClick={handleSave}
            disabled={busy}
            className="h-9 px-4 bg-primary text-primary-foreground font-semibold rounded-xl text-sm active:opacity-80 disabled:opacity-50 flex items-center gap-1.5"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : null}
            Готово
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain flex-1 min-h-0 basis-0 px-4 pb-4 space-y-4">
          {/* Title */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Название кейса <span className="text-destructive">*</span></span>
              <span className={`font-normal ${titleLen < 5 || titleLen > 200 ? "text-destructive" : "text-muted-foreground"}`}>
                {titleLen}/200 (мин. 5)
              </span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 200))}
              placeholder="Например, «Ремонт ванной 4 м² за 7 дней»"
              className="w-full h-10 px-3 rounded-xl border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {errorsByField("title").map((e, i) => (
              <p key={i} className="text-xs text-destructive">{e.message}</p>
            ))}
          </div>

          {/* Description Assistant — structured fields → assembled paragraph */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden">
            <button
              type="button"
              onClick={() => setAssistantOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left active:bg-primary/10"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Wand2 size={14} className="text-primary" />
                Помощник: собрать описание из тезисов
              </span>
              <ChevronDown
                size={16}
                className={`text-muted-foreground transition-transform ${assistantOpen ? "rotate-180" : ""}`}
              />
            </button>
            {assistantOpen ? (
              <div className="px-3 pb-3 space-y-2 border-t border-primary/15">
                <p className="text-[11px] text-muted-foreground pt-2 leading-relaxed">
                  Заполните 1-3 поля своими словами. Из тезисов соберём связный абзац — без AI, без вымысла.
                </p>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-foreground">Что было ДО ремонта</label>
                  <input
                    value={assistBefore}
                    onChange={(e) => setAssistBefore(e.target.value.slice(0, 500))}
                    placeholder="старая плитка, плесень, проводка наружу"
                    className="w-full h-9 px-3 rounded-lg border border-border bg-card text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-foreground">Что вы сделали (по шагам, каждый шаг с новой строки)</label>
                  <textarea
                    value={assistSteps}
                    onChange={(e) => setAssistSteps(e.target.value.slice(0, 1500))}
                    rows={4}
                    placeholder={"снял старое покрытие\nпроложил новые трубы\nположил тёплый пол"}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-card text-xs resize-y leading-relaxed"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-foreground">Использованные материалы</label>
                  <textarea
                    value={assistMaterials}
                    onChange={(e) => setAssistMaterials(e.target.value.slice(0, 1000))}
                    rows={2}
                    placeholder="плитка Cersanit 30×60, затирка Litokol, гидроизоляция"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-card text-xs resize-y"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-foreground">Что было сложно (если что-то)</label>
                  <input
                    value={assistChallenges}
                    onChange={(e) => setAssistChallenges(e.target.value.slice(0, 600))}
                    placeholder="трубы под полом нужно было перекладывать"
                    className="w-full h-9 px-3 rounded-lg border border-border bg-card text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-foreground">Что-то ещё (опционально)</label>
                  <input
                    value={assistOther}
                    onChange={(e) => setAssistOther(e.target.value.slice(0, 600))}
                    placeholder="клиент остался доволен, заехал через неделю"
                    className="w-full h-9 px-3 rounded-lg border border-border bg-card text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAssemble}
                  disabled={assistantBusy || (!assistBefore.trim() && !assistSteps.trim() && !assistMaterials.trim() && !assistChallenges.trim() && !assistOther.trim())}
                  className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {assistantBusy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                  Собрать абзац
                </button>
              </div>
            ) : null}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Описание работы <span className="text-destructive">*</span></span>
              <span className={`font-normal ${descLen < 50 ? "text-destructive" : "text-muted-foreground"}`}>
                {descLen}/2000 (мин. 50)
              </span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
              rows={5}
              placeholder="Что делали, какие материалы, сложности, результат. Без телефонов и ссылок."
              className="w-full px-3 py-2 rounded-xl border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y leading-relaxed"
            />
            {!smoothDisabled && description.trim().length >= 20 ? (
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <p className="text-[10px] text-muted-foreground leading-relaxed flex-1">
                  AI не добавит фактов — только подправит грамматику и сделает связнее. Используйте после ручного редактирования.
                </p>
                <button
                  type="button"
                  onClick={handleSmooth}
                  disabled={smoothBusy}
                  className="h-8 px-2.5 rounded-lg border border-primary/30 bg-card text-[11px] font-semibold text-primary disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                >
                  {smoothBusy ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                  Сделать читаемым
                </button>
              </div>
            ) : null}
            {errorsByField("description").map((e, i) => (
              <p key={i} className="text-xs text-destructive">{e.message}</p>
            ))}
          </div>

          {/* Service */}
          {services.length > 0 ? (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Категория услуги</label>
              <select
                value={serviceTypeId ?? ""}
                onChange={(e) => setServiceTypeId(e.target.value ? Number(e.target.value) : null)}
                className="w-full h-10 px-3 rounded-xl border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">— не выбрана —</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Price + Area */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Цена от ₽</label>
              <input
                type="text"
                inputMode="numeric"
                value={priceFrom}
                onChange={(e) => setPriceFrom(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="20000"
                className="w-full h-10 px-3 rounded-xl border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Цена до ₽</label>
              <input
                type="text"
                inputMode="numeric"
                value={priceTo}
                onChange={(e) => setPriceTo(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="35000"
                className="w-full h-10 px-3 rounded-xl border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Площадь, м²</label>
              <input
                type="text"
                inputMode="decimal"
                value={area}
                onChange={(e) => setArea(e.target.value.replace(/[^\d.,]/g, "").replace(",", "."))}
                placeholder="4.5"
                className="w-full h-10 px-3 rounded-xl border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Дата завершения</label>
              <input
                type="date"
                value={completedAt}
                onChange={(e) => setCompletedAt(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Город — {masterCity || "не указан"} (берётся из профиля).
          </p>

          {/* Photos */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">
              Фото <span className="text-destructive">*</span>
              <span className="text-muted-foreground font-normal"> — хотя бы одно</span>
            </p>
            {errorsByField("photos").map((e, i) => (
              <p key={i} className="text-xs text-destructive">{e.message}</p>
            ))}
            <PhotoGrid
              label="До"
              photos={beforePhotos}
              busy={busy}
              limit={10}
              inputRef={beforeInputRef}
              onAdd={(file) => handleAddPhoto("before", file)}
              onRemove={(url) => handleRemovePhoto("before", url)}
            />
            <PhotoGrid
              label="После"
              photos={afterPhotos}
              busy={busy}
              limit={10}
              inputRef={afterInputRef}
              onAdd={(file) => handleAddPhoto("after", file)}
              onRemove={(url) => handleRemovePhoto("after", url)}
            />
          </div>

          {/* Status preview */}
          <div className="bg-muted/40 rounded-xl p-3 text-xs space-y-1">
            <p className="text-muted-foreground">
              Кейс {totalPhotos === 0 || titleLen < 5 || descLen < 50
                ? "будет сохранён как черновик."
                : "опубликуется на сайте после сохранения."}
            </p>
          </div>

          {/* Delete (only for existing items) */}
          {currentId ? (
            <button
              onClick={handleDelete}
              disabled={busy}
              className="w-full h-11 rounded-xl border border-destructive/40 text-destructive text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <Trash2 size={14} /> Удалить кейс
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PhotoGrid({
  label,
  photos,
  busy,
  limit,
  inputRef,
  onAdd,
  onRemove,
}: {
  label: string;
  photos: string[];
  busy: boolean;
  limit: number;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onAdd: (file: File) => void;
  onRemove: (url: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((url) => (
          <div key={url} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              onClick={() => onRemove(url)}
              disabled={busy}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-50"
              aria-label="Удалить фото"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {photos.length < limit ? (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="aspect-square rounded-lg border-2 border-dashed border-border bg-muted/30 hover:border-primary/40 flex items-center justify-center disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
            ) : (
              <Plus size={20} className="text-muted-foreground" />
            )}
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onAdd(f);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
    </div>
  );
}

export default function ProfilePage() {
  const { logout } = useAuth();
  const [, navigate] = useLocation();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [unlinkingMax, setUnlinkingMax] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
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

  // Convert any image (HEIC/JPEG/PNG) to JPEG via canvas before upload
  async function convertToJpeg(file: File, maxSize = 1200): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            } else {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("Canvas not available"));
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else reject(new Error("Canvas toBlob failed"));
            },
            "image/jpeg",
            0.9
          );
        };
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Выберите изображение"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Файл не должен превышать 5 МБ"); return; }

    setUploading(true);
    try {
      const jpegBlob = await convertToJpeg(file);
      const jpegFile = new File([jpegBlob], "avatar.jpg", { type: "image/jpeg" });
      const fd = new FormData();
      fd.append("avatar", jpegFile);
      const res = await fetch("/api/master-pwa/profile/avatar", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) throw new Error("Ошибка загрузки");
      const { customAvatarUrl } = await res.json();
      console.log("[avatar upload] customAvatarUrl:", customAvatarUrl);
      setData(d => d ? { ...d, customAvatarUrl } : d);
      setAvatarError(false);
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
  console.log("[render] customAvatarUrl:", data.customAvatarUrl);

  return (
    <div className="px-4 pt-5 pb-4 space-y-5">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          {data.customAvatarUrl && !avatarError ? (
            <img
              src={data.customAvatarUrl}
              alt={data.alias}
              className="w-14 h-14 rounded-full object-cover"
              onError={() => {
                console.error("[avatar] failed to load:", data.customAvatarUrl);
                setAvatarError(true);
              }}
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-lg font-bold">
              {initials}
            </div>
          )}

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-primary border-2 border-background flex items-center justify-center shadow-md active:opacity-80 disabled:opacity-50 transition-opacity"
          >
            {uploading
              ? <div className="w-2.5 h-2.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              : <Camera size={11} className="text-primary-foreground" />}
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
          className="flex items-center gap-3 bg-card rounded-xl px-4 py-3 shadow-sm"
        >
          <Phone size={16} className="text-primary" />
          <span className="text-sm font-medium">{data.phone}</span>
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
        <div className="bg-card rounded-2xl p-4 shadow-sm space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Метки</p>
          <div className="flex flex-wrap gap-2">
            {data.tags.map(tag => (
              <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Всего заказов" value={data.totalOrders} icon={<Briefcase size={14} />} colorClass="bg-gradient-to-br from-blue-500 to-blue-600" />
        <StatCard label="В работе" value={data.activeCount} icon={<Clock size={14} />} colorClass="bg-gradient-to-br from-amber-500 to-orange-500" />
        <StatCard label="Завершено" value={data.completedCount} icon={<BadgeCheck size={14} />} colorClass="bg-gradient-to-br from-emerald-500 to-teal-600" />
        <StatCard label="Отменено" value={data.cancelledCount} icon={<X size={14} />} colorClass="bg-gradient-to-br from-rose-500 to-pink-600" />
      </div>

      {/* Analytics */}
      <AnalyticsSection />

      {/* Order filters */}
      <OrderFiltersSection data={data} onSave={updated => setData(d => d ? { ...d, ...updated } : d)} />

      {/* Working hours */}
      <WorkingHoursSection data={data} onSave={updated => setData(d => d ? { ...d, ...updated } : d)} />

      {/* Marketplace publication — chestnye-mastera.ru */}
      <MarketplaceProfileSection data={data} onSave={updated => setData(d => d ? { ...d, ...updated } : d)} />

      {/* Portfolio — public cases on chestnye-mastera.ru/master/<slug> */}
      <PortfolioSection data={data} />

      {/* Service prices — read-only, edit via profile modal */}
      {(data.servicePrices ?? []).length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
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
          <div className="grid grid-cols-2 gap-2.5">
            {(data.servicePrices ?? []).map((p, i) => (
              <div key={i} className="bg-card rounded-xl p-3 shadow-sm border-l-4 border-l-primary space-y-1">
                <p className="text-xs text-muted-foreground leading-tight">{p.service}</p>
                <p className="text-sm font-bold text-primary">от {p.priceFrom.toLocaleString("ru-RU")} ₽</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Max Bot Connection ───────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Бот Max</span>
            {data.maxChatId
              ? <span className="text-[10px] bg-green-100 text-green-700 font-semibold px-1.5 py-0.5 rounded-full">Подключён</span>
              : <span className="text-[10px] bg-muted text-muted-foreground font-medium px-1.5 py-0.5 rounded-full">Не привязан</span>
            }
          </div>
        </div>

        {data.maxChatId ? (
          <div className="px-4 py-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Уведомления о заказах и сообщения от оператора приходят в приложение Max.
            </p>
            <button
              onClick={async () => {
                if (!confirm("Отвязать аккаунт Max? Вы перестанете получать уведомления о заказах.")) return;
                setUnlinkingMax(true);
                try {
                  const r = await fetch("/api/master-pwa/max-link", { method: "DELETE", credentials: "include" });
                  if (!r.ok) throw new Error((await r.json()).error ?? "Ошибка");
                  setData(d => d ? { ...d, maxChatId: null } : d);
                  toast.success("Аккаунт Max отвязан");
                } catch (e: any) {
                  toast.error(e.message ?? "Не удалось отвязать");
                } finally {
                  setUnlinkingMax(false);
                }
              }}
              disabled={unlinkingMax}
              className="w-full flex items-center justify-center gap-2 h-10 rounded-xl border border-destructive/40 text-destructive text-sm font-medium active:opacity-80 disabled:opacity-50"
            >
              {unlinkingMax
                ? <div className="w-4 h-4 border-2 border-destructive border-t-transparent rounded-full animate-spin" />
                : <X size={14} />}
              Отвязать аккаунт Max
            </button>
          </div>
        ) : (
          <div className="px-4 py-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Чтобы получать уведомления о заказах, привяжите аккаунт Max:
            </p>
            <ol className="text-xs text-muted-foreground space-y-1 pl-4 list-decimal">
              <li>Откройте бот <strong>Честный мастер</strong> в приложении Max</li>
              <li>Отправьте ваш номер телефона: <strong>{data.phone ?? "укажите в профиле"}</strong></li>
              <li>Подтвердите привязку, ответив <strong>ДА</strong></li>
            </ol>
            {data.maxBotLink && (
              <a
                href={data.maxBotLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:opacity-80"
              >
                <ExternalLink size={14} />
                Открыть бот Max
              </a>
            )}
          </div>
        )}
      </div>

      <button
        onClick={() => navigate("/work-rules")}
        className="w-full flex items-center justify-between px-4 h-12 rounded-xl border border-border bg-card text-foreground font-semibold text-sm active:opacity-80 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <BookOpen size={14} className="text-primary-foreground" />
          </span>
          Правила работы
        </div>
        <ChevronRight size={16} className="text-muted-foreground" />
      </button>

      {data.contractSignedAt ? (
        <a
          href={`/api/contract/view/${data.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-between px-4 h-12 rounded-xl border border-border bg-card text-foreground font-semibold text-sm active:opacity-80 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={14} className="text-white" />
            </span>
            Мой договор
          </div>
          <ExternalLink size={16} className="text-muted-foreground" />
        </a>
      ) : (
        <button
          onClick={() => navigate("/pending-contract")}
          className="w-full flex items-center justify-between px-4 h-12 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 font-semibold text-sm active:opacity-80 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-amber-400 flex items-center justify-center flex-shrink-0">
              <FileSignature size={14} className="text-white" />
            </span>
            Подписать договор
          </div>
          <ChevronRight size={16} className="text-amber-500" />
        </button>
      )}

      <a
        href={`${import.meta.env.BASE_URL}contract-template.pdf`}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full flex items-center justify-between px-4 h-12 rounded-xl border border-border bg-card text-foreground font-semibold text-sm active:opacity-80 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
            <FileText size={14} className="text-white" />
          </span>
          Договор с заказчиком (шаблон)
        </div>
        <Download size={16} className="text-muted-foreground" />
      </a>

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
