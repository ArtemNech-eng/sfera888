import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { KPICards } from "../components/dashboard/KPICards";
import { AlertsBlock } from "../components/dashboard/AlertsBlock";
import { ActionItemsBlock } from "../components/dashboard/ActionItemsBlock";
import { ForecastCard } from "../components/dashboard/ForecastCard";
import { RiskMonitor } from "../components/dashboard/RiskMonitor";
import { TokenFlowChart } from "../components/dashboard/TokenFlowChart";
import { TokenFunnelCard } from "../components/dashboard/TokenFunnelCard";
import { LiveFeed } from "../components/dashboard/LiveFeed";
import { SpeedMetrics } from "../components/dashboard/SpeedMetrics";
import { CitiesCard } from "../components/dashboard/CitiesCard";
import { ROICard } from "../components/dashboard/ROICard";
import { TopMasters } from "../components/dashboard/TopMasters";
import { RecentOrders } from "../components/dashboard/RecentOrders";

type Period = "today" | "week" | "month" | "quarter";

const PERIODS: { key: Period; label: string }[] = [
  { key: "today",   label: "Сегодня" },
  { key: "week",    label: "Неделя" },
  { key: "month",   label: "Месяц" },
  { key: "quarter", label: "Квартал" },
];

async function fetchDashboard() {
  const resp = await fetch("/api/analytics/dashboard-v2", { credentials: "include" });
  if (!resp.ok) throw new Error("Failed to fetch dashboard");
  return resp.json();
}

