import { Activity } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts';
import { formatDate, formatCurrencyFull } from '../../utils/format';

interface DataPoint {
  date: string;
  amount: number;
}

interface Props {
  data: Record<number, DataPoint[]> | undefined;
  isLoading: boolean;
  chartDays: 30 | 60 | 90;
  onDaysChange: (days: 30 | 60 | 90) => void;
}

function formatYAxis(value: number): string {
  if (value >= 1000) return `${Math.round(value / 1000)}К`;
  return `${value}`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-[#E5E7EB] rounded-xl px-3 py-2 shadow-lg">
        <div className="text-[12px] text-[#9CA3AF] mb-1">{label}</div>
        <div className="text-[14px] font-bold text-[#111827]">{formatCurrencyFull(payload[0].value)}</div>
      </div>
    );
  }
  return null;
};

export function RevenueChart({ data, isLoading, chartDays, onDaysChange }: Props) {
  const days = [30, 60, 90] as const;

  if (isLoading || !data) {
    return (
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="shimmer h-5 w-24 rounded" />
          <div className="shimmer h-8 w-36 rounded" />
        </div>
        <div className="shimmer h-48 w-full rounded" />
      </div>
    );
  }

  const chartData = (data[chartDays] || []).map(d => ({
    ...d,
    date: formatDate(d.date),
  }));

  const total = chartData.reduce((s, d) => s + d.amount, 0);
  const avg = chartData.length > 0 ? total / chartData.length : 0;
  const best = chartData.length > 0
    ? chartData.reduce((best, d) => d.amount > best.amount ? d : best, chartData[0])
    : { date: '', amount: 0 };

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 transition-all duration-200
      hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-[#34C759]">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Activity size={18} color="#34C759" />
          <span className="text-[14px] font-semibold text-[#111827]">Доходы</span>
        </div>
        <div className="flex items-center bg-[#F3F4F6] rounded-xl p-1 gap-0.5">
          {days.map(d => (
            <button
              key={d}
              onClick={() => onDaysChange(d)}
              className={`px-3 py-1 rounded-lg text-[12px] font-medium transition-all
                ${chartDays === d
                  ? 'bg-white shadow-sm text-[#111827]'
                  : 'text-[#6B7280] hover:text-[#111827]'}`}
            >
              {d}д
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#34C759" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#34C759" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#F3F4F6" strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: '#9CA3AF', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval={Math.ceil(chartData.length / 8)}
          />
          <YAxis
            tick={{ fill: '#9CA3AF', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatYAxis}
            width={45}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={avg} stroke="#D1D5DB" strokeDasharray="4 4" />
          <Area
            type="monotone"
            dataKey="amount"
            stroke="#34C759"
            strokeWidth={2.5}
            fill="url(#revenueGradient)"
            isAnimationActive
            animationDuration={800}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Bottom metrics */}
      <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-[#F3F4F6]">
        <div>
          <div className="text-[11px] text-[#9CA3AF] uppercase tracking-wider mb-1">Итого</div>
          <div className="text-[15px] font-bold text-[#111827]">{formatCurrencyFull(total)}</div>
        </div>
        <div>
          <div className="text-[11px] text-[#9CA3AF] uppercase tracking-wider mb-1">Среднее / день</div>
          <div className="text-[15px] font-bold text-[#111827]">{formatCurrencyFull(Math.round(avg))}</div>
        </div>
        <div>
          <div className="text-[11px] text-[#9CA3AF] uppercase tracking-wider mb-1">Лучший день</div>
          <div className="text-[15px] font-bold text-[#34C759]">{formatCurrencyFull(best.amount)}</div>
          <div className="text-[11px] text-[#9CA3AF]">{best.date}</div>
        </div>
      </div>
    </div>
  );
}
