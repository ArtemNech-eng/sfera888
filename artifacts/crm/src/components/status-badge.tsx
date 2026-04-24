import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  type: 'lead' | 'order' | 'payment' | 'master';
  className?: string;
}

const statusMaps = {
  lead: {
    new: { label: "Новая", class: "bg-blue-100 text-blue-800 border-blue-200" },
    processing: { label: "В обработке", class: "bg-amber-100 text-amber-800 border-amber-200" },
    sent_to_work: { label: "Отправлена в работу", class: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    non_target: { label: "Нецелевая", class: "bg-slate-100 text-slate-800 border-slate-200" },
    client_refusal: { label: "Отказ клиента", class: "bg-red-100 text-red-800 border-red-200" },
  },
  order: {
    waiting_master: { label: "Ожидает мастера", class: "bg-amber-100 text-amber-800 border-amber-200" },
    master_assigned: { label: "Назначен мастер", class: "bg-blue-100 text-blue-800 border-blue-200" },
    in_progress: { label: "В работе", class: "bg-indigo-100 text-indigo-800 border-indigo-200" },
    completed: { label: "Завершён", class: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    cancelled: { label: "Отменён", class: "bg-red-100 text-red-800 border-red-200" },
    cancellation_requested: { label: "Запрос на отмену", class: "bg-orange-100 text-orange-800 border-orange-200" },
  },
  payment: {
    pending: { label: "Ожидает", class: "bg-amber-100 text-amber-800 border-amber-200" },
    paid: { label: "Оплачено", class: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    overdue: { label: "Просрочено", class: "bg-red-100 text-red-800 border-red-200" },
  },
  master: {
    active: { label: "Активен", class: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    suspended: { label: "Приостановлен", class: "bg-amber-100 text-amber-800 border-amber-200" },
    inactive: { label: "Неактивен", class: "bg-slate-100 text-slate-800 border-slate-200" },
  }
} as const;

export function StatusBadge({ status, type, className }: StatusBadgeProps) {
  const map = statusMaps[type] as Record<string, { label: string, class: string }>;
  const config = map[status] || { label: status, class: "bg-gray-100 text-gray-800 border-gray-200" };

  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
      config.class,
      className
    )}>
      {config.label}
    </span>
  );
}
