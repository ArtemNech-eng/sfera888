import { useEffect, useRef, useState } from 'react';
import {
  DollarSign, BarChart3, FileText, CreditCard,
  UserCheck, UserPlus, Wallet, TrendingUp, TrendingDown, Edit2
} from 'lucide-react';
import { useCountUp } from '../../hooks/useCountUp';
import { formatCurrency, formatChange } from '../../utils/format';

interface KPIData {
  revenue_today: number;
  revenue_today_prev: number;
  revenue_month: number;
  revenue_month_prev: number;
  leads_today: number;
  leads_today_prev: number;
  payments_today: number;
  payments_today_prev: number;
  masters_active: number;
  masters_total: number;
  masters_new_today: number;
  masters_new_today_prev: number;
  avito_balance: number;
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
  progress?: number;
  progressColor?: string;
  index: number;
  extraContent?: React.ReactNode;
}

function KPICard({
  title, value, prevValue, icon, iconBg, formatValue, subLabel,
  subValue, progress, progressColor = '#34C759', index, extraContent
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
  }, [value]);

  const change = prevValue !== undefined && prevValue > 0
    ? ((value - prevValue) / prevValue) * 100
    : null;
  const isPositive = change !== null && change >= 0;

  const displayValue = formatValue ? formatValue(animated) : animated.toLocaleString('ru-RU');

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
          <span className="text-[12px] text-[#9CA3AF]">vs вчера</span>
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
  onEditAvitoBalance: () => void;
}

export function KPICards({ data, isLoading, onEditAvitoBalance }: Props) {
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
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

  const revenueDailyAvg = data.revenue_month / 30;
  const revenueTodayProgress = revenueDailyAvg > 0
    ? (data.revenue_today / revenueDailyAvg) * 100 : 0;
  const mastersProgress = data.masters_total > 0
    ? (data.masters_active / data.masters_total) * 100 : 0;
  const avitoLow = data.avito_balance < 1000;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
      <KPICard
        index={0}
        title="Доход сегодня"
        value={data.revenue_today}
        prevValue={data.revenue_today_prev}
        icon={<DollarSign size={18} color="#34C759" />}
        iconBg="bg-[#E8F9EE]"
        formatValue={formatCurrency}
        progress={revenueTodayProgress}
        progressColor="#34C759"
      />
      <KPICard
        index={1}
        title="Доход за месяц"
        value={data.revenue_month}
        prevValue={data.revenue_month_prev}
        icon={<BarChart3 size={18} color="#3B82F6" />}
        iconBg="bg-[#EFF6FF]"
        formatValue={formatCurrency}
      />
      <KPICard
        index={2}
        title="Заявок сегодня"
        value={data.leads_today}
        prevValue={data.leads_today_prev}
        icon={<FileText size={18} color="#F59E0B" />}
        iconBg="bg-[#FFFBEB]"
      />
      <KPICard
        index={3}
        title="Оплат сегодня"
        value={data.payments_today}
        prevValue={data.payments_today_prev}
        icon={<CreditCard size={18} color="#34C759" />}
        iconBg="bg-[#E8F9EE]"
      />
      <KPICard
        index={4}
        title="Активных мастеров"
        value={data.masters_active}
        icon={<UserCheck size={18} color="#8B5CF6" />}
        iconBg="bg-[#F5F3FF]"
        subLabel="из"
        subValue={`${data.masters_total} всего`}
        progress={mastersProgress}
        progressColor="#8B5CF6"
      />
      <KPICard
        index={5}
        title="Новых мастеров"
        value={data.masters_new_today}
        prevValue={data.masters_new_today_prev}
        icon={<UserPlus size={18} color="#34C759" />}
        iconBg="bg-[#E8F9EE]"
      />

      {/* Avito Balance — custom card */}
      <div
        className={`bg-white border rounded-2xl px-6 py-5 overflow-hidden relative
          transition-all duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]
          ${avitoLow ? 'border-[#FECACA] hover:border-[#EF4444]' : 'border-[#E5E7EB] hover:border-[#34C759]'}
          animate-fade-in-up`}
        style={{ animationDelay: '360ms' }}
      >
        <div className="flex items-start justify-between mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#6B7280] leading-tight pr-1">
            Баланс Авито
          </span>
          <div className="flex items-center gap-1">
            {avitoLow && (
              <div className="w-2 h-2 rounded-full bg-[#EF4444] animate-blink" />
            )}
            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${avitoLow ? 'bg-[#FEF2F2]' : 'bg-[#E8F9EE]'}`}>
              <Wallet size={18} color={avitoLow ? '#EF4444' : '#34C759'} />
            </div>
          </div>
        </div>
        <div className={`text-[32px] font-bold leading-none mb-2 ${avitoLow ? 'text-[#EF4444]' : 'text-[#111827]'}`}>
          {formatCurrency(data.avito_balance)}
        </div>
        {avitoLow && (
          <div className="text-[12px] text-[#EF4444] mb-2">Пополните баланс</div>
        )}
        <button
          onClick={onEditAvitoBalance}
          className="flex items-center gap-1 text-[12px] text-[#6B7280] hover:text-[#34C759] transition-colors"
        >
          <Edit2 size={12} />
          Обновить
        </button>
      </div>
    </div>
  );
}
