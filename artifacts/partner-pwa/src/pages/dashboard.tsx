import { useQuery } from "@tanstack/react-query";
import { dashboardApi, billingPeriodApi, type DashboardData } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Loader2, CalendarClock, Plus, TrendingUp } from "lucide-react";
import StatsCard from "@/components/StatsCard";
import PlanProgressBar from "@/components/PlanProgressBar";
import FixedSalaryProgress from "@/components/FixedSalaryProgress";
import EarningsCard from "@/components/EarningsCard";
import LeadCard from "@/components/LeadCard";

function fmt(n: number) {
  return n.toLocaleString("ru-RU");
}

export default function DashboardPage() {
  const { partner } = useAuth();
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: dashboardApi.get,
    refetchInterval: 60_000,
  });

  const { data: billing } = useQuery({
    queryKey: ["billing-current"],
    queryFn: billingPeriodApi.current,
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <Loader2 className="w-8 h-8 animate-spin text-[#34C759]" />
      </div>
    );
  }

  if (!data) return null;

  const { kpi, plan, fixed, earnings, recentLeads, payoutModel, hold } = data;

  const isNewPartner = kpi.leadsPeriod === 0 && !partner?.firstLeadAt;
  const isHold = payoutModel === "hold";

  return (
    <div className="min-h-dvh bg-[#F8F9FA] pb-24">
      {/* Header */}
      <div className="bg-white border-b border-[#E5E7EB] px-4 pt-12 pb-4">
        <div className="text-xs text-[#6B7280] font-medium">Привет,</div>
        <div className="text-xl font-bold text-[#111827]">{partner?.name}</div>
      </div>

      {isNewPartner && (
        <div className="mx-4 mt-6 bg-white rounded-2xl p-6 shadow-sm border border-[#E5E7EB] flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-[#D1FAE5] flex items-center justify-center">
            <TrendingUp className="w-8 h-8 text-[#34C759]" />
          </div>
          <div>
            <div className="text-base font-bold text-[#111827]">Добро пожаловать!</div>
            <div className="text-sm text-[#6B7280] mt-1">
              Добавьте первый лид, чтобы начать зарабатывать. Статистика и выплаты появятся после первой заявки.
            </div>
          </div>
          <button
            onClick={() => navigate("/create-lead")}
            className="flex items-center gap-2 px-5 py-3 bg-[#34C759] text-white rounded-xl font-semibold text-sm"
          >
            <Plus size={16} /> Добавить первый лид
          </button>
        </div>
      )}

      <div className="px-4 py-4 space-y-4">
        {/* KPI */}
        <div className="grid grid-cols-2 gap-3">
          <StatsCard label="Лидов сегодня" value={kpi.leadsToday} />
          <StatsCard label="Лидов за период" value={kpi.leadsPeriod} />
          {isHold ? (
            <>
              <StatsCard label="Холд-лиды" value={hold?.leadsCount ?? 0} accent />
              <StatsCard label="Заработок" value={`${fmt(hold?.earnings ?? 0)} ₽`} accent />
            </>
          ) : (
            <>
              <StatsCard label="Принятых заявок" value={kpi.acceptedPeriod} accent />
              <StatsCard label="Заработок" value={`${fmt(kpi.earningsPeriod)} ₽`} accent />
            </>
          )}
        </div>

        {/* Plan */}
        {!isHold && (
          <PlanProgressBar
            current={plan.current}
            target={plan.target}
            completed={plan.completed}
          />
        )}

        {/* Fixed */}
        {!isHold && (
          <FixedSalaryProgress
            currentLeads={fixed.currentLeads}
            targetLeads={fixed.targetLeads}
            maxFixed={fixed.maxFixed}
            currentFixed={fixed.currentFixed}
            fixedPct={fixed.fixedPct}
          />
        )}

        {/* Earnings */}
        {!isHold && (
          <EarningsCard
            fixedAmount={earnings.fixedAmount}
            fixedPct={earnings.fixedPct}
            bonusCount={earnings.bonusCount}
            bonusPerLead={earnings.bonusPerLead}
            bonusAmount={earnings.bonusAmount}
            total={earnings.total}
          />
        )}

        {/* Hold ad budget info */}
        {isHold && hold && hold.adBudget > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E5E7EB] space-y-2">
            <div className="text-sm font-semibold text-[#111827]">Рекламный бюджет</div>
            <div className="text-xs text-[#6B7280] leading-relaxed">
              В первый месяц компания инвестирует {fmt(hold.adBudget)} ₽ в рекламный бюджет.
            </div>
          </div>
        )}

        {/* Payout date */}
        {billing?.started && billing.payoutDate && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E5E7EB] flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#D1FAE5] flex items-center justify-center shrink-0">
              <CalendarClock size={18} className="text-[#34C759]" />
            </div>
            <div>
              <div className="text-xs text-[#9CA3AF]">Дата следующей выплаты</div>
              <div className="text-sm font-semibold text-[#111827]">
                {new Date(billing.payoutDate).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-xs text-[#9CA3AF]">Накоплено</div>
              <div className="text-sm font-bold text-[#34C759]">{fmt(billing.totalEarned ?? 0)} ₽</div>
            </div>
          </div>
        )}

        {/* Recent leads */}
        {recentLeads.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-[#374151] mb-2">Последние лиды</h2>
            <div className="space-y-2">
              {recentLeads.map(lead => (
                <LeadCard key={lead.id} lead={lead} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
