import { Target } from 'lucide-react';

interface ROISource {
  source: string;
  leads: number;
  orders: number;
  revenue: number;
  spend: number;
  conversion: number;
  roi: number | null;
}

interface Props {
  data: ROISource[] | undefined;
  isLoading: boolean;
}

function convColor(pct: number): string {
  if (pct >= 40) return '#34C759';
  if (pct >= 25) return '#F59E0B';
  return '#EF4444';
}

function ROIBadge({ roi, isOrganic }: { roi: number | null; isOrganic: boolean }) {
  if (isOrganic) {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#E8F9EE] text-[#166534]">
        Органика
      </span>
    );
  }
  if (roi === null) {
    return <span className="text-[12px] text-[#9CA3AF]">—</span>;
  }
  const x = roi.toFixed(1);
  if (roi >= 3) return (
    <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#E8F9EE] text-[#34C759]">×{x}</span>
  );
  if (roi >= 1.5) return (
    <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#FFFBEB] text-[#854D0E]">×{x}</span>
  );
  return (
    <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#FEF2F2] text-[#991B1B]">×{x}</span>
  );
}

export function ROICard({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return (
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6">
        <div className="shimmer h-5 w-40 rounded mb-4" />
        <div className="space-y-3">
          {[0,1,2,3,4].map(i => <div key={i} className="shimmer h-10 rounded" />)}
        </div>
      </div>
    );
  }

  const best = data.reduce((b, s) => {
    const roiA = s.roi ?? 999;
    const roiB = b.roi ?? 999;
    return roiA > roiB ? s : b;
  }, data[0]);

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 transition-all duration-200
      hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-[#34C759]">
      <div className="flex items-center gap-2 mb-5">
        <Target size={18} color="#3B82F6" />
        <span className="text-[14px] font-semibold text-[#111827]">ROI по источникам</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {['Источник', 'Заявки', 'Заказы', 'Конверсия', 'ROI'].map(h => (
                <th key={h} className="text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF] pb-3 pr-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {data.map(row => {
              const isOrganic = row.spend === 0;
              const isBest = row.source === best.source;
              return (
                <tr
                  key={row.source}
                  className={`transition-colors ${isBest ? 'bg-[#F0FFF8]' : 'hover:bg-[#F8F9FA]'}`}
                >
                  <td className="py-2 pr-3">
                    <span className="text-[13px] font-bold text-[#111827]">{row.source}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="text-[13px] text-[#374151]">{row.leads}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="text-[13px] text-[#374151]">{row.orders}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="text-[13px] font-medium" style={{ color: convColor(row.conversion) }}>
                      {row.conversion.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2">
                    <ROIBadge roi={row.roi} isOrganic={isOrganic} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 pt-3 border-t border-[#F3F4F6]">
        <span className="text-[12px] text-[#9CA3AF]">Лучший: </span>
        <span className="text-[12px] font-semibold text-[#34C759]">
          {best.source} {best.roi ? `(ROI: ×${best.roi.toFixed(1)})` : '(органика)'}
        </span>
      </div>
    </div>
  );
}
