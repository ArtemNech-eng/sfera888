import { LeadStatus, OrderStatus, MasterStatus, TransactionPaymentStatus } from "@workspace/api-client-react";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Новая",
  processing: "В обработке",
  sent_to_work: "Отправлена в работу",
  non_target: "Нецелевая",
  client_refusal: "Отказ клиента",
};

export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  new: "bg-blue-100 text-blue-800 border-blue-200",
  processing: "bg-amber-100 text-amber-800 border-amber-200",
  sent_to_work: "bg-purple-100 text-purple-800 border-purple-200",
  non_target: "bg-slate-100 text-slate-800 border-slate-200",
  client_refusal: "bg-red-100 text-red-800 border-red-200",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  waiting_master: "Ожидает мастера",
  master_assigned: "Назначен мастер",
  in_progress: "В работе",
  completed: "Завершён",
  cancelled: "Отменён",
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  waiting_master: "bg-amber-100 text-amber-800 border-amber-200",
  master_assigned: "bg-blue-100 text-blue-800 border-blue-200",
  in_progress: "bg-purple-100 text-purple-800 border-purple-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};

export const MASTER_STATUS_LABELS: Record<MasterStatus, string> = {
  active: "Активен",
  suspended: "Приостановлен",
  inactive: "Неактивен",
};

export const MASTER_STATUS_COLORS: Record<MasterStatus, string> = {
  active: "bg-green-100 text-green-800 border-green-200",
  suspended: "bg-amber-100 text-amber-800 border-amber-200",
  inactive: "bg-slate-100 text-slate-800 border-slate-200",
};

export const PAYMENT_STATUS_LABELS: Record<TransactionPaymentStatus, string> = {
  pending: "Ожидает",
  paid: "Оплачено",
  overdue: "Просрочено",
};

export const PAYMENT_STATUS_COLORS: Record<TransactionPaymentStatus, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  paid: "bg-green-100 text-green-800 border-green-200",
  overdue: "bg-red-100 text-red-800 border-red-200",
};

export const ROLE_LABELS = {
  admin: "Администратор",
  lead_operator: "Оператор заявок",
  master_operator: "Оператор мастеров",
};
