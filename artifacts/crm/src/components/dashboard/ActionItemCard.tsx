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
};

const pill: Record<Priority, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-blue-100 text-blue-700",
  low: "bg-slate-100 text-slate-700",
};

const criticalCard = "bg-red-50 border-red-200";
const normalCard = "bg-white border-slate-200";

export function ActionItemCard({ item, onOpen }: { item: Item; onOpen: (id: string) => void }) {
  return (
    <button
      onClick={() => onOpen(item.id)}
      className={`w-full text-left rounded-xl border p-3 hover:shadow-sm transition ${item.priority === "critical" ? criticalCard : normalCard}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${pill[item.priority]}`}>{item.priority}</span>
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {item.deadline ? new Date(item.deadline).toLocaleString("ru-RU") : "без дедлайна"}
            </span>
          </div>
          <div className="font-medium text-sm text-foreground line-clamp-2">{item.title}</div>
          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.shortDescription}</div>
          {item.amountAtRisk != null && (
            <div className="text-xs mt-2 font-medium text-emerald-700">Под риском: {Number(item.amountAtRisk).toLocaleString("ru-RU")} ₽</div>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground mt-1 shrink-0" />
      </div>
    </button>
  );
}
