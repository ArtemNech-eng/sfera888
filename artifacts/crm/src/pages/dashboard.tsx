import { useState, useEffect, useCallback, useRef } from "react";
import { useQueries } from "@tanstack/react-query";
import { MapPin, RefreshCw } from "lucide-react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import {
  mockSummary, mockAlerts, mockForecast, mockRiskMonitor,
  mockRevenueChart, mockFunnel, mockLiveFeed, mockSpeedMetrics,
  mockCities, mockRoiSources, mockTopMasters, mockRecentOrders,
} from "../mock/dashboardData";
import { KPICards } from "../components/dashboard/KPICards";
import { AlertsBlock } from "../components/dashboard/AlertsBlock";
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

function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

const fetchers = {
  summary:      async () => { await delay(200); return mockSummary; },
  alerts:       async () => { await delay(150); return mockAlerts; },
  forecast:     async () => { await delay(300); return mockForecast; },
  riskMonitor:  async () => { await delay(250); return mockRiskMonitor; },
  revenueChart: async () => { await delay(400); return mockRevenueChart; },
  funnel:       async () => { await delay(350); return mockFunnel; },
  liveFeed:     async () => { await delay(100); return mockLiveFeed; },
  speedMetrics: async () => { await delay(300); return mockSpeedMetrics; },
  cities:       async () => { await delay(200); return mockCities; },
  roiSources:   async () => { await delay(250); return mockRoiSources; },
  topMasters:   async () => { await delay(300); return mockTopMasters; },
  recentOrders: async () => { await delay(150); return mockRecentOrders; },
};

const CITIES = ["Все города", "Краснодар", "Ростов-на-Дону", "Сочи", "Новороссийск"];
const PERIODS: { key: Period; label: string }[] = [
  { key: "today",   label: "Сегодня" },
  { key: "week",    label: "Неделя" },
  { key: "month",   label: "Месяц" },
  { key: "quarter", label: "Квартал" },
];

function DashboardPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [city, setCity] = useState("Все города");
  const [chartDays, setChartDays] = useState<30 | 60 | 90>(30);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const interval = setInterval(() => setSecondsAgo(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [refreshKey]);

  const results = useQueries({
    queries: [
      { queryKey: ["summary", refreshKey],                  queryFn: fetchers.summary,      staleTime: 30000 },
      { queryKey: ["alerts", refreshKey],                   queryFn: fetchers.alerts,       staleTime: 30000 },
      { queryKey: ["forecast", period, city, refreshKey],   queryFn: fetchers.forecast,     staleTime: 300000 },
      { queryKey: ["riskMonitor", refreshKey],              queryFn: fetchers.riskMonitor,  staleTime: 60000 },
      { queryKey: ["revenueChart", refreshKey],             queryFn: fetchers.revenueChart, staleTime: 300000 },
      { queryKey: ["funnel", period, city, refreshKey],     queryFn: fetchers.funnel,       staleTime: 300000 },
      { queryKey: ["liveFeed", refreshKey],                 queryFn: fetchers.liveFeed,     staleTime: 15000, refetchInterval: 15000 },
      { queryKey: ["speedMetrics", refreshKey],             queryFn: fetchers.speedMetrics, staleTime: 300000 },
      { queryKey: ["cities", period, refreshKey],           queryFn: fetchers.cities,       staleTime: 300000 },
      { queryKey: ["roiSources", period, refreshKey],       queryFn: fetchers.roiSources,   staleTime: 300000 },
      { queryKey: ["topMasters", period, city, refreshKey], queryFn: fetchers.topMasters,   staleTime: 300000 },
      { queryKey: ["recentOrders", city, refreshKey],       queryFn: fetchers.recentOrders, staleTime: 30000, refetchInterval: 30000 },
    ],
  });

  const [summary, alerts, forecast, riskMonitor, revenueChart, funnel,
    liveFeed, speedMetrics, cities, roiSources, topMasters, recentOrders] = results;

  const handleRefresh = useCallback(() => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setRefreshKey(k => k + 1);
    setSecondsAgo(0);
    if (refreshBtnRef.current) {
      refreshBtnRef.current.classList.add("animate-spin-once");
      setTimeout(() => {
        refreshBtnRef.current?.classList.remove("animate-spin-once");
        setIsRefreshing(false);
      }, 500);
    } else {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [isRefreshing]);

  const handleEditAvitoBalance = useCallback(() => {
    const val = prompt("Введите новый баланс Авито (₽):");
    if (val && !isNaN(Number(val))) {
      alert(`Баланс обновлён: ${Number(val).toLocaleString("ru-RU")} ₽`);
    }
  }, []);

  const formatUpdated = () => {
    if (secondsAgo < 60) return `${secondsAgo}с назад`;
    return `${Math.floor(secondsAgo / 60)}м назад`;
  };

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
                {CITIES.map(c => <option key={c}>{c}</option>)}
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

        {/* KPI CARDS */}
        <div className="mb-6">
          <KPICards data={summary.data} isLoading={summary.isLoading} onEditAvitoBalance={handleEditAvitoBalance} />
        </div>

        {/* ALERTS */}
        {alerts.data && alerts.data.length > 0 && (
          <div className="mb-6">
            <AlertsBlock alerts={alerts.data} />
          </div>
        )}

        {/* ROW 1: Forecast + Risk Monitor */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <ForecastCard data={forecast.data} isLoading={forecast.isLoading} />
          <RiskMonitor data={riskMonitor.data} isLoading={riskMonitor.isLoading} />
        </div>

        {/* ROW 2: Revenue Chart (60%) + Funnel (40%) */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
          <div className="lg:col-span-3">
            <RevenueChart data={revenueChart.data} isLoading={revenueChart.isLoading} chartDays={chartDays} onDaysChange={setChartDays} />
          </div>
          <div className="lg:col-span-2">
            <FunnelCard data={funnel.data} isLoading={funnel.isLoading} />
          </div>
        </div>

        {/* ROW 3: Live Feed (55%) + Speed Metrics (45%) */}
        <div className="grid grid-cols-1 lg:grid-cols-11 gap-4 mb-4">
          <div className="lg:col-span-6">
            <LiveFeed data={liveFeed.data} isLoading={liveFeed.isLoading} />
          </div>
          <div className="lg:col-span-5">
            <SpeedMetrics data={speedMetrics.data} isLoading={speedMetrics.isLoading} />
          </div>
        </div>

        {/* ROW 4: Cities (50%) + ROI (50%) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <CitiesCard data={cities.data} isLoading={cities.isLoading} />
          <ROICard data={roiSources.data} isLoading={roiSources.isLoading} />
        </div>

        {/* ROW 5: Top Masters (40%) + Recent Orders (60%) */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2">
            <TopMasters data={topMasters.data} isLoading={topMasters.isLoading} />
          </div>
          <div className="lg:col-span-3">
            <RecentOrders data={recentOrders.data} isLoading={recentOrders.isLoading} />
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
