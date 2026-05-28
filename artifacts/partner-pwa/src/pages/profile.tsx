import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, User, Phone, MapPin, Calendar, Loader2, ChevronRight, Link2, Copy, Check } from "lucide-react";

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
