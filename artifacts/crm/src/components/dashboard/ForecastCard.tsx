import { TrendingUp, CheckCircle, Target, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

interface ForecastData {
  days_passed: number;
  days_in_month: number;
  revenue_so_far: number;
  daily_average: number;
  forecast: number;
  goal: number;
  status: 'ahead' | 'on_track' | 'behind';
  progress_pct: number;
}

interface Props {
  data: ForecastData | undefined;
  isLoading: boolean;
}

export function ForecastCard({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return (
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6">
        <div className="shimmer h-5 w-40 rounded mb-4" />
        <div className="shimmer h-4 w-full rounded mb-2" />
        <div className="shimmer h-2 w-full rounded mb-6" />
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[0,1,2].map(i => <div key={i} className="shimmer h-16 rounded" />)}
        </div>
        <div className="shimmer h-12 rounded" />
      </div>
    );
  }

  const daysProgress = (data.days_passed / data.days_in_month) * 100;
  const goalProgress = data.goal > 0 ? Math.min(150, (data.forecast / data.goal) * 100) : 0;
  const goalProgressColor = goalProgress >= 100 ? '#34C759' : goalProgress >= 75 ? '#F59E0B' : '#EF4444';

  const statusConfig = {
    ahead: {
      bg: 'bg-[#F0FFF8]',
      border: 'border-[#34C759]',
      icon: <CheckCircle size={16} color="#34C759" />,
      text: 'Идём с опережением',
      textColor: 'text-[#166534]',
    },
    on_track: {
      bg: 'bg-[#EFF6FF]',
      border: 'border-[#3B82F6]',
      icon: <Target size={16} color="#3B82F6" />,
      text: 'Идём по плану',
      textColor: 'text-[#1D4ED8]',
    },
    behind: {
      bg: 'bg-[#FEF2F2]',
      border: 'border-[#FECACA]',
      icon: <AlertTriangle size={16} color="#EF4444" />,
      text: 'Отстаём от плана',
      textColor: 'text-[#991B1B]',
    },
  };

  const sc = statusConfig[data.status];

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 transition-all duration-200
      hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-[#34C759]">
      <div className="flex items-center gap-2 mb-5">
        <TrendingUp size={18} color="#34C759" />
        <span className="text-[14px] font-semibold text-[#111827]">Прогноз токеновой выручки</span>
      </div>

      {/* Days progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[13px] text-[#6B7280]">Прошло {data.days_passed} из {data.days_in_month} дней</span>
          <span className="text-[12px] text-[#9CA3AF]">Осталось {data.days_in_month - data.days_passed} дн.</span>
        </div>
        <div className="h-2 bg-[#F3F4F6] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#34C759] rounded-full transition-all duration-700"
            style={{ width: `${daysProgress}%` }}
          />
        </div>
      </div>

      {/* 3 metrics */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF] mb-1">Продажи токенов</div>
          <div className="text-[18px] font-bold text-[#111827]">{formatCurrency(data.revenue_so_far)}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF] mb-1">Прогноз</div>
          <div className="text-[18px] font-bold text-[#3B82F6]">{formatCurrency(data.forecast)}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF] mb-1">Цель</div>
          <div className="text-[18px] font-bold text-[#6B7280]">{formatCurrency(data.goal)}</div>
        </div>
      </div>

      {/* Status */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border mb-4 ${sc.bg} ${sc.border}`}>
        {sc.icon}
        <span className={`text-[13px] font-medium ${sc.textColor}`}>{sc.text}</span>
        <span className={`ml-auto text-[13px] font-bold ${sc.textColor}`}>{data.progress_pct}%</span>
      </div>

      {/* Progress to goal */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] text-[#9CA3AF]">Прогресс к цели</span>
          <span className="text-[12px] font-semibold" style={{ color: goalProgressColor }}>
            {Math.min(150, Math.round(goalProgress))}%
          </span>
        </div>
        <div className="h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, goalProgress)}%`, backgroundColor: goalProgressColor }}
          />
        </div>
      </div>
    </div>
  );
}
