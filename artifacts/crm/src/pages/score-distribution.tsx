import { Layout } from "@/components/layout";
import { ProtectedRoute } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Loader2, Users, TrendingUp, RefreshCw, Award } from "lucide-react";

interface MasterScore {
  masterId: number;
  alias: string;
  city: string;
  total: number;
  segment: string;
  isCold: boolean;
  payRate: number;
  avgCommission: number;
  selfCancelRate: number;
  totalCompletedAllTime: number;
  blockedFromOrders: boolean;
}

interface ScoreDistribution {
  totalMasters: number;
  avgScore: number;
  histogram: { bucket: string; from: number; to: number; count: number }[];
  segments: { platinum: number; gold: number; silver: number; starter: number; blocked: number };
  cities: { city: string; count: number; avgScore: number; platinum: number; gold: number; silver: number; starter: number }[];
  top10: MasterScore[];
  bottom10: MasterScore[];
  generatedAt: string;
}

const SEG_COLOR: Record<string, string> = {
  platinum: "#a855f7",
  gold: "#f59e0b",
  silver: "#94a3b8",
  starter: "#3b82f6",
  blocked: "#ef4444",
};

const SEG_LABEL: Record<string, { label: string; emoji: string }> = {
  platinum: { label: "Платина", emoji: "💎" },
  gold: { label: "Золото", emoji: "🥇" },
  silver: { label: "Серебро", emoji: "🥈" },
  starter: { label: "Старт/Новички", emoji: "🎯" },
  blocked: { label: "Заблокированы", emoji: "🛑" },
};

function bucketColor(from: number) {
  if (from >= 80) return SEG_COLOR.platinum;
  if (from >= 60) return SEG_COLOR.gold;
  if (from >= 40) return SEG_COLOR.silver;
  return SEG_COLOR.starter;
}

export default function ScoreDistributionPage() {
  return (
    <ProtectedRoute>
      <Layout>
        <ScoreDistributionContent />
      </Layout>
    </ProtectedRoute>
  );
}

