import { useQuery } from "@tanstack/react-query";
import { billingApi, type BillingPeriod } from "@/lib/api";
import { Loader2, Wallet } from "lucide-react";

const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

function fmt(n: number) {
  return n.toLocaleString("ru-RU");
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: "Начислен",  color: "#92400E", bg: "#FEF3C7" },
  paid:     { label: "Выплачен",  color: "#065F46", bg: "#D1FAE5" },
  partial:  { label: "Частично",  color: "#1D4ED8", bg: "#DBEAFE" },
};

function PeriodCard({ p }: { p: BillingPeriod }) {
  const cfg = statusConfig[p.status] ?? { label: p.status, color: "#374151", bg: "#F3F4F6" };
  const isHold = p.payoutModel === "hold";

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E5E7EB] space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-[#111827]">{MONTHS[p.month - 1]} {p.year}</div>
          <div className="text-xs text-[#6B7280]">{p.periodStart} — {p.periodEnd}</div>
        </div>
        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ color: cfg.color, background: cfg.bg }}>
          {cfg.label}
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-[#F8F9FA] rounded-xl p-2.5">
          <div className="text-xs text-[#6B7280]">Лидов подано</div>
          <div className="font-bold text-[#111827]">{p.leadsCount}</div>
        </div>
        {isHold ? (
          <>
            <div className="bg-[#F8F9FA] rounded-xl p-2.5">
              <div className="text-xs text-[#6B7280]">Холд-лиды</div>
              <div className="font-bold text-[#34C759]">{p.holdLeadsCount}</div>
            </div>
            <div className="bg-[#F8F9FA] rounded-xl p-2.5">
              <div className="text-xs text-[#6B7280]">Заработок</div>
              <div className="font-bold text-[#111827]">{fmt(p.holdEarned)} ₽</div>
            </div>
            {p.adBudget > 0 && (
              <div className="bg-[#F8F9FA] rounded-xl p-2.5">
                <div className="text-xs text-[#6B7280]">Рекл. бюджет</div>
                <div className="font-bold text-[#111827]">{fmt(p.adBudget)} ₽</div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="bg-[#F8F9FA] rounded-xl p-2.5">
              <div className="text-xs text-[#6B7280]">Принятых заявок</div>
              <div className="font-bold text-[#34C759]">{p.acceptedCount}</div>
            </div>
            <div className="bg-[#F8F9FA] rounded-xl p-2.5">
              <div className="text-xs text-[#6B7280]">Выполнение плана</div>
              <div className="font-bold text-[#111827]">{p.planPct}%</div>
            </div>
            <div className="bg-[#F8F9FA] rounded-xl p-2.5">
              <div className="text-xs text-[#6B7280]">% от фиксы</div>
              <div className="font-bold text-[#111827]">{p.fixedPct}%</div>
            </div>
          </>
        )}
      </div>

      {/* Amounts */}
      {isHold ? (
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-[#6B7280]">Холд ({p.holdLeadsCount} лиды)</span>
            <span className="font-medium text-[#111827]">{fmt(p.holdEarned)} ₽</span>
          </div>
          {p.adBudget > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-[#6B7280]">Рекламный бюджет</span>
              <span className="font-medium text-[#111827]">{fmt(p.adBudget)} ₽</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-semibold border-t border-[#E5E7EB] pt-2 mt-1">
            <span className="text-[#111827]">Итого</span>
            <span className="text-[#34C759] text-base">{fmt(p.holdEarned)} ₽</span>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-[#6B7280]">Фиксированная часть</span>
            <span className="font-medium text-[#111827]">{fmt(p.fixedAmount)} ₽</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#6B7280]">Бонус ({p.acceptedCount} заявки)</span>
            <span className="font-medium text-[#111827]">{fmt(p.bonusAmount)} ₽</span>
          </div>
          <div className="flex justify-between text-sm font-semibold border-t border-[#E5E7EB] pt-2 mt-1">
            <span className="text-[#111827]">Итого</span>
            <span className="text-[#34C759] text-base">{fmt(p.totalAmount)} ₽</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PayoutsPage() {
  const { data, isLoading } = useQuery<BillingPeriod[]>({
    queryKey: ["billing"],
    queryFn: billingApi.list,
  });

  return (
    <div className="min-h-dvh bg-[#F8F9FA] pb-24">
      <div className="bg-white border-b border-[#E5E7EB] px-4 pt-12 pb-4">
        <h1 className="text-lg font-bold text-[#111827]">Выплаты</h1>
        <p className="text-xs text-[#6B7280] mt-0.5">История начислений по периодам</p>
      </div>

      {/* Explanation */}
      <div className="mx-4 mt-4 bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-1.5">
        <p className="text-xs font-semibold text-blue-800">Как считается заработок</p>
        {data?.[0]?.payoutModel === "hold" ? (
          <p className="text-xs text-blue-700">
            500 ₽ за каждый лид, который мастер взял в работу и не отменил в течение 48 часов. В первый месяц компания инвестирует в рекламный бюджет.
          </p>
        ) : (
          <p className="text-xs text-blue-700">
            Фикс — пропорционально числу лидов относительно цели. Бонус — за каждую принятую заявку (мастер взял в работу).
          </p>
        )}
      </div>

      <div className="px-4 py-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-7 h-7 animate-spin text-[#34C759]" />
          </div>
        ) : !data?.length ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-[#F3F4F6] flex items-center justify-center mb-3">
              <Wallet size={24} className="text-[#9CA3AF]" />
            </div>
            <p className="text-sm font-medium text-[#374151]">Выплат пока нет</p>
            <p className="text-xs text-[#9CA3AF] mt-1">Начисления появятся по итогам первого периода</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.map(p => (
              <PeriodCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
