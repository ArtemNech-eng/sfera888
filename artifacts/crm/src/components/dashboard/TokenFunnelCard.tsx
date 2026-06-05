import { Filter, ChevronDown } from 'lucide-react';

interface TokenFunnelData {
  total_orders: number;
  assigned: number;
  estimate_sent: number;
  contracted: number;
  conversion_assigned: number;
  conversion_estimate: number;
  conversion_contract: number;
}

interface Props {
  data: TokenFunnelData | undefined;
  isLoading: boolean;
}

function conversionColor(pct: number): string {
  if (pct > 70) return '#34C759';
  if (pct >= 50) return '#F59E0B';
  return '#EF4444';
}

export function TokenFunnelCard({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return (
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6">
        <div className="shimmer h-5 w-36 rounded mb-4" />
        <div className="space-y-3">
          {[0,1,2,3].map(i => <div key={i} className="shimmer h-10 rounded" />)}
        </div>
      </div>
    );
  }

  const stages = [
    { label: 'ЗАКАЗ ПОСТУПИЛ', value: data.total_orders, color: '#34C759' },
    { label: 'БРОНИРОВАНИЕ', value: data.assigned, color: '#3B82F6' },
    { label: 'СМЕТА', value: data.estimate_sent, color: '#F59E0B' },
    { label: 'ДОГОВОР', value: data.contracted, color: '#34C759' },
  ];

  const conversions = [
    null,
    data.conversion_assigned,
    data.conversion_estimate,
    data.conversion_contract,
  ];

  const first = stages[0].value || 1;

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 transition-all duration-200
      hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-[#34C759]">
      <div className="flex items-center gap-2 mb-5">
        <Filter size={18} color="#6B7280" />
        <span className="text-[14px] font-semibold text-[#111827]">Воронка заказов</span>
      </div>

      <div className="space-y-0">
        {stages.map((stage, index) => {
          const pct = Math.round((stage.value / first) * 100);
          const convPct = conversions[index];
          const cc = convPct != null ? conversionColor(convPct) : '#D1D5DB';

          return (
            <div key={stage.label}>
              <div className="py-1.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                    {stage.label}
                  </span>
                  <span className="text-[18px] font-bold text-[#111827]">
                    {stage.value.toLocaleString('ru-RU')}
                  </span>
                </div>
                <div className="h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, backgroundColor: stage.color }}
                  />
                </div>
              </div>
              {index < stages.length - 1 && convPct != null && (
                <div className="flex items-center gap-2 py-0.5">
                  <ChevronDown size={14} color="#D1D5DB" />
                  <span className="text-[11px] font-medium" style={{ color: cc }}>
                    {convPct}%
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
