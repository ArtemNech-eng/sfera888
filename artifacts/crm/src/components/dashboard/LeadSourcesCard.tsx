import { SkeletonCard } from "./SkeletonCard";
import { BarChart3 } from "lucide-react";

interface SourceData {
  channel: string;
  count: number;
  sent_to_work: number;
  conversion: number;
}

interface Props {
  data?: SourceData[];
  isLoading?: boolean;
}

export function LeadSourcesCard({ data, isLoading }: Props) {
  if (isLoading || !data) return <SkeletonCard title="Источники заявок" />;

  const total = data.reduce((s, d) => s + d.count, 0);
  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="bg-white rounded-2xl p-5 border border-[#E5E7EB] h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={18} color="#34C759" />
        <h3 className="text-[15px] font-bold text-[#111827]">Источники заявок (месяц)</h3>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[11px] text-[#9CA3AF] uppercase tracking-wide border-b border-[#F3F4F6]">
              <th className="pb-2 font-medium">Канал</th>
              <th className="pb-2 font-medium text-right">Заявки</th>
              <th className="pb-2 font-medium text-right">В работу</th>
              <th className="pb-2 font-medium text-right">Конверсия</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-[#F9FAFB] last:border-0">
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#3B82F6]" />
                    <span className="text-[13px] font-medium text-[#374151]">{row.channel}</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#F3F4F6] rounded-full mt-1">
                    <div
                      className="h-full bg-[#3B82F6] rounded-full transition-all duration-500"
                      style={{ width: `${(row.count / maxCount) * 100}%` }}
                    />
                  </div>
                </td>
                <td className="py-2.5 text-right text-[13px] font-bold text-[#111827]">{row.count}</td>
                <td className="py-2.5 text-right text-[13px] font-semibold text-[#34C759]">{row.sent_to_work}</td>
                <td className="py-2.5 text-right text-[13px] font-semibold text-[#6B7280]">{row.conversion}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 pt-3 border-t border-[#F3F4F6] flex items-center justify-between text-[12px] text-[#9CA3AF]">
        <span>Всего каналов: {data.length}</span>
        <span>Заявок: {total}</span>
      </div>
    </div>
  );
}
