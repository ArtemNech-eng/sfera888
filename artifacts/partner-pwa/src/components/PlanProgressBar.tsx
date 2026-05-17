interface PlanProgressBarProps {
  current: number;
  target: number;
  completed: boolean;
}

export default function PlanProgressBar({ current, target, completed }: PlanProgressBarProps) {
  const pct = Math.min(100, (current / target) * 100);
  const remaining = Math.max(0, target - current);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E5E7EB]">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-[#111827]">
          План: {target} лидов / месяц
        </div>
        {completed && (
          <span className="text-xs font-semibold text-white bg-[#34C759] px-2.5 py-0.5 rounded-full">
            План выполнен
          </span>
        )}
      </div>
      <div className="h-2 bg-[#F3F4F6] rounded-full overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: "#34C759" }}
        />
      </div>
      <div className="flex justify-between text-xs text-[#6B7280]">
        <span>Сейчас: <span className="font-semibold text-[#111827]">{current} / {target}</span></span>
        {!completed && <span>Осталось: <span className="font-semibold text-[#111827]">{remaining}</span></span>}
        <span className="font-medium">{Math.round(pct)}%</span>
      </div>
    </div>
  );
}
