interface FixedSalaryProgressProps {
  currentLeads: number;
  targetLeads: number;
  maxFixed: number;
  currentFixed: number;
  fixedPct: number;
}

export default function FixedSalaryProgress({
  currentLeads,
  targetLeads,
  maxFixed,
  currentFixed,
  fixedPct,
}: FixedSalaryProgressProps) {
  const pct = Math.min(100, fixedPct);

  const barColor =
    pct >= 100 ? "#34C759" :
    pct >= 50  ? "#F59E0B" :
                 "#EF4444";

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E5E7EB]">
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm font-semibold text-[#111827]">
          Фиксированная часть
        </div>
        <div className="text-sm font-bold" style={{ color: barColor }}>
          {currentFixed.toLocaleString("ru-RU")} ₽
        </div>
      </div>
      <div className="text-xs text-[#6B7280] mb-2">
        Фикс {maxFixed.toLocaleString("ru-RU")} ₽ при {targetLeads} лидах — сейчас: {currentLeads} / {targetLeads}
      </div>
      <div className="h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden mb-1">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
      <div className="text-xs text-right" style={{ color: barColor }}>
        {Math.round(pct)}% от {maxFixed.toLocaleString("ru-RU")} ₽
      </div>
    </div>
  );
}
