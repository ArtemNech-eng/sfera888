import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  User, Phone, MapPin, Star, Briefcase,
  TrendingUp, ShieldCheck, LogOut, ExternalLink,
  BadgeCheck, Camera, Pencil, Check, X, Loader2,
  BarChart2, Clock, Filter, ChevronDown, Plus,
} from "lucide-react";

interface WorkingHours { start: string; end: string; days: number[]; }

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
  const [availableSpecs, setAvailableSpecs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/settings/services")
      .then(r => r.ok ? r.json() : [])
      .then((d: { id: number; name: string }[]) => setAvailableSpecs(d.map(s => s.name)))
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

    setLoading(true);
    try {
      await api.updateProfile({
        alias: alias.trim(),
        city: city.trim(),
        phone: phone.trim() || undefined,
        specializations: selectedSpecs,
      });
      toast.success("Профиль обновлён");
      onSave({
        alias: alias.trim(),
        city: city.trim(),
        phone: phone.trim() || null,
        specializations: selectedSpecs,
        specialization: selectedSpecs.join(", "),
      });
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка сохранения");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center p-0" onClick={onClose}>
      <div
        className="w-full max-w-[480px] bg-card rounded-t-2xl overflow-y-auto max-h-[90dvh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between">
          <h3 className="font-bold text-lg">Редактировать профиль</h3>
          <button onClick={onClose} className="text-muted-foreground"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Имя / псевдоним</label>
            <input
              value={alias}
              onChange={e => setAlias(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Иван Мастеров"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Город</label>
            <input
              value={city}
              onChange={e => setCity(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Москва"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Телефон</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="+7 (999) 000-00-00"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Специализации</label>
            <div className="flex flex-wrap gap-2">
              {availableSpecs.length === 0 && <p className="text-xs text-muted-foreground">Загрузка...</p>}
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
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 h-12 rounded-xl border border-border text-muted-foreground text-sm font-medium active:opacity-80"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 h-12 bg-primary text-white font-semibold rounded-xl active:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading
                ? <Loader2 size={18} className="animate-spin" />
                : <Check size={18} />}
              Сохранить
            </button>
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
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