function ScoreDistributionContent() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<ScoreDistribution>({
    queryKey: ["score-distribution"],
    queryFn: async () => {
      const r = await fetch("/api/analytics/score-distribution", { credentials: "include" });
      if (!r.ok) {
        const body = await r.text();
        throw new Error(`HTTP ${r.status}: ${body.slice(0, 500)}`);
      }
      return r.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
          <p className="font-bold mb-2">Не удалось загрузить распределение</p>
          <pre className="whitespace-pre-wrap text-xs">{(error as Error).message}</pre>
          <button onClick={() => refetch()} className="mt-3 px-3 py-1.5 bg-red-100 hover:bg-red-200 rounded-lg text-xs font-semibold">
            Повторить
          </button>
        </div>
      </div>
    );
  }
  if (!data) {
    return <div className="p-6 text-sm text-gray-400">Нет данных</div>;
  }

  const totalSegments = data.segments.platinum + data.segments.gold + data.segments.silver + data.segments.starter + data.segments.blocked;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Award className="w-6 h-6 text-violet-500" />
            Распределение мастеров по score
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Используется для калибровки скоринговой формулы. Снимок на {new Date(data.generatedAt).toLocaleString("ru-RU")}.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Обновить
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Всего мастеров" value={data.totalMasters.toString()} icon={<Users className="w-4 h-4" />} />
        <KpiCard label="Средний score" value={data.avgScore.toString()} subtitle="без блокированных" icon={<TrendingUp className="w-4 h-4" />} />
        <KpiCard label="Платина + Золото" value={`${data.segments.platinum + data.segments.gold}`} subtitle={`${pct(data.segments.platinum + data.segments.gold, totalSegments)}%`} accent="text-violet-600" />
        <KpiCard label="Старт / Новички" value={data.segments.starter.toString()} subtitle={`${pct(data.segments.starter, totalSegments)}%`} accent="text-blue-600" />
      </div>

      {/* Гистограмма */}
      <Card title="Распределение по score (10-балльные корзины)" subtitle="Если 80% мастеров в одной корзине — пороги нужно сдвигать">
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.histogram} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {data.histogram.map((b, i) => <Cell key={i} fill={bucketColor(b.from)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Сегменты */}
      <Card title="По сегментам" subtitle="Тиры для будущего авто-распределения">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(["platinum", "gold", "silver", "starter", "blocked"] as const).map(seg => (
            <div key={seg} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-2xl">{SEG_LABEL[seg].emoji}</span>
                <span className="text-2xl font-bold" style={{ color: SEG_COLOR[seg] }}>
                  {data.segments[seg]}
                </span>
              </div>
              <div className="text-xs font-semibold text-gray-700 mt-1">{SEG_LABEL[seg].label}</div>
              <div className="text-[11px] text-gray-400">{pct(data.segments[seg], totalSegments)}% от всех</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Города */}
      <Card title="ТОП-20 городов" subtitle="Для понимания, где база сильнее или слабее">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase text-gray-400 border-b border-gray-100">
                <th className="py-2 pr-3">Город</th>
                <th className="py-2 pr-3">Мастеров</th>
                <th className="py-2 pr-3">Средний score</th>
                <th className="py-2 pr-3">💎</th>
                <th className="py-2 pr-3">🥇</th>
                <th className="py-2 pr-3">🥈</th>
                <th className="py-2 pr-3">🎯</th>
              </tr>
            </thead>
            <tbody>
              {data.cities.map(c => (
                <tr key={c.city} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 pr-3 font-medium">{c.city}</td>
                  <td className="py-2 pr-3 text-gray-500">{c.count}</td>
                  <td className="py-2 pr-3 font-bold" style={{ color: bucketColor(c.avgScore) }}>{c.avgScore}</td>
                  <td className="py-2 pr-3">{c.platinum}</td>
                  <td className="py-2 pr-3">{c.gold}</td>
                  <td className="py-2 pr-3">{c.silver}</td>
                  <td className="py-2 pr-3">{c.starter}</td>
                </tr>
              ))}
              {data.cities.length === 0 && (
                <tr><td colSpan={7} className="py-4 text-center text-gray-400">Нет данных</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Top / Bottom */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="ТОП-10 мастеров" subtitle="Без cold-start и блокированных">
          <MasterRankTable masters={data.top10} />
        </Card>
        <Card title="БОТ-10 мастеров" subtitle="Кандидаты на разговор / удаление">
          <MasterRankTable masters={data.bottom10} />
        </Card>
      </div>

      {/* Заметка для калибровки */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-900 leading-relaxed">
        <p className="font-bold mb-1">Как читать эти данные для калибровки:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Если <b>гистограмма скошена влево</b> (большинство в 0–40) — формула слишком жёсткая, мало кому даёт высокий score. Уменьшить штрафы или поднять веса бонусов.</li>
          <li>Если <b>скошена вправо</b> (большинство 70+) — слишком мягкая, не различает сильных и слабых. Поднять пороги сегментов или увеличить штрафы.</li>
          <li>Если в <b>«Платине» больше 15–20%</b> — порог 80 слишком низкий, сделать 85.</li>
          <li>Если в <b>«Старте» больше 50%</b> — порог 40 слишком высокий, опустить до 30. Либо много новичков (cold-start) — тогда нормально.</li>
          <li>Если ТОП-10 и интуиция оператора <b>не совпадают</b> — формула что-то не учитывает (например, адрес, специализацию, отзывы).</li>
        </ul>
      </div>
    </div>
  );
}

function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

function KpiCard({ label, value, subtitle, accent, icon }: { label: string; value: string; subtitle?: string; accent?: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="text-[11px] uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
        {icon}{label}
      </div>
      <div className={`text-2xl font-bold mt-1 ${accent ?? "text-gray-800"}`}>{value}</div>
      {subtitle && <div className="text-[11px] text-gray-400">{subtitle}</div>}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 lg:p-5">
      <div className="mb-4">
        <h2 className="font-bold text-gray-800">{title}</h2>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function MasterRankTable({ masters }: { masters: MasterScore[] }) {
  if (masters.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">Пока нет данных</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase text-gray-400 border-b border-gray-100">
            <th className="py-2 pr-2">#</th>
            <th className="py-2 pr-2">Мастер</th>
            <th className="py-2 pr-2">Город</th>
            <th className="py-2 pr-2">Score</th>
            <th className="py-2 pr-2 hidden md:table-cell">Доход</th>
            <th className="py-2 pr-2 hidden md:table-cell">Самоотм</th>
            <th className="py-2 pr-2 hidden md:table-cell">Заверш</th>
          </tr>
        </thead>
        <tbody>
          {masters.map((m, i) => (
            <tr key={m.masterId} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
              <td className="py-2 pr-2 font-medium">
                <a href={`/master-chat?masterId=${m.masterId}`} className="hover:text-blue-600">{m.alias}</a>
              </td>
              <td className="py-2 pr-2 text-gray-500 text-xs">{m.city}</td>
              <td className="py-2 pr-2">
                <span className="font-bold" style={{ color: SEG_COLOR[m.segment] }}>{m.total}</span>
                <span className="ml-1 text-xs text-gray-400">{SEG_LABEL[m.segment]?.emoji}</span>
              </td>
              <td className="py-2 pr-2 hidden md:table-cell text-xs">{Math.round(m.payRate * 100)}%</td>
              <td className="py-2 pr-2 hidden md:table-cell text-xs">{Math.round(m.selfCancelRate * 100)}%</td>
              <td className="py-2 pr-2 hidden md:table-cell text-xs text-gray-500">{m.totalCompletedAllTime}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
