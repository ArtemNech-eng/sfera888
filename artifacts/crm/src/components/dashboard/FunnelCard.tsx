import { Filter, ChevronDown } from 'lucide-react';

interface FunnelData {
  contacts: number;
  leads: number;
  assigned: number;
  estimate_sent: number;
  payment_received: number;
  completed: number;
  overall_conversion: number;
  prev_conversion: number;
}

interface Props {
  data: FunnelData | undefined;
  isLoading: boolean;
}

function conversionColor(pct: number): string {
  if (pct > 70) return '#34C759';
  if (pct >= 50) return '#F59E0B';
  return '#EF4444';
}

export function FunnelCard({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return (
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6">
        <div className="shimmer h-5 w-36 rounded mb-4" />
        <div className="space-y-3">
          {[0,1,2,3,4,5].map(i => <div key={i} className="shimmer h-10 rounded" />)}
        </div>
      </div>
    );
  }

  const stages = [
    { label: 'КОНТАКТЫ', value: data.contacts, color: '#34C759' },
    { label: 'ЗАЯВКИ', value: data.leads, color: '#34C759' },
    { label: 'НАЗНАЧЕН МАСТЕР', value: data.assigned, color: '#3B82F6' },
    { label: 'СМЕТА ОТПРАВЛЕНА', value: data.estimate_sent, color: '#F59E0B' },
    { label: 'ОПЛАЧЕНО', value: data.payment_received, color: '#8B5CF6' },
    { label: 'ЗАВЕРШЕНО', value: data.completed, color: '#34C759' },
  ];

  const first = stages[0].value || 1;
  const changeStr = data.overall_conversion - data.prev_conversion;
  const changePositive = changeStr >= 0;

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 transition-all duration-200
      hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-[#34C759]">
      <div className="flex items-center gap-2 mb-5">
        <Filter size={18} color="#6B7280" />
        <span className="text-[14px] font-semibold text-[#111827]">Воронка продаж</span>
      </div>

      <div className="space-y-0">
        {stages.map((stage, index) => {
          const pct = Math.round((stage.value / first) * 100);
          const prevValue = index > 0 ? stages[index - 1].value : stage.value;
          const convPct = prevValue > 0 ? Math.round((stage.value / prevValue) * 100) : 100;
          const cc = conversionColor(convPct);

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
              {index < stages.length - 1 && (
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

      <div className="mt-4 pt-4 border-t border-[#F3F4F6]">
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-[#9CA3AF]">Общая конверсия</span>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium" style={{ color: changePositive ? '#34C759' : '#EF4444' }}>
              {changePositive ? '+' : ''}{changeStr.toFixed(1)}% vs прошлый
            </span>
          </div>
        </div>
        <div className="text-[28px] font-bold text-[#111827] mt-1">
          {data.overall_conversion.toFixed(1)}%
        </div>
      </div>
    </div>
  );
}
