interface EarningsCardProps {
  fixedAmount: number;
  fixedPct: number;
  bonusCount: number;
  bonusPerLead: number;
  bonusAmount: number;
  total: number;
}

function fmt(n: number) {
  return n.toLocaleString("ru-RU");
}

export default function EarningsCard({
  fixedAmount,
  fixedPct,
  bonusCount,
  bonusPerLead,
  bonusAmount,
  total,
}: EarningsCardProps) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E5E7EB] space-y-3">
      <div className="text-sm font-semibold text-[#111827]">Заработок за период</div>

      <div className="space-y-0.5">
        <div className="flex justify-between items-center">
          <span className="text-sm text-[#111827]">
            Фиксированная часть: <span className="font-semibold">{fmt(fixedAmount)} ₽</span>
            <span className="text-[#6B7280]"> ({fixedPct}%)</span>
          </span>
        </div>
        <p className="text-xs text-[#6B7280]">пропорционально лидам за период</p>
      </div>

      <div className="space-y-0.5">
        <div className="flex justify-between items-center">
          <span className="text-sm text-[#111827]">
            Бонус:{" "}
            <span className="font-semibold">
              {bonusCount} {bonusCount === 1 ? "заявка" : bonusCount >= 2 && bonusCount <= 4 ? "заявки" : "заявок"} × {bonusPerLead} ₽ = {fmt(bonusAmount)} ₽
            </span>
          </span>
        </div>
        <p className="text-xs text-[#6B7280]">за каждую заявку, которую взял мастер</p>
      </div>

      <div className="border-t border-[#E5E7EB] pt-3 flex justify-between items-center">
        <span className="text-base font-semibold text-[#111827]">Итого:</span>
        <span className="text-2xl font-bold text-[#34C759]">{fmt(total)} ₽</span>
      </div>
    </div>
  );
}
