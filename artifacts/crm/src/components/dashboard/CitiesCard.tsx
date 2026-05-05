import { MapPin, Plus } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

interface CityData {
  city: string;
  leads: number;
  payments: number;
  revenue: number;
  masters_total: number;
  masters_active: number;
  conversion: number;
}

interface Props {
  data: CityData[] | undefined;
  isLoading: boolean;
}

function convColor(pct: number): string {
  if (pct > 25) return '#34C759';
  if (pct >= 15) return '#F59E0B';
  return '#EF4444';
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

  const maxRevenue = Math.max(...data.map(c => c.revenue), 1);

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
          const cc = convColor(city.conversion);
          const widthPct = (city.revenue / maxRevenue) * 100;
          return (
            <div
              key={city.city}
              className="px-3 py-2.5 rounded-xl hover:bg-[#F0FFF8] cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[15px] font-bold text-[#111827]">{city.city}</span>
                <span className="text-[13px] font-semibold" style={{ color: cc }}>
                  {city.conversion.toFixed(1)}%
                </span>
              </div>
              <div className="h-1 bg-[#F3F4F6] rounded-full overflow-hidden mb-1.5">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${widthPct}%`, backgroundColor: cc }}
                />
              </div>
              <div className="text-[12px] text-[#9CA3AF]">
                Заявки: {city.leads} · Оплат: {city.payments} · {formatCurrency(city.revenue)}
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
