/** Общие типы для блока задач «Что делать сейчас» */

export type Priority = "critical" | "high" | "medium" | "low";

/** Базовый тип задачи (из API) */
export type ActionItem = {
  id: string;
  type: string;
  priority: Priority;
  title: string;
  shortDescription: string;
  fullDescription: string;
  createdAt: string;
  deadline: string | null;
  status: string;
  entityType: string;
  entityId: string | number | null;
  orderId: string | number | null;
  masterId: string | number | null;
  clientId: string | number | null;
  city: string | null;
  amountAtRisk: number | null;
  assigneeId?: string | number | null;
  assigneeName?: string | null;
  masterName?: string | null;
  masterPhone?: string | null;
  actions: { key: string; label: string; style: string }[];
};

/** Расширенный тип для карточки (с UI-состоянием) */
export type ActionItemCardData = ActionItem & {
  selected?: boolean;
  focused?: boolean;
};

/** Общая функция склонения русских слов */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  const last2 = abs % 100;
  const last1 = abs % 10;
  if (last2 >= 11 && last2 <= 14) return many;
  if (last1 === 1) return one;
  if (last1 >= 2 && last1 <= 4) return few;
  return many;
}

/** Проверка: задача «горит» (критично просрочена) */
export function isBurning(item: { createdAt: string; deadline: string | null; priority: Priority }): boolean {
  // Низкоприоритетные задачи никогда не «горят»
  if (item.priority === "low") return false;
  // Просроченный дедлайн — всегда горит для critical/high
  if (item.deadline && new Date(item.deadline).getTime() < Date.now()) return true;
  // Возраст задачи: critical/high горят через 48ч, medium — через 72ч
  const hours = (Date.now() - new Date(item.createdAt).getTime()) / 3600000;
  if (item.priority === "critical" || item.priority === "high") return hours >= 48;
  if (item.priority === "medium") return hours >= 72;
  return false;
}

/** Общие маппинги типов задач — единый источник истины */
export const TYPE_LEFT_BORDER: Record<string, string> = {
  no_estimate: "border-l-orange-500", no_payment: "border-l-yellow-500",
  no_master_response: "border-l-blue-500", no_progress: "border-l-amber-500",
  low_avito_balance: "border-l-pink-500", blocked_master: "border-l-violet-500",
  possible_bypass: "border-l-red-600", conflict: "border-l-rose-500",
  no_manager_id: "border-l-slate-400", custom_manual: "border-l-slate-400",
};

export const TYPE_LABEL: Record<string, string> = {
  no_estimate: "Нет сметы", no_payment: "Нет оплаты", no_master_response: "Нет отклика",
  no_progress: "Нет движения", low_avito_balance: "Avito баланс", blocked_master: "Заблокирован",
  possible_bypass: "Обход", conflict: "Конфликт", no_manager_id: "Нет менеджера", custom_manual: "Ручная",
};

/** Общие маппинги приоритетов — единый источник истины */
export const PRIORITY_RU: Record<Priority, string> = {
  critical: "Критично", high: "Высокий", medium: "Средний", low: "Низкий",
};

export const PRIORITY_PILL: Record<Priority, string> = {
  critical: "bg-red-100 text-red-700", high: "bg-orange-100 text-orange-700",
  medium: "bg-blue-100 text-blue-700", low: "bg-slate-100 text-slate-700",
};

export const PRIORITY_LEFT_BORDER: Record<Priority, string> = {
  critical: "border-l-red-400", high: "border-l-orange-400",
  medium: "border-l-blue-400", low: "border-l-slate-300",
};
