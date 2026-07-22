import { SkeletonCard } from "./SkeletonCard";
import { Users, ArrowRight } from "lucide-react";
import { formatCurrency } from "../../utils/format";

type Period = "today" | "week" | "month" | "quarter";

interface FunnelData {
  total: number;            // всего заявок за период
  taken: number;            // взято мастерами
  paid: number;             // оплачено
  avgCommission: number;    // средняя комиссия по оплаченным
  conversion_rate: number;  // сквозная: заявка → оплата
  taken_rate?: number;      // % взятых от заявок
  paid_of_taken_rate?: number; // % оплаченных от взятых
}

interface Props {
  data?: FunnelData;
  isLoading?: boolean;
  period?: Period;
}

const PERIOD_LABEL: Record<Period, string> = {
  today: "сегодня",
  week: "неделя",
  month: "месяц",
  quarter: "квартал",
};

export function LeadFunnelCard({ data, isLoading, period = "month" }: Props) {
  if (isLoading || !data) return <SkeletonCard title="Воронка заявок" />;

  const total = Math.max(data.total, 1);
  const stages = [
    {
      label: "Заявок",
      value: data.total,
      color: "#3B82F6",
      hint: "поступило за период",
    },
    {
      label: "Взято мастерами",
      value: data.taken,
      color: "#8B5CF6",
      hint: `${data.taken_rate ?? Math.round((data.taken / total) * 100)}% от заявок`,
    },
    {
      label: "Оплачено",
      value: data.paid,
      color: "#16A34A",
      hint: `${data.paid_of_taken_rate ?? 0}% от взятых`,
    },
  ];

  return (
    <div className="bg-white rounded-2xl p-5 border border-[#E5E7EB] h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users size={18} color="#3B82F6" />
          <h3 className="text-[15px] font-bold text-[#111827]">Воронка заявок ({PERIOD_LABEL[period]})</h3>
        </div>
        <div className="flex items-center gap-1.5 bg-[#F0FDF4] text-[#16A34A] px-2.5 py-1 rounded-lg text-[12px] font-semibold">
          {data.conversion_rate}%
          <ArrowRight size={12} />
          заявка→оплата
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-3">
        {stages.map((stage, i) => {
          // Ширина относительно общего числа заявок — воронка сужается.
          const widthPct = Math.max((stage.value / total) * 100, stage.value > 0 ? 6 : 2);
          return (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] font-medium text-[#374151]">{stage.label}</span>
                <span className="text-[11px] text-[#9CA3AF]">{stage.hint}</span>
              </div>
              <div className="h-9 bg-[#F3F4F6] rounded-lg overflow-hidden relative">
                <div
                  className="h-full rounded-lg flex items-center justify-end pr-2.5 transition-all duration-700"
                  style={{ width: `${widthPct}%`, backgroundColor: stage.color }}
                >
                  {widthPct > 18 && (
                    <span className="text-[14px] font-bold text-white">{stage.value}</span>
                  )}
                </div>
                {widthPct <= 18 && (
                  <span className="absolute top-1/2 -translate-y-1/2 text-[14px] font-bold text-[#374151]"
                    style={{ left: `calc(${widthPct}% + 8px)` }}>
                    {stage.value}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="bg-[#F9FAFB] rounded-xl p-2.5">
          <div className="text-[18px] font-bold text-[#111827]">{data.total}</div>
          <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Заявок</div>
        </div>
        <div className="bg-[#F9FAFB] rounded-xl p-2.5">
          <div className="text-[18px] font-bold text-[#16A34A]">{data.paid}</div>
          <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Оплачено</div>
        </div>
        <div className="bg-[#F9FAFB] rounded-xl p-2.5">
          <div className="text-[18px] font-bold text-[#0EA5E9]">{formatCurrency(data.avgCommission)}</div>
          <div className="text-[10px] text-[#9CA3AF] uppercase tracking-wide">Ср. комиссия</div>
        </div>
      </div>
    </div>
  );
}
