import { Zap, TrendingDown, TrendingUp } from 'lucide-react';

interface SpeedMetric {
  current: number;
  prev: number;
  norm: number;
}

interface SpeedData {
  assign_min: SpeedMetric;
  estimate_h: SpeedMetric;
  payment_h: SpeedMetric;
  completion_d: SpeedMetric;
  lifecycle_d: SpeedMetric;
}

interface Props {
  data: SpeedData | undefined;
  isLoading: boolean;
}

interface MetricRowProps {
  label: string;
  current: number;
  prev: number;
  norm: number;
  unit: string;
  formatVal?: (v: number) => string;
}

function MetricRow({ label, current, prev, norm, unit, formatVal }: MetricRowProps) {
  const diff = Math.abs(current - prev);
  const diffPct = prev > 0 ? (diff / prev) * 100 : 0;
  const improved = current < prev;

  const progressPct = Math.min(100, (norm / Math.max(current, norm)) * 100);
  const barColor = current <= norm ? '#34C759' : current <= norm * 1.3 ? '#F59E0B' : '#EF4444';

  const displayVal = formatVal ? formatVal(current) : `${current} ${unit}`;

  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[13px] text-[#6B7280]">{label}</span>
        <div className="flex items-center gap-1.5">
          {improved
            ? <TrendingDown size={12} color="#34C759" />
            : <TrendingUp size={12} color="#EF4444" />}
          <span className="text-[11px]" style={{ color: improved ? '#34C759' : '#EF4444' }}>
            {diffPct.toFixed(0)}% {improved ? 'быстрее' : 'медленнее'}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[16px] font-bold text-[#111827]">{displayVal}</span>
        <span className="text-[11px] text-[#9CA3AF]">норма: {norm} {unit}</span>
      </div>
      <div className="h-1 bg-[#F3F4F6] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${progressPct}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}

export function SpeedMetrics({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return (
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6">
        <div className="shimmer h-5 w-40 rounded mb-4" />
        <div className="space-y-4">
          {[0,1,2,3,4].map(i => <div key={i} className="shimmer h-14 rounded" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 transition-all duration-200
      hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-[#34C759]">
      <div className="flex items-center gap-2 mb-5">
        <Zap size={18} color="#F59E0B" />
        <span className="text-[14px] font-semibold text-[#111827]">Скорость системы</span>
      </div>

      <div className="divide-y divide-[#F3F4F6]">
        <MetricRow
          label="Назначение мастера"
          current={data.assign_min.current}
          prev={data.assign_min.prev}
          norm={data.assign_min.norm}
          unit="мин"
        />
        <MetricRow
          label="Отправка сметы"
          current={data.estimate_h.current}
          prev={data.estimate_h.prev}
          norm={data.estimate_h.norm}
          unit="ч"
        />
        <MetricRow
          label="Оплата предоплаты"
          current={data.payment_h.current}
          prev={data.payment_h.prev}
          norm={data.payment_h.norm}
          unit="ч"
        />
        <MetricRow
          label="Завершение заказа"
          current={data.completion_d.current}
          prev={data.completion_d.prev}
          norm={data.completion_d.norm}
          unit="дн"
        />
        <MetricRow
          label="Жизненный цикл заказа"
          current={data.lifecycle_d.current}
          prev={data.lifecycle_d.prev}
          norm={data.lifecycle_d.norm}
          unit="дн"
        />
      </div>
    </div>
  );
}
