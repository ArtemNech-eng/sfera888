import { useEffect, useRef, useState } from 'react';
import {
  DollarSign, BarChart3, FileText, CreditCard,
  UserCheck, UserPlus, Wallet, TrendingUp, TrendingDown, Edit2,
  Coins, Users, Clock, Ban, AlertCircle
} from 'lucide-react';
import { useCountUp } from '../../hooks/useCountUp';
import { formatCurrency, formatChange } from '../../utils/format';

interface KPIData {
  days_passed?: number;
  days_in_month?: number;
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
  // Token KPIs
  token_revenue_today?: number;
  token_revenue_yesterday?: number;
  tokens_sold_today?: number;
  tokens_sold_yesterday?: number;
  new_buyers_today?: number;
  new_buyers_yesterday?: number;
  orders_pending?: number;
  masters_at_zero?: number;
  masters_low_balance?: number;
  token_refunds_today?: number;
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

  // Используем реальное число прошедших дней месяца вместо хардкода 30
  const daysPassed = data.days_passed ?? new Date().getDate();
  const revenueDailyAvg = daysPassed > 0 ? data.revenue_month / daysPassed : 0;
  const revenueTodayProgress = revenueDailyAvg > 0
    ? (data.revenue_today / revenueDailyAvg) * 100 : 0;
  const mastersProgress = data.masters_total > 0
    ? (data.masters_active / data.masters_total) * 100 : 0;
  const avitoLow = data.avito_balance < 1000;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-4">
      {/* Token KPI Cards */}
      <KPICard
        index={0}
        title="Выручка от токенов"
        value={data.token_revenue_today ?? 0}
        prevValue={data.token_revenue_yesterday ?? 0}
        icon={<DollarSign size={18} color="#34C759" />}
        iconBg="bg-[#E8F9EE]"
        formatValue={formatCurrency}
      />
      <KPICard
        index={1}
        title="Токенов продано"
        value={data.tokens_sold_today ?? 0}
        prevValue={data.tokens_sold_yesterday ?? 0}
        icon={<Coins size={18} color="#F59E0B" />}
        iconBg="bg-[#FFFBEB]"
      />
      <KPICard
        index={2}
        title="Новых покупателей"
        value={data.new_buyers_today ?? 0}
        prevValue={data.new_buyers_yesterday ?? 0}
        icon={<Users size={18} color="#3B82F6" />}
        iconBg="bg-[#EFF6FF]"
      />
      <KPICard
        index={3}
        title="Ждут бронирования"
        value={data.orders_pending ?? 0}
        icon={<Clock size={18} color="#EF4444" />}
        iconBg="bg-[#FEF2F2]"
      />
      <KPICard
        index={4}
        title="На нулевом балансе"
        value={data.masters_at_zero ?? 0}
        icon={<Ban size={18} color="#EF4444" />}
        iconBg="bg-[#FEF2F2]"
      />
      <KPICard
        index={5}
        title="Низкий баланс"
        value={data.masters_low_balance ?? 0}
        icon={<AlertCircle size={18} color="#F59E0B" />}
        iconBg="bg-[#FFFBEB]"
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
