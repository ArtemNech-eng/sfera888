import { BarChart3 } from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';

interface DataPoint {
  date: string;
  inflow: number;
  outflow: number;
  float: number;
}

interface Props {
  data: DataPoint[] | undefined;
  isLoading: boolean;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-[#E5E7EB] rounded-xl px-3 py-2 shadow-lg">
        <div className="text-[12px] text-[#9CA3AF] mb-1">{label}</div>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-2 text-[13px]">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-[#6B7280]">{p.name}:</span>
            <span className="font-bold text-[#111827]">{Math.round(p.value)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export function TokenFlowChart({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return (
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="shimmer h-5 w-32 rounded" />
        </div>
        <div className="shimmer h-48 w-full rounded" />
      </div>
    );
  }

  const chartData = data.map(d => ({
    ...d,
    date: d.date.slice(5), // MM-DD
    net: d.inflow - d.outflow,
  }));

  const totalInflow = chartData.reduce((s, d) => s + d.inflow, 0);
  const totalOutflow = chartData.reduce((s, d) => s + d.outflow, 0);
  const netTotal = totalInflow - totalOutflow;

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 transition-all duration-200
      hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-[#34C759]">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} color="#34C759" />
          <span className="text-[14px] font-semibold text-[#111827]">Оборот токенов</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
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
            width={45}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: '12px', color: '#6B7280' }}
            formatter={(value: string) => {
              const labels: Record<string, string> = {
                inflow: 'Покупки',
                outflow: 'Списания',
                net: 'Net',
              };
              return labels[value] ?? value;
            }}
          />
          <Bar dataKey="inflow" fill="#34C759" radius={[4, 4, 0, 0]} barSize={12} />
          <Bar dataKey="outflow" fill="#F59E0B" radius={[4, 4, 0, 0]} barSize={12} />
          <Line type="monotone" dataKey="net" stroke="#3B82F6" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Bottom metrics */}
      <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-[#F3F4F6]">
        <div>
          <div className="text-[11px] text-[#9CA3AF] uppercase tracking-wider mb-1">Покупки</div>
          <div className="text-[15px] font-bold text-[#34C759]">{Math.round(totalInflow)} т.</div>
        </div>
        <div>
          <div className="text-[11px] text-[#9CA3AF] uppercase tracking-wider mb-1">Списания</div>
          <div className="text-[15px] font-bold text-[#F59E0B]">{Math.round(totalOutflow)} т.</div>
        </div>
        <div>
          <div className="text-[11px] text-[#9CA3AF] uppercase tracking-wider mb-1">Net</div>
          <div className={`text-[15px] font-bold ${netTotal >= 0 ? 'text-[#3B82F6]' : 'text-[#EF4444]'}`}>
            {Math.round(netTotal)} т.
          </div>
        </div>
      </div>
    </div>
  );
}
