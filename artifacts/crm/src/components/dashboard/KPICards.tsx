import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import {
  UserPlus, Users, Clock, TrendingUp, TrendingDown,
  Wallet, Banknote, Receipt, CheckCircle2,
} from 'lucide-react';
import { useCountUp } from '../../hooks/useCountUp';
import { formatChange, formatCurrency } from '../../utils/format';

interface KPIData {
  // Leads
  leads_today: number;
  leads_today_prev: number;
  leads_month: number;
  leads_month_prev: number;
  lead_conversion_rate: number;
  // Selected-period values (driven by the period tabs)
  leads_period: number;
  leads_period_prev: number;
  lead_conversion_rate_period: number;
  masters_new_period: number;
  masters_new_period_prev: number;
  // Masters
  masters_active: number;
  masters_total: number;
  masters_new_today: number;
  masters_new_today_prev: number;
  // Orders
  orders_pending: number;
  avito_balance: number;
  // Money (selected period)
  commission_period: number;
  commission_period_prev: number;
  revenue_period: number;
  completed_period: number;
  completed_period_prev: number;
  avg_check_period: number;
}

type Period = "today" | "week" | "month" | "quarter";

// Card title for the leads KPI + the "vs previous" delta label, per period.
const LEADS_TITLE: Record<Period, string> = {
  today: "Заявки сегодня",
  week: "Заявки за неделю",
  month: "Заявки за месяц",
  quarter: "Заявки за квартал",
};
const CHANGE_LABEL: Record<Period, string> = {
  today: "vs вчера",
  week: "vs прошлая неделя",
  month: "vs прошлый месяц",
  quarter: "vs прошлый квартал",
};

// Tiny inline SVG line chart (with soft area fill) from a numeric series.
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const w = 84, h = 28, pad = 2;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = (w - pad * 2) / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (h - pad * 2) * (1 - (v - min) / range);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M ${pts.join(" L ")}`;
  const lastX = (pad + (data.length - 1) * step).toFixed(1);
  const area = `${line} L ${lastX},${h - pad} L ${pad},${h - pad} Z`;
  const gid = `spark-${color.replace('#', '')}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

interface KPICardProps {
  title: string;
  value: number;
  prevValue?: number;
  icon: React.ReactNode;
  iconBg: string;
  formatValue?: (v: number) => string;
  subLabel?: string;
  subValue?: string;
  index: number;
  changeLabel?: string;
  series?: number[];
  sparkColor?: string;
  href?: string;
}

