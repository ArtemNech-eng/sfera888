import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { leadsApi, type LeadsResponse } from "@/lib/api";
import { Search, Loader2 } from "lucide-react";
import LeadCard from "@/components/LeadCard";

const STATUS_FILTERS = [
  { value: "", label: "Все" },
  { value: "partner_review", label: "На проверке" },
  { value: "waiting_master", label: "Подтверждён" },
  { value: "invalid", label: "Отклонён" },
  { value: "master_assigned", label: "Принят" },
  { value: "completed", label: "Выполнен" },
];

export default function MyLeadsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = { current: 0 as ReturnType<typeof setTimeout> };

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(v), 350);
  };

  const { data, isLoading } = useQuery<LeadsResponse>({
    queryKey: ["leads", status, debouncedSearch],
    queryFn: () => leadsApi.list({ status: status || undefined, search: debouncedSearch || undefined }),
  });

  return (
    <div className="min-h-dvh bg-[#F8F9FA] pb-24">
      <div className="bg-white border-b border-[#E5E7EB] px-4 pt-12 pb-4">
        <h1 className="text-lg font-bold text-[#111827] mb-3">Мои лиды</h1>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            type="text"
            placeholder="Имя или телефон..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8F9FA] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#34C759] focus:border-transparent text-sm"
          />
        </div>

        {/* Status filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                status === f.value
                  ? "bg-[#34C759] text-white"
                  : "bg-[#F3F4F6] text-[#374151]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-7 h-7 animate-spin text-[#34C759]" />
          </div>
        ) : !data?.rows.length ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-[#F3F4F6] flex items-center justify-center mb-3">
              <Search size={24} className="text-[#9CA3AF]" />
            </div>
            <p className="text-sm font-medium text-[#374151]">Лиды не найдены</p>
            <p className="text-xs text-[#9CA3AF] mt-1">Попробуйте изменить фильтры</p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.rows.map(lead => (
              <LeadCard key={lead.id} lead={lead} />
            ))}
            <p className="text-center text-xs text-[#9CA3AF] pt-2">
              Показано {data.rows.length} из {data.total}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
