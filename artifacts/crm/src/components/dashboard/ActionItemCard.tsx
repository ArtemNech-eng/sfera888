import { Clock, ChevronRight } from "lucide-react";

type Priority = "critical" | "high" | "medium" | "low";

type Item = {
  id: string;
  priority: Priority;
  title: string;
  shortDescription: string;
  deadline: string | null;
  amountAtRisk?: number | null;
  type: string;
  masterId?: string | number | null;
  masterName?: string | null;
};

const PRIORITY_RU: Record<Priority, string> = {
  critical: "Критично",
  high: "Высокий",
  medium: "Средний",
  low: "Низкий",
};

const pill: Record<Priority, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-blue-100 text-blue-700",
  low: "bg-slate-100 text-slate-700",
};

const leftBorder: Record<Priority, string> = {
  critical: "border-l-red-400",
  high: "border-l-orange-400",
  medium: "border-l-blue-400",
  low: "border-l-slate-300",
};

export function ActionItemCard({ item, onOpen }: { item: Item; onOpen: (id: string) => void }) {
  return (
    <button
      onClick={() => onOpen(item.id)}
      className={`w-full text-left rounded-xl border border-l-4 ${leftBorder[item.priority]} p-3 hover:shadow-sm transition bg-white`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${pill[item.priority]}`}>
              {PRIORITY_RU[item.priority]}
            </span>
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {item.deadline ? new Date(item.deadline).toLocaleString("ru-RU") : "без дедлайна"}
            </span>
          </div>
          <div className="font-medium text-sm text-foreground line-clamp-2">{item.title}</div>
          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.shortDescription}</div>
          {(item.masterName || item.masterId != null) && (
            <div className="text-xs mt-1 text-violet-700 font-medium">
              Мастер: {item.masterName ?? `#${item.masterId}`}
            </div>
          )}
          {item.amountAtRisk != null && (
            <div className="text-xs mt-2 font-semibold text-red-700">
              Под риском: {Number(item.amountAtRisk).toLocaleString("ru-RU")} ₽
            </div>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground mt-1 shrink-0" />
      </div>
    </button>
  );
}