function DashboardPage() {
  usePushNotifications(); // register SW and auto-subscribe if permission already granted
  const [period, setPeriod] = useState<Period>("month");
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshBtnRef = useRef<HTMLButtonElement>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/analytics/dashboard-v2"],
    queryFn: fetchDashboard,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  // Сброс таймера «Обновлено X назад» при авторефетче
  const prevDataRef = useRef(data);
  useEffect(() => {
    if (data !== prevDataRef.current) {
      setSecondsAgo(0);
      prevDataRef.current = data;
    }
  }, [data]);

  useEffect(() => {
    const onChanged = () => refetch();
    window.addEventListener("dashboard-action-items:changed", onChanged);
    return () => window.removeEventListener("dashboard-action-items:changed", onChanged);
  }, [refetch]);

  useEffect(() => {
    const interval = setInterval(() => setSecondsAgo(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — интервал создаётся один раз, сброс через setSecondsAgo(0) в эффекте выше

  const handleRefresh = useCallback(() => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setSecondsAgo(0);
    refetch().finally(() => setIsRefreshing(false));
    if (refreshBtnRef.current) {
      refreshBtnRef.current.classList.add("animate-spin-once");
      setTimeout(() => refreshBtnRef.current?.classList.remove("animate-spin-once"), 500);
    }
  }, [isRefreshing, refetch]);


  const formatUpdated = () => {
    if (secondsAgo < 60) return `${secondsAgo}с назад`;
    return `${Math.floor(secondsAgo / 60)}м назад`;
  };

  // Filter city-specific data from the aggregated response
  const summary = data?.summary;
  const alerts = data?.alerts ?? [];
  const forecast = data?.forecast;
  const riskMonitor = data?.riskMonitor;
  const funnel = data?.funnel;
  const tokenFunnel = data?.tokenFunnel;
  const liveFeed = data?.liveFeed ?? [];
  const speedMetrics = data?.speedMetrics;
  const cities = data?.cities ?? [];
  const roiSources = data?.roiSources ?? [];
  const topMasters = data?.topMasters ?? [];
  const recentOrders = data?.recentOrders ?? [];
  const dailyTokenSales = data?.dailyTokenSales;
  const tokenFlow = data?.tokenFlow;

  // Error state
  if (error) {
    return (
      <div className="min-h-full bg-[#F8F9FA] flex items-center justify-center">
        <div className="bg-white border border-[#FEE2E2] rounded-2xl p-8 max-w-md mx-4 text-center">
          <div className="w-12 h-12 bg-[#FEF2F2] rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={24} color="#EF4444" />
          </div>
          <h2 className="text-[18px] font-bold text-[#111827] mb-2">Ошибка загрузки</h2>
          <p className="text-[14px] text-[#6B7280] mb-6">
            Не удалось загрузить данные дашборда. Проверьте подключение к интернету и попробуйте ещё раз.
          </p>
          <button
            onClick={() => refetch()}
            className="px-6 py-2.5 bg-[#3B82F6] text-white text-[14px] font-semibold rounded-xl hover:bg-[#2563EB] transition-colors"
          >
            Повторить попытку
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#F8F9FA]">
      <div className="max-w-[1440px] mx-auto px-4 md:px-7 py-6">

        {/* HEADER */}
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div className="flex flex-col">
            <h1 className="text-[22px] font-bold text-[#111827] leading-none">Дашборд</h1>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-2 h-2 rounded-full bg-[#34C759] animate-pulse-dot" />
              <span className="text-[11px] font-semibold text-[#34C759] uppercase tracking-wider">Live</span>
              <span className="text-[13px] text-[#9CA3AF]">· Обновлено {formatUpdated()}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center bg-[#F3F4F6] rounded-xl p-1 gap-0.5">
              {PERIODS.map(p => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all whitespace-nowrap
                    ${period === p.key ? "bg-white shadow-sm text-[#111827]" : "text-[#6B7280] hover:text-[#111827]"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button
              ref={refreshBtnRef}
              onClick={handleRefresh}
              className="w-9 h-9 flex items-center justify-center bg-[#F3F4F6] rounded-lg hover:bg-[#E5E7EB] transition-colors"
              title="Обновить"
            >
              <RefreshCw size={16} color="#6B7280" />
            </button>
          </div>
        </div>

        {/* TASKS FEED — что делать прямо сейчас */}
        <div className="mb-6">
          {/* Задачи всегда показываем все — period дашборда не должен их фильтровать */}
          <ActionItemsBlock period="all" city="all" />
        </div>

        {/* KPI CARDS */}
        <div className="mb-6">
          <KPICards data={summary} isLoading={isLoading} />
        </div>

        {/* ALERTS */}
        {alerts.length > 0 && (
          <div className="mb-6">
            <AlertsBlock alerts={alerts} />
          </div>
        )}

        {/* ROW 1: Forecast + Risk Monitor */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <ForecastCard data={forecast} isLoading={isLoading} />
          <RiskMonitor data={riskMonitor} isLoading={isLoading} />
        </div>

        {/* ROW 2: Revenue Chart (60%) + Funnel (40%) */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
          <div className="lg:col-span-3">
            <TokenFlowChart data={tokenFlow} isLoading={isLoading} />
          </div>
          <div className="lg:col-span-2">
            <TokenFunnelCard data={tokenFunnel} isLoading={isLoading} />
          </div>
        </div>

        {/* ROW 3: Live Feed (55%) + Speed Metrics (45%) */}
        <div className="grid grid-cols-1 lg:grid-cols-11 gap-4 mb-4">
          <div className="lg:col-span-6">
            <LiveFeed data={liveFeed.length > 0 ? liveFeed : undefined} isLoading={isLoading} />
          </div>
          <div className="lg:col-span-5">
            <SpeedMetrics data={speedMetrics} isLoading={isLoading} />
          </div>
        </div>

        {/* ROW 4: Cities (50%) + ROI (50%) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <CitiesCard data={cities.length > 0 ? cities : undefined} isLoading={isLoading} />
          <ROICard data={roiSources.length > 0 ? roiSources : undefined} isLoading={isLoading} />
        </div>

        {/* ROW 5: Top Masters (40%) + Recent Orders (60%) */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2">
            <TopMasters data={topMasters.length > 0 ? topMasters : undefined} isLoading={isLoading} />
          </div>
          <div className="lg:col-span-3">
            <RecentOrders data={recentOrders.length > 0 ? recentOrders : undefined} isLoading={isLoading} />
          </div>
        </div>

      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <ProtectedRoute>
      <Layout>
        <DashboardPage />
      </Layout>
    </ProtectedRoute>
  );
}
