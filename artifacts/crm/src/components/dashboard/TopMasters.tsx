import { Trophy, Package, Star, ChevronRight } from 'lucide-react';
import { useLocation } from 'wouter';
import { formatCurrency } from '../../utils/format';

interface Master {
  id: number;
  name: string;
  city: string;
  orders_completed: number;
  conversion: number;
  rating: number;
  revenue_brought: number;
}

interface Props {
  data: Master[] | undefined;
  isLoading: boolean;
}

const rankColors: Record<number, string> = {
  1: '#F59E0B',
  2: '#94A3B8',
  3: '#CD7F32',
};

function getInitials(name: string): string {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

export function TopMasters({ data, isLoading }: Props) {
  const [, navigate] = useLocation();
  if (isLoading || !data) {
    return (
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6">
        <div className="shimmer h-5 w-32 rounded mb-4" />
        <div className="space-y-3">
          {[0,1,2,3,4].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="shimmer h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-1">
                <div className="shimmer h-3 w-32 rounded" />
                <div className="shimmer h-3 w-20 rounded" />
              </div>
              <div className="shimmer h-5 w-16 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 transition-all duration-200
      hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-[#34C759]">
      <div className="flex items-center gap-2 mb-5">
        <Trophy size={18} color="#F59E0B" />
        <span className="text-[14px] font-semibold text-[#111827]">Топ мастера</span>
      </div>

      <div className="space-y-1">
        {data.length === 0 ? (
          <div className="py-8 text-center">
            <Trophy size={28} className="mx-auto text-[#D1D5DB] mb-2" />
            <div className="text-sm text-[#9CA3AF]">Пока нет данных о мастерах</div>
            <div className="text-xs text-[#D1D5DB] mt-1">Рейтинг появится после завершения заказов</div>
          </div>
        ) : data.map((master, index) => {
          const rank = index + 1;
          const rankColor = rankColors[rank] || '#D1D5DB';
          const isTop3 = rank <= 3;
          return (
            <div
              key={master.id}
              className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-[#F8F9FA] cursor-pointer transition-colors"
            >
              <span className="text-[18px] font-bold w-5 text-center" style={{ color: rankColor }}>
                {rank}
              </span>
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-[#E8F9EE]
                  ${isTop3 ? 'border-2 border-[#34C759]' : ''}`}
              >
                <span className="text-[12px] font-bold text-[#34C759]">{getInitials(master.name)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold text-[#111827] truncate">{master.name}</div>
                <div className="text-[12px] text-[#9CA3AF]">{master.city}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex items-center gap-0.5">
                    <Package size={11} color="#6B7280" />
                    <span className="text-[11px] text-[#6B7280]">{master.orders_completed}</span>
                  </div>
                  <span className="text-[11px] text-[#9CA3AF]">·</span>
                  <span className="text-[11px] text-[#6B7280]">{master.conversion}%</span>
                  <span className="text-[11px] text-[#9CA3AF]">·</span>
                  <div className="flex items-center gap-0.5">
                    <Star size={11} color="#F59E0B" />
                    <span className="text-[11px] text-[#6B7280]">{master.rating}</span>
                  </div>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[14px] font-bold" style={{ color: isTop3 ? '#34C759' : '#111827' }}>
                  {formatCurrency(master.revenue_brought)}
                </div>
              </div>
              <ChevronRight size={14} color="#D1D5DB" className="hover:text-[#34C759]" />
            </div>
          );
        })}
      </div>

      <button
        onClick={() => navigate('/masters')}
        className="mt-4 text-[13px] font-medium text-[#34C759] hover:text-[#2aad4a] transition-colors"
      >
        Все мастера →
      </button>
    </div>
  );
}
