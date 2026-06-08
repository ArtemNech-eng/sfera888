import { MapPin, Plus } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

interface CityData {
  city: string;
  leads: number;
  masters_total: number;
  masters_active: number;
  conversion: number;
  token_revenue: number;
  free_masters: number;
  waiting_orders: number;
  ratio: number;
}

interface Props {
  data: CityData[] | undefined;
  isLoading: boolean;
}

function cityStatus(ratio: number): { label: string; color: string; bg: string } {
  if (ratio > 2.0) return { label: 'дефицит мастеров', color: '#EF4444', bg: '#FEF2F2' };
  if (ratio < 0.5) return { label: 'дефицит заказов', color: '#F59E0B', bg: '#FFFBEB' };
  return { label: 'норма', color: '#34C759', bg: '#E8F9EE' };
}

export function CitiesCard({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return (
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6">
        <div className="shimmer h-5 w-24 rounded mb-4" />
        <div className="space-y-4">
          {[0,1,2,3].map(i => <div key={i} className="shimmer h-14 rounded" />)}
        </div>
      </div>
    );
  }

  const maxRevenue = Math.max(...data.map(c => c.token_revenue), 1);

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 transition-all duration-200
      hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-[#34C759]">
      <div className="flex items-center gap-2 mb-5">
        <MapPin size={18} color="#34C759" />
        <span className="text-[14px] font-semibold text-[#111827]">Города</span>
      </div>

      <div className="space-y-1">
        {data.length === 0 ? (
          <div className="py-8 text-center">
            <MapPin size={28} className="mx-auto text-[#D1D5DB] mb-2" />
            <div className="text-sm text-[#9CA3AF]">Нет данных по городам</div>
            <div className="text-xs text-[#D1D5DB] mt-1">Данные появятся после первых заказов</div>
          </div>
        ) : data.map(city => {
          const status = cityStatus(city.ratio);
          const widthPct = (city.token_revenue / maxRevenue) * 100;
          return (
            <div
              key={city.city}
              className="px-3 py-2.5 rounded-xl hover:bg-[#F0FFF8] cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[15px] font-bold text-[#111827]">{city.city}</span>
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ color: status.color, backgroundColor: status.bg }}
                >
                  {status.label}
                </span>
              </div>
              <div className="h-1 bg-[#F3F4F6] rounded-full overflow-hidden mb-1.5">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${widthPct}%`, backgroundColor: '#34C759' }}
                />
              </div>
              <div className="text-[12px] text-[#9CA3AF] flex items-center gap-2 flex-wrap">
                <span>Заказов: {city.waiting_orders}</span>
                <span>·</span>
                <span>Свободных: {city.free_masters}</span>
                <span>·</span>
                <span>Ratio: {city.ratio}</span>
                <span>·</span>
                <span>{formatCurrency(city.token_revenue)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <a href="/settings?tab=cities" className="mt-4 flex items-center gap-1.5 text-[13px] font-medium text-[#34C759] hover:text-[#2aad4a] transition-colors">
        <Plus size={15} />
        Добавить город
      </a>
    </div>
  );
}
