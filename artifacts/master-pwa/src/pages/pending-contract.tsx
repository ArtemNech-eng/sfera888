import { useState, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { FileSignature, RefreshCw, LogOut, Camera, CheckCircle, Clock } from "lucide-react";

const CONTRACT_URL = "https://desktop.doki.online/contract/6916b2861ea1593f469a6786";

export default function PendingContractPage() {
  const { master, logout, refresh } = useAuth();
  const [checking, setChecking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(master?.customAvatarUrl ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCheck = async () => {
    setChecking(true);
    try {
      await refresh();
      // If refresh changes status to active, App.tsx will redirect automatically
    } catch {
      toast.error("Ошибка проверки статуса");
    } finally {
      setChecking(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Выберите изображение"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Файл не более 5 МБ"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const res = await fetch("/api/master-pwa/profile/avatar", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) throw new Error();
      const { customAvatarUrl } = await res.json();
      setAvatarUrl(customAvatarUrl);
      toast.success("Фото добавлено");
    } catch {
      toast.error("Не удалось загрузить фото");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const initials = master?.alias?.slice(0, 2)?.toUpperCase() ?? "МС";

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-5 py-10 bg-background relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[500px] h-[350px] rounded-full blur-[120px] opacity-25"
           style={{ background: "radial-gradient(ellipse, #c4b5fd 0%, #a78bfa 50%, transparent 100%)" }} />
      <div className="absolute bottom-0 right-0 w-[200px] h-[200px] rounded-full blur-[80px] opacity-15"
           style={{ background: "#818cf8" }} />

      <div className="w-full max-w-sm space-y-6 relative z-10">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            {avatarUrl ? (
              <img src={avatarUrl} alt={master?.alias}
                className="w-20 h-20 rounded-full object-cover shadow-lg" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                {initials}
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary border-2 border-background flex items-center justify-center shadow-md active:opacity-80 disabled:opacity-50"
            >
              {uploading
                ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Camera size={14} className="text-white" />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div className="text-center">
            <h2 className="font-bold text-lg">{master?.alias}</h2>
            <p className="text-sm text-muted-foreground">{master?.city}</p>
          </div>
        </div>

        {/* Status card */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-amber-600 shrink-0" />
            <p className="font-semibold text-amber-800 text-sm">Ожидает проверки менеджером</p>
          </div>
          <p className="text-xs text-amber-700 leading-relaxed">
            Ваша заявка получена. Подпишите договор о сотрудничестве — после проверки менеджер активирует ваш аккаунт.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-2.5">
          {[
            { done: true, label: "Заявка отправлена" },
            { done: !!avatarUrl, label: avatarUrl ? "Фото добавлено" : "Добавьте фото профиля (необязательно)" },
            { done: false, label: "Подпишите договор" },
            { done: false, label: "Менеджер активирует аккаунт" },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                step.done ? "bg-emerald-500" : "bg-muted border border-border"
              }`}>
                {step.done && <CheckCircle size={12} className="text-white" />}
              </div>
              <p className={`text-sm ${step.done ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                {step.label}
              </p>
            </div>
          ))}
        </div>

        {/* Contract button */}
        <a
          href={CONTRACT_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ minHeight: 52 }}
          className="w-full flex items-center justify-center gap-2 bg-primary text-white font-semibold text-base rounded-xl active:opacity-80 transition-opacity"
        >
          <FileSignature size={18} />
          Подписать договор
        </a>

        {/* Check status */}
        <button
          onClick={handleCheck}
          disabled={checking}
          className="w-full flex items-center justify-center gap-2 h-12 rounded-xl border border-border text-foreground font-medium text-sm active:opacity-80 disabled:opacity-50 transition-opacity"
        >
          {checking
            ? <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            : <RefreshCw size={16} />}
          Проверить статус активации
        </button>

        <button
          onClick={logout}
          className="w-full text-center text-sm text-muted-foreground flex items-center justify-center gap-1.5"
        >
          <LogOut size={14} />
          Выйти
        </button>
      </div>
    </div>
  );
}
