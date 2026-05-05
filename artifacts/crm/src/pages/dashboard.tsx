import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, RefreshCw } from "lucide-react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { KPICards } from "../components/dashboard/KPICards";
import { AlertsBlock } from "../components/dashboard/AlertsBlock";
import { ActionItemsBlock } from "../components/dashboard/ActionItemsBlock";
import { ForecastCard } from "../components/dashboard/ForecastCard";
import { RiskMonitor } from "../components/dashboard/RiskMonitor";
import { RevenueChart } from "../components/dashboard/RevenueChart";
import { FunnelCard } from "../components/dashboard/FunnelCard";
import { LiveFeed } from "../components/dashboard/LiveFeed";
import { SpeedMetrics } from "../components/dashboard/SpeedMetrics";
import { CitiesCard } from "../components/dashboard/CitiesCard";
import { ROICard } from "../components/dashboard/ROICard";
import { TopMasters } from "../components/dashboard/TopMasters";
import { RecentOrders } from "../components/dashboard/RecentOrders";

type Period = "today" | "week" | "month" | "quarter";

const CITIES_FILTER = ["Все города", "Краснодар", "Ростов-на-Дону", "Сочи", "Новороссийск"];
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
  const [city, setCity] = useState("Все города");
  const [chartDays, setChartDays] = useState<30 | 60 | 90>(30);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshBtnRef = useRef<HTMLButtonElement>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/analytics/dashboard-v2"],
    queryFn: fetchDashboard,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  useEffect(() => {
    const onChanged = () => refetch();
    window.addEventListener("dashboard-action-items:changed", onChanged);
    return () => window.removeEventListener("dashboard-action-items:changed", onChanged);
  }, [refetch]);

  useEffect(() => {
    const interval = setInterval(() => setSecondsAgo(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [data]);

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

  const handleEditAvitoBalance = useCallback(async () => {
    const val = prompt("Введите новый баланс Авито (₽):");
    if (val && !isNaN(Number(val))) {
      try {
        const res = await fetch("/api/dashboard/action-items/low_avito_balance-1/action", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update_balance", payload: { balance: Number(val) } }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        alert(`Баланс обновлён: ${Number(val).toLocaleString("ru-RU")} ₽`);
        refetch();
      } catch (e) {
        alert("Не удалось обновить баланс. Попробуйте ещё раз.");
      }
    }
  }, [refetch]);

  const formatUpdated = () => {
    if (secondsAgo < 60) return `${secondsAgo}с назад`;
    return `${Math.floor(secondsAgo / 60)}м назад`;
  };

  // Filter city-specific data from the aggregated response
  const summary = data?.summary;
  const alerts = data?.alerts ?? [];
  const forecast = data?.forecast;
  const riskMonitor = data?.riskMonitor;
  const revenueChart = data?.revenueChart;
  const funnel = data?.funnel;
  const liveFeed = data?.liveFeed ?? [];
  const speedMetrics = data?.speedMetrics;
  const citiesRaw = data?.cities ?? [];
  const roiSources = data?.roiSources ?? [];
  const topMasters = data?.topMasters ?? [];
  const recentOrdersRaw = data?.recentOrders ?? [];

  // Apply city filter on the client side
  const cities = city === "Все города" ? citiesRaw : citiesRaw.filter((c: any) => c.city === city);
  const recentOrders = city === "Все города" ? recentOrdersRaw : recentOrdersRaw.filter((o: any) => o.city === city);

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

            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <MapPin size={14} color="#6B7280" />
              </div>
              <select
                value={city}
                onChange={e => setCity(e.target.value)}
                className="pl-8 pr-4 py-2 text-[13px] text-[#111827] bg-white border border-[#E5E7EB] rounded-xl
                  outline-none cursor-pointer hover:border-[#34C759] transition-colors appearance-none"
              >
                {CITIES_FILTER.map(c => <option key={c}>{c}</option>)}
              </select>
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
          <ActionItemsBlock />
        </div>

        {/* KPI CARDS */}
        <div className="mb-6">
          <KPICards data={summary} isLoading={isLoading} onEditAvitoBalance={handleEditAvitoBalance} />
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
            <RevenueChart data={revenueChart} isLoading={isLoading} chartDays={chartDays} onDaysChange={setChartDays} />
          </div>
          <div className="lg:col-span-2">
            <FunnelCard data={funnel} isLoading={isLoading} />
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
