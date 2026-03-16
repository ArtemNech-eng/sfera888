import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
  User, Phone, MapPin, Star, Briefcase,
  TrendingUp, ShieldCheck, LogOut, ExternalLink,
  BadgeCheck, Camera,
} from "lucide-react";

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

export default function ProfilePage() {
  const { logout } = useAuth();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [uploading, setUploading] = useState(false);
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
        {/* Avatar with upload overlay */}
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
        <div className="flex items-center gap-1 text-amber-500 shrink-0">
          <Star size={18} fill="currentColor" />
          <span className="font-bold text-base">{data.rating.toFixed(1)}</span>
        </div>
      </div>

      {data.phone && (
        <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
          <Phone size={16} className="text-muted-foreground" />
          <span className="text-sm">{data.phone}</span>
        </div>
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
    </div>
  );
}
