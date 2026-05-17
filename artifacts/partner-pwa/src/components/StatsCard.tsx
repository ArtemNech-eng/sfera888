interface StatsCardProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
}

export default function StatsCard({ label, value, sub, accent }: StatsCardProps) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#E5E7EB]">
      <div className="text-xs text-[#6B7280] font-medium mb-1">{label}</div>
      <div className={`text-2xl font-bold ${accent ? "text-[#34C759]" : "text-[#111827]"}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-[#6B7280] mt-0.5">{sub}</div>}
    </div>
  );
}
