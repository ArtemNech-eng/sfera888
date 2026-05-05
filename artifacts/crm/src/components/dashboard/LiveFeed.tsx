import { Activity, DollarSign, UserPlus, UserCheck, CheckCircle } from 'lucide-react';
import { formatRelativeTime } from '../../utils/format';

interface FeedItem {
  id: number;
  type: 'payment' | 'new_lead' | 'assigned' | 'completed' | 'new_master';
  timestamp: Date | string;
  text: string;
  city: string;
  amount: number | null;
}

interface Props {
  data: FeedItem[] | undefined;
  isLoading: boolean;
}

function getEventConfig(type: FeedItem['type']) {
  switch (type) {
    case 'payment':
      return { icon: <DollarSign size={15} color="#34C759" />, bg: 'bg-[#E8F9EE]' };
    case 'new_lead':
      return { icon: <UserPlus size={15} color="#3B82F6" />, bg: 'bg-[#EFF6FF]' };
    case 'assigned':
      return { icon: <UserCheck size={15} color="#F59E0B" />, bg: 'bg-[#FFFBEB]' };
    case 'completed':
      return { icon: <CheckCircle size={15} color="#34C759" />, bg: 'bg-[#E8F9EE]' };
    case 'new_master':
      return { icon: <UserPlus size={15} color="#8B5CF6" />, bg: 'bg-[#F5F3FF]' };
    default:
      return { icon: <Activity size={15} color="#6B7280" />, bg: 'bg-[#F3F4F6]' };
  }
}

export function LiveFeed({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return (
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="shimmer h-5 w-32 rounded" />
          <div className="shimmer h-3 w-20 rounded" />
        </div>
        <div className="space-y-3">
          {[0,1,2,3,4,5].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="shimmer h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1">
                <div className="shimmer h-3 w-full rounded" />
                <div className="shimmer h-3 w-24 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 transition-all duration-200
      hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-[#34C759]">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Activity size={18} color="#34C759" />
          <span className="text-[14px] font-semibold text-[#111827]">Пульс системы</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[#34C759] animate-pulse-dot" />
          <span className="text-[11px] font-semibold text-[#34C759] uppercase tracking-wider">Live</span>
        </div>
      </div>
      <div className="text-[12px] text-[#9CA3AF] mb-4">Последние 24 часа</div>

      <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
        {data.length === 0 ? (
          <div className="py-8 text-center">
            <Activity size={28} className="mx-auto text-[#D1D5DB] mb-2" />
            <div className="text-sm text-[#9CA3AF]">Пока нет событий</div>
            <div className="text-xs text-[#D1D5DB] mt-1">События появятся, когда начнутся заказы</div>
          </div>
        ) : data.map((item, idx) => {
          const { icon, bg } = getEventConfig(item.type);
          return (
            <div key={item.id}>
              <div className="flex items-start gap-3 py-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${bg}`}>
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-[#111827] leading-snug">{item.text}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-[#9CA3AF]">{formatRelativeTime(item.timestamp)}</span>
                    {item.city && (
                      <span className="text-[11px] text-[#6B7280]">{item.city}</span>
                    )}
                  </div>
                </div>
              </div>
              {idx < data.length - 1 && <div className="h-px bg-[#F3F4F6]" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
