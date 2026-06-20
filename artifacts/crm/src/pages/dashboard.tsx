import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { KPICards } from "../components/dashboard/KPICards";
import { LiveFeed } from "../components/dashboard/LiveFeed";
import { CitiesCard } from "../components/dashboard/CitiesCard";
import { TopMasters } from "../components/dashboard/TopMasters";
import { RecentOrders } from "../components/dashboard/RecentOrders";
import { LeadFunnelCard } from "../components/dashboard/LeadFunnelCard";
import { LeadSourcesCard } from "../components/dashboard/LeadSourcesCard";
import { StuckOrdersBlock } from "../components/dashboard/StuckOrdersBlock";

type Period = "today" | "week" | "month" | "quarter";

const PERIODS: { key: Period; label: string }[] = [
  { key: "today",   label: "Сегодня" },
  { key: "week",    label: "Неделя" },
  { key: "month",   label: "Месяц" },
  { key: "quarter", label: "Квартал" },
];

async function fetchDashboard() {
  // Cache-buster: previous deployment returned 410 Gone for this URL, which
  // CDNs (Cloudflare) cache aggressively. Adding a unique query param forces
  // a fresh request to the origin server.
  const url = `/api/analytics/dashboard-v2?_t=${Date.now()}`;
  const resp = await fetch(url, { credentials: "include" });
  if (!resp.ok) throw new Error("Failed to fetch dashboard");
  return resp.json();
}

function DashboardPage() {
  usePushNotifications();
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

  const prevDataRef = useRef(data);
  useEffect(() => {
    if (data !== prevDataRef.current) {
      setSecondsAgo(0);
      prevDataRef.current = data;
    }
  }, [data]);

  useEffect(() => {
    const interval = setInterval(() => setSecondsAgo(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

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

  const summary = data?.summary;
  const leadFunnel = data?.leadFunnel;
  const leadSources = data?.leadSources ?? [];
  const liveFeed = data?.liveFeed ?? [];
  const cities = data?.cities ?? [];
  const topMasters = data?.topMasters ?? [];
  const recentOrders = data?.recentOrders ?? [];

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

        {/* KPI CARDS */}
        <div className="mb-6">
          <KPICards data={summary} isLoading={isLoading} />
        </div>

        {/* STUCK ORDERS — 5 categories of issues that need operator attention */}
        <div className="mb-6">
          <StuckOrdersBlock />
        </div>

        {/* ROW 1: Lead Funnel + Lead Sources */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <LeadFunnelCard data={leadFunnel} isLoading={isLoading} />
          <LeadSourcesCard data={leadSources} isLoading={isLoading} />
        </div>

        {/* ROW 2: Live Feed + Cities */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <LiveFeed data={liveFeed.length > 0 ? liveFeed : undefined} isLoading={isLoading} />
          <CitiesCard data={cities.length > 0 ? cities : undefined} isLoading={isLoading} />
        </div>

        {/* ROW 3: Top Masters + Recent Orders */}
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
