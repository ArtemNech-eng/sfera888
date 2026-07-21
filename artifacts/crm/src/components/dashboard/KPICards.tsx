import { useEffect, useRef, useState } from 'react';
import {
  UserPlus, Users, Clock, TrendingUp, TrendingDown
} from 'lucide-react';
import { useCountUp } from '../../hooks/useCountUp';
import { formatChange } from '../../utils/format';

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
const PERIOD_WORD: Record<Period, string> = {
  today: "сегодня",
  week: "за неделю",
  month: "за месяц",
  quarter: "за квартал",
};

interface KPICardProps {
  title: string;
  value: number;
  prevValue?: number;
  icon: React.ReactNode;
  iconBg: string;
  formatValue?: (v: number) => string;
  subLabel?: string;
  subValue?: string;
  progress?: number;
  progressColor?: string;
  index: number;
  extraContent?: React.ReactNode;
  changeLabel?: string;
}

function KPICard({
  title, value, prevValue, icon, iconBg, formatValue, subLabel,
  subValue, progress, progressColor = '#34C759', index, extraContent, changeLabel = 'vs вчера'
}: KPICardProps) {
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

  return (
    <div
      className={`bg-white border border-[#E5E7EB] rounded-2xl px-6 py-5 cursor-default overflow-hidden relative
        transition-all duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-[#34C759]
        animate-fade-in-up ${flashClass}`}
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

      <div className="text-[32px] font-bold text-[#111827] leading-none mb-1">
        {displayValue}
      </div>

      {subValue && (
        <div className="text-[12px] text-[#9CA3AF] mb-2">{subLabel} {subValue}</div>
      )}

      {extraContent}

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

      {progress !== undefined && (
        <div className="mt-3 h-[3px] bg-[#F3F4F6] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, progress)}%`, backgroundColor: progressColor }}
          />
        </div>
      )}
    </div>
  );
}

interface Props {
  data: KPIData | undefined;
  isLoading: boolean;
  period: Period;
}

export function KPICards({ data, isLoading, period }: Props) {
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KPICard
        index={0}
        title={LEADS_TITLE[period]}
        value={data.leads_period ?? 0}
        prevValue={data.leads_period_prev ?? 0}
        icon={<Users size={18} color="#3B82F6" />}
        iconBg="bg-[#EFF6FF]"
        changeLabel={CHANGE_LABEL[period]}
      />
      <KPICard
        index={1}
        title="Конверсия заявок"
        value={data.lead_conversion_rate_period ?? 0}
        icon={<TrendingUp size={18} color="#34C759" />}
        iconBg="bg-[#E8F9EE]"
        formatValue={(v) => `${v}%`}
        changeLabel={PERIOD_WORD[period]}
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
      />
      <KPICard
        index={3}
        title="В ожидании"
        value={data.orders_pending ?? 0}
        icon={<Clock size={18} color="#EF4444" />}
        iconBg="bg-[#FEF2F2]"
      />
    </div>
  );
}
