import { useEffect, useRef, useState } from "react";
import { SkeletonCard } from "./SkeletonCard";
import { Users, ArrowRight } from "lucide-react";

interface FunnelData {
  total: number;
  processing: number;
  sent_to_work: number;
  rejected: number;
  conversion_rate: number;
}

interface Props {
  data?: FunnelData;
  isLoading?: boolean;
}

export function LeadFunnelCard({ data, isLoading }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(240);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setHeight(Math.max(200, Math.floor(entry.contentRect.height - 48)));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (isLoading || !data) return <SkeletonCard title="Воронка заявок" />;

  const total = Math.max(data.total, 1);
  const stages = [
    { label: "Всего заявок", value: data.total, color: "#3B82F6" },
    { label: "В обработке", value: data.processing, color: "#F59E0B" },
    { label: "Отправлено в работу", value: data.sent_to_work, color: "#34C759" },
    { label: "Отказ/некоррект", value: data.rejected, color: "#EF4444" },
  ];

  const maxValue = Math.max(...stages.map(s => s.value), 1);

  return (
    <div ref={containerRef} className="bg-white rounded-2xl p-5 border border-[#E5E7EB] h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users size={18} color="#3B82F6" />
          <h3 className="text-[15px] font-bold text-[#111827]">Воронка заявок (месяц)</h3>
        </div>
        <div className="flex items-center gap-1.5 bg-[#F0FDF4] text-[#34C759] px-2.5 py-1 rounded-lg text-[12px] font-semibold">
          {data.conversion_rate}%
          <ArrowRight size={12} />
          конверсия
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-3">
        {stages.map((stage, i) => {
          const widthPct = (stage.value / maxValue) * 100;
          return (
            <div key={i} className="flex items-center gap-3">
              <div className="w-[140px] text-[13px] text-[#6B7280] text-right shrink-0">{stage.label}</div>
              <div className="flex-1 h-8 bg-[#F3F4F6] rounded-lg overflow-hidden relative">
                <div
                  className="h-full rounded-lg flex items-center justify-end pr-2 transition-all duration-700"
                  style={{ width: `${widthPct}%`, backgroundColor: stage.color + "20" }}
                >
                  {widthPct > 15 && (
                    <span className="text-[13px] font-bold" style={{ color: stage.color }}>
                      {stage.value}
                    </span>
                  )}
                </div>
                {widthPct <= 15 && (
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[13px] font-bold text-[#374151]">
                    {stage.value}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="bg-[#F9FAFB] rounded-xl p-3">
          <div className="text-[20px] font-bold text-[#111827]">{data.total}</div>
          <div className="text-[11px] text-[#9CA3AF] uppercase tracking-wide">Всего</div>
        </div>
        <div className="bg-[#F9FAFB] rounded-xl p-3">
          <div className="text-[20px] font-bold text-[#34C759]">{data.sent_to_work}</div>
          <div className="text-[11px] text-[#9CA3AF] uppercase tracking-wide">В работу</div>
        </div>
      </div>
    </div>
  );
}