function KPICard({
  title, value, prevValue, icon, iconBg, formatValue, subLabel,
  subValue, index, changeLabel = 'vs вчера', series, sparkColor = '#34C759', href,
}: KPICardProps) {
  const [, setLocation] = useLocation();
  const animated = useCountUp(value);
  const prevRef = useRef(value);
  const [flashClass, setFlashClass] = useState('');

  useEffect(() => {
    if (prevRef.current !== value && prevRef.current !== 0) {
      setFlashClass(value > prevRef.current ? 'flash-green' : 'flash-red');
      const t = setTimeout(() => setFlashClass(''), 400);
      prevRef.current = value;
      return () => clearTimeout(t);
    }
    prevRef.current = value;
    return undefined;
  }, [value]);

  // Не показываем изменение если текущее значение 0 — "-100%" вводит в заблуждение
  const change = prevValue !== undefined && prevValue > 0 && value > 0
    ? ((value - prevValue) / prevValue) * 100
    : null;
  const isPositive = change !== null && change >= 0;

  const displayValue = formatValue
    ? formatValue(animated)
    : (animated ?? 0).toLocaleString('ru-RU');

  const clickable = !!href;

  return (
    <div
      onClick={clickable ? () => setLocation(href!) : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter') setLocation(href!); } : undefined}
      title={clickable ? 'Открыть раздел' : undefined}
      className={`bg-white border border-[#E5E7EB] rounded-2xl px-6 py-5 overflow-hidden relative
        transition-all duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-[#34C759]
        animate-fade-in-up ${flashClass} ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6B7280] leading-tight pr-2">
          {title}
        </span>
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          {icon}
        </div>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="text-[32px] font-bold text-[#111827] leading-none mb-1">
          {displayValue}
        </div>
        {series && series.length > 1 && (
          <div className="flex-shrink-0 mb-0.5">
            <Sparkline data={series} color={sparkColor} />
          </div>
        )}
      </div>

      {subValue && (
        <div className="text-[12px] text-[#9CA3AF] mb-2">{subLabel} {subValue}</div>
      )}

      {change !== null && (
        <div className="flex items-center gap-1 mt-2">
          {isPositive
            ? <TrendingUp size={13} color="#34C759" />
            : <TrendingDown size={13} color="#EF4444" />}
          <span className={`text-[12px] font-medium ${isPositive ? 'text-[#34C759]' : 'text-[#EF4444]'}`}>
            {formatChange(change)}
          </span>
          <span className="text-[12px] text-[#9CA3AF]">{changeLabel}</span>
        </div>
      )}
    </div>
  );
}

interface Props {
  data: KPIData | undefined;
  isLoading: boolean;
  period: Period;
  trends?: { leads: number[]; commission: number[] };
}

export function KPICards({ data, isLoading, period, trends }: Props) {
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        {[0, 1].map((row) => (
          <div key={row} className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white border border-[#E5E7EB] rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="shimmer h-3 w-20 rounded" />
                  <div className="shimmer h-9 w-9 rounded-full" />
                </div>
                <div className="shimmer h-8 w-24 rounded" />
                <div className="shimmer h-3 w-16 rounded" />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Row 1 — funnel & supply */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          index={0}
          title={LEADS_TITLE[period]}
          value={data.leads_period ?? 0}
          prevValue={data.leads_period_prev ?? 0}
          icon={<Users size={18} color="#3B82F6" />}
          iconBg="bg-[#EFF6FF]"
          changeLabel={CHANGE_LABEL[period]}
          series={trends?.leads}
          sparkColor="#3B82F6"
          href="/leads"
        />
        <KPICard
          index={1}
          title="Конверсия заявок"
          value={data.lead_conversion_rate_period ?? 0}
          icon={<TrendingUp size={18} color="#34C759" />}
          iconBg="bg-[#E8F9EE]"
          formatValue={(v) => `${v}%`}
          href="/leads"
        />
        <KPICard
          index={2}
          title="Новых мастеров"
          value={data.masters_new_period ?? 0}
          prevValue={data.masters_new_period_prev ?? 0}
          icon={<UserPlus size={18} color="#8B5CF6" />}
          iconBg="bg-[#F3E8FF]"
          subLabel="из"
          subValue={String(data.masters_total ?? 0)}
          changeLabel={CHANGE_LABEL[period]}
          href="/masters"
        />
        <KPICard
          index={3}
          title="В ожидании"
          value={data.orders_pending ?? 0}
          icon={<Clock size={18} color="#EF4444" />}
          iconBg="bg-[#FEF2F2]"
          href="/orders"
        />
      </div>

      {/* Row 2 — money */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          index={4}
          title="Комиссия за период"
          value={data.commission_period ?? 0}
          prevValue={data.commission_period_prev ?? 0}
          icon={<Wallet size={18} color="#0EA5E9" />}
          iconBg="bg-[#E0F2FE]"
          formatValue={formatCurrency}
          changeLabel={CHANGE_LABEL[period]}
          series={trends?.commission}
          sparkColor="#0EA5E9"
          href="/finance"
        />
        <KPICard
          index={5}
          title="Выручка мастеров"
          value={data.revenue_period ?? 0}
          icon={<Banknote size={18} color="#16A34A" />}
          iconBg="bg-[#E8F9EE]"
          formatValue={formatCurrency}
          href="/finance"
        />
        <KPICard
          index={6}
          title="Средний чек"
          value={data.avg_check_period ?? 0}
          icon={<Receipt size={18} color="#D97706" />}
          iconBg="bg-[#FEF3C7]"
          formatValue={formatCurrency}
          href="/finance"
        />
        <KPICard
          index={7}
          title="Завершено заказов"
          value={data.completed_period ?? 0}
          prevValue={data.completed_period_prev ?? 0}
          icon={<CheckCircle2 size={18} color="#059669" />}
          iconBg="bg-[#D1FAE5]"
          changeLabel={CHANGE_LABEL[period]}
          href="/orders"
        />
      </div>
    </div>
  );
}
