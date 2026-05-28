import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, User, Phone, MapPin, Calendar, Loader2, ChevronRight, Link2, Copy, Check, Bell, BellOff } from "lucide-react";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr;
}

function PushNotificationSection() {
  const [status, setStatus] = useState<"loading" | "unsupported" | "denied" | "subscribed" | "unsubscribed">("loading");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    navigator.serviceWorker.ready.then(async reg => {
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "subscribed" : "unsubscribed");
    }).catch(() => setStatus("unsubscribed"));
  }, []);

  const subscribe = async () => {
    setWorking(true);
    try {
      const keyRes = await fetch("/api/partner/push/vapid-key", { credentials: "include" });
      if (!keyRes.ok) throw new Error("no_vapid");
      const { key } = await keyRes.json();

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });

      const json = sub.toJSON();
      await fetch("/api/partner/push/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      setStatus("subscribed");
    } catch (e: any) {
      if (Notification.permission === "denied") setStatus("denied");
    } finally {
      setWorking(false);
    }
  };

  const unsubscribe = async () => {
    setWorking(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/partner/push/unsubscribe", {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("unsubscribed");
    } catch {} finally {
      setWorking(false);
    }
  };

  if (status === "unsupported") return null;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E5E7EB] space-y-3">
      <div className="flex items-center gap-2">
        <Bell size={16} className="text-[#34C759]" />
        <div className="text-sm font-semibold text-[#111827]">Push-уведомления</div>
      </div>

      {status === "denied" && (
        <div className="text-xs text-[#6B7280] leading-relaxed">
          Уведомления заблокированы в настройках браузера. Разрешите их вручную в настройках.
        </div>
      )}

      {status === "loading" && (
        <div className="flex justify-center py-2"><Loader2 size={18} className="animate-spin text-[#9CA3AF]" /></div>
      )}

      {status === "subscribed" && (
        <>
          <div className="text-xs text-[#6B7280]">Вы получаете уведомления об изменении статусов заявок.</div>
          <button
            onClick={unsubscribe}
            disabled={working}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#E5E7EB] text-xs font-medium text-[#374151] disabled:opacity-50"
          >
            {working ? <Loader2 size={13} className="animate-spin" /> : <BellOff size={13} />}
            Отключить уведомления
          </button>
        </>
      )}

      {status === "unsubscribed" && (
        <>
          <div className="text-xs text-[#6B7280]">Включите уведомления, чтобы узнавать об одобрении и отклонении заявок.</div>
          <button
            onClick={subscribe}
            disabled={working}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#34C759] text-white text-xs font-semibold disabled:opacity-50"
          >
            {working ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />}
            Включить уведомления
          </button>
        </>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[#F3F4F6] last:border-0">
      <div className="w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center text-[#6B7280] shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-[#9CA3AF]">{label}</div>
        <div className="text-sm font-medium text-[#111827] truncate">{value}</div>
      </div>
    </div>
  );
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
}

function ReferralLinkSection({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E5E7EB] space-y-3">
      <div className="flex items-center gap-2">
        <Link2 size={16} className="text-[#34C759]" />
        <div className="text-sm font-semibold text-[#111827]">Ваша реферальная ссылка</div>
      </div>
      <div className="text-xs text-[#6B7280] leading-relaxed">
        Поделитесь ссылкой — лиды будут автоматически привязаны к вам
      </div>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          className="flex-1 text-xs bg-[#F8F9FA] rounded-lg px-3 py-2 text-[#374151] border border-[#E5E7EB] outline-none"
        />
        <button
          onClick={handleCopy}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-[#34C759] text-white rounded-lg text-xs font-medium active:opacity-70 transition-opacity"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { partner, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try { await logout(); } catch {}
    setLoggingOut(false);
  };

  if (!partner) return null;

  const statusLabel: Record<string, string> = {
    active:   "Активен",
    inactive: "Неактивен",
    pending:  "На проверке",
  };

  return (
    <div className="min-h-dvh bg-[#F8F9FA] pb-24">
      <div className="bg-white border-b border-[#E5E7EB] px-4 pt-12 pb-4">
        <h1 className="text-lg font-bold text-[#111827]">Профиль</h1>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Avatar + name */}
        <div className="flex flex-col items-center py-6">
          <div className="w-20 h-20 rounded-full bg-[#D1FAE5] flex items-center justify-center mb-3">
            <span className="text-3xl font-bold text-[#34C759]">
              {partner.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="text-xl font-bold text-[#111827]">{partner.name}</div>
          <div className="mt-1.5">
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
              partner.status === "active"
                ? "bg-[#D1FAE5] text-[#065F46]"
                : "bg-[#F3F4F6] text-[#374151]"
            }`}>
              {statusLabel[partner.status] ?? partner.status}
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="bg-white rounded-2xl px-4 shadow-sm border border-[#E5E7EB]">
          <InfoRow icon={<Phone size={14} />} label="Телефон" value={partner.phone} />
          <InfoRow icon={<MapPin size={14} />} label="Город" value={partner.city} />
          <InfoRow icon={<Calendar size={14} />} label="В партнёрской программе с" value={fmtDate(partner.createdAt)} />
          {partner.firstLeadAt && (
            <InfoRow icon={<User size={14} />} label="Первый лид" value={fmtDate(partner.firstLeadAt)} />
          )}
        </div>

        {/* Cooperation terms */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E5E7EB] space-y-2">
          <div className="text-sm font-semibold text-[#111827] mb-1">Условия сотрудничества</div>
          <div className="text-xs text-[#6B7280] leading-relaxed">
            Вы направляете клиентов в Сферу. За каждую заявку, которую мастер возьмёт в работу, вы получаете бонус.
            Дополнительно — фиксированная часть, пропорциональная числу поданных лидов относительно плана на месяц.
          </div>
          <div className="text-xs text-[#6B7280] leading-relaxed">
            За подробностями обращайтесь к вашему менеджеру.
          </div>
        </div>

        {/* Referral link */}
        {partner.referralUrl && <ReferralLinkSection url={partner.referralUrl} />}

        {/* Push notifications */}
        <PushNotificationSection />

        {/* Logout */}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center justify-between bg-white rounded-2xl px-4 py-4 shadow-sm border border-[#E5E7EB] text-red-600 active:opacity-70 transition-opacity"
        >
          <div className="flex items-center gap-3">
            {loggingOut ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />}
            <span className="text-sm font-semibold">Выйти из аккаунта</span>
          </div>
          <ChevronRight size={16} className="text-[#9CA3AF]" />
        </button>
      </div>
    </div>
  );
}
