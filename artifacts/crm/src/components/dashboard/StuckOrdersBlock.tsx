import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  PhoneCall, ImagePlus, CheckCircle2, CreditCard, Skull, ChevronRight, AlertTriangle,
} from "lucide-react";

interface StuckCounts {
  needs_call_report: number;
  needs_result: number;
  needs_amount_confirmation: number;
  needs_commission_payment: number;
  zombie: number;
}

interface StuckResponse {
  counts: StuckCounts;
  items: Record<string, unknown[]>;
}

const CATEGORIES: Array<{
  key: keyof StuckCounts;
  label: string;
  hint: string;
  icon: typeof PhoneCall;
  iconColor: string;
  iconBg: string;
  border: string;
}> = [
  {
    key: "needs_call_report",
    label: "Нет отчёта о созвоне",
    hint: "Принят >24ч назад",
    icon: PhoneCall,
    iconColor: "#D97706",
    iconBg: "bg-[#FFFBEB]",
    border: "border-[#FCD34D]",
  },
  {
    key: "needs_result",
    label: "Ждут результата",
    hint: "Нет фото и суммы 7+ дн.",
    icon: ImagePlus,
    iconColor: "#EA580C",
    iconBg: "bg-[#FFF7ED]",
    border: "border-[#FDBA74]",
  },
  {
    key: "needs_amount_confirmation",
    label: "Подтвердите сумму",
    hint: "Мастер прислал — оператор не подтвердил",
    icon: CheckCircle2,
    iconColor: "#7C3AED",
    iconBg: "bg-[#F5F3FF]",
    border: "border-[#C4B5FD]",
  },
  {
    key: "needs_commission_payment",
    label: "Не оплачена комиссия",
    hint: "Просрочка 7+ дн.",
    icon: CreditCard,
    iconColor: "#DC2626",
    iconBg: "bg-[#FEF2F2]",
    border: "border-[#FCA5A5]",
  },
  {
    key: "zombie",
    label: "Зомби (14+ дн.)",
    hint: "Никакой активности — нужно вмешательство",
    icon: Skull,
    iconColor: "#4B5563",
    iconBg: "bg-[#F3F4F6]",
    border: "border-[#9CA3AF]",
  },
];

export function StuckOrdersBlock() {
  const [, setLocation] = useLocation();
  const { data, isLoading, error } = useQuery<StuckResponse>({
    queryKey: ["/api/orders/stuck"],
    queryFn: async () => {
      const r = await fetch("/api/orders/stuck", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load stuck orders");
      return r.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const totalStuck = data
    ? Object.values(data.counts).reduce((s, n) => s + n, 0)
    : 0;

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} color="#EA580C" />
          <h3 className="text-[15px] font-bold text-[#111827]">Зависшие заказы</h3>
          {!isLoading && (
            <span className="text-[12px] font-semibold text-[#6B7280] bg-[#F3F4F6] rounded-full px-2 py-0.5">
              {totalStuck}
            </span>
          )}
        </div>
        {error && (
          <span className="text-[11px] text-[#EF4444]">ошибка загрузки</span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {CATEGORIES.map((cat, i) => {
          const count = data?.counts[cat.key] ?? 0;
          const Icon = cat.icon;
          const isEmpty = !isLoading && count === 0;
          return (
            <button
              key={cat.key}
              onClick={() => setLocation(`/orders/stuck?category=${cat.key}`)}
              disabled={isEmpty}
              className={`text-left bg-white border ${cat.border} rounded-xl p-3 transition-all
                ${isEmpty
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 cursor-pointer"
                } animate-fade-in-up`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex items-start justify-between mb-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${cat.iconBg}`}>
                  <Icon size={16} color={cat.iconColor} />
                </div>
                {!isEmpty && <ChevronRight size={14} color="#9CA3AF" />}
              </div>
              <div className="text-[26px] font-bold leading-none mb-1" style={{ color: cat.iconColor }}>
                {isLoading ? <span className="inline-block w-8 h-6 bg-[#F3F4F6] rounded animate-pulse" /> : count}
              </div>
              <div className="text-[12px] font-semibold text-[#111827] leading-tight">
                {cat.label}
              </div>
              <div className="text-[10px] text-[#9CA3AF] leading-tight mt-0.5">
                {cat.hint}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
