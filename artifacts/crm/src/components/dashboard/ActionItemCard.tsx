import { Clock, ChevronRight, Wrench, Banknote, MessageSquare, TriangleAlert, UserX, ShieldAlert, BadgeAlert, Settings, Phone, MessageCircle, Sparkles, Loader2 } from "lucide-react";
import { useState } from "react";

type Priority = "critical" | "high" | "medium" | "low";

type Item = {
  id: string;
  priority: Priority;
  title: string;
  shortDescription: string;
  deadline: string | null;
  createdAt: string;
  amountAtRisk?: number | null;
  type: string;
  masterId?: string | number | null;
  masterName?: string | null;
  masterPhone?: string | null;
  selected?: boolean;
  focused?: boolean;
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

const TYPE_ICON: Record<string, React.ReactNode> = {
  no_estimate: <Wrench className="w-3.5 h-3.5" />,
  no_payment: <Banknote className="w-3.5 h-3.5" />,
  no_master_response: <MessageSquare className="w-3.5 h-3.5" />,
  no_progress: <Clock className="w-3.5 h-3.5" />,
  low_avito_balance: <TriangleAlert className="w-3.5 h-3.5" />,
  blocked_master: <UserX className="w-3.5 h-3.5" />,
  possible_bypass: <ShieldAlert className="w-3.5 h-3.5" />,
  conflict: <BadgeAlert className="w-3.5 h-3.5" />,
  no_manager_id: <Settings className="w-3.5 h-3.5" />,
  custom_manual: <Settings className="w-3.5 h-3.5" />,
};

const TYPE_LABEL: Record<string, string> = {
  no_estimate: "Нет сметы",
  no_payment: "Нет оплаты",
  no_master_response: "Нет отклика",
  no_progress: "Нет движения",
  low_avito_balance: "Avito баланс",
  blocked_master: "Заблокирован",
  possible_bypass: "Обход",
  conflict: "Конфликт",
  no_manager_id: "Нет менеджера",
  custom_manual: "Ручная",
};

/** Цветной индикатор возраста задачи */
function AgeIndicator({ createdAt }: { createdAt: string }) {
  const hours = (Date.now() - new Date(createdAt).getTime()) / 3600000;
  let color: string;
  let label: string;

  if (hours >= 48) {
    const days = Math.round(hours / 24);
    const form = days % 10 === 1 && days % 100 !== 11 ? "день"
      : [2, 3, 4].includes(days % 10) && ![12, 13, 14].includes(days % 100) ? "дня"
      : "дней";
    label = `${days} ${form}`;
    color = "text-red-600 bg-red-50";
  } else if (hours >= 24) {
    label = `${Math.round(hours)}ч`;
    color = "text-orange-600 bg-orange-50";
  } else if (hours >= 8) {
    label = `${Math.round(hours)}ч`;
    color = "text-amber-600 bg-amber-50";
  } else {
    label = hours < 1 ? `${Math.max(1, Math.round(hours * 60))}м` : `${Math.round(hours)}ч`;
    color = "text-slate-600 bg-slate-50";
  }

  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color}`}>
      {label}
    </span>
  );
}

/** Пульсирующая красная точка для горящих задач */
function PulsingDot() {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
    </span>
  );
}

/** Определяет, является ли задача «горящей» */
function isBurning(item: Item): boolean {
  const hours = (Date.now() - new Date(item.createdAt).getTime()) / 3600000;
  if (hours >= 48) return true;
  if (item.deadline && new Date(item.deadline).getTime() < Date.now()) return true;
  return false;
}

export { isBurning };

export function ActionItemCard({
  item,
  onOpen,
  onToggleSelect,
  onQuickCall,
  onQuickMessage,
  onAiHint,
  aiHintLoading,
  aiHintText,
}: {
  item: Item;
  onOpen: (id: string) => void;
  onToggleSelect?: (id: string) => void;
  onQuickCall?: (id: string) => void;
  onQuickMessage?: (id: string) => void;
  onAiHint?: (id: string) => void;
  aiHintLoading?: boolean;
  aiHintText?: string | null;
}) {
  const typeIcon = TYPE_ICON[item.type];
  const typeLabel = TYPE_LABEL[item.type] ?? item.type;
  const burning = isBurning(item);
  const [showHint, setShowHint] = useState(false);

  return (
    <div
      className={`w-full rounded-xl border border-l-4 ${leftBorder[item.priority]} bg-white hover:shadow-sm transition ${
        item.selected ? "ring-2 ring-violet-400 ring-offset-1" : ""
      } ${
        item.focused ? "ring-2 ring-violet-500 ring-offset-2 shadow-md" : ""
      } ${
        burning ? "bg-red-50/30" : ""
      }`}
    >
      <div className="flex items-start gap-2 p-3">
        {/* Чекбокс выбора */}
        {onToggleSelect && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelect(item.id); }}
            className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition ${item.selected ? "bg-violet-500 border-violet-500" : "border-slate-300 hover:border-violet-400"}`}
          >
            {item.selected && (
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        )}

        {/* Основной контент — кликабельный */}
        <button
          onClick={() => onOpen(item.id)}
          className="flex-1 text-left min-w-0"
        >
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {/* Пульсирующая точка для горящих */}
            {burning && <PulsingDot />}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${pill[item.priority]}`}>
              {PRIORITY_RU[item.priority]}
            </span>
            {/* Иконка типа задачи */}
            {typeIcon && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1 ${pill[item.priority]} opacity-80`}>
                {typeIcon} {typeLabel}
              </span>
            )}
            {/* Цветной возраст */}
            <AgeIndicator createdAt={item.createdAt} />
            {item.deadline && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(item.deadline).toLocaleString("ru-RU")}
              </span>
            )}
          </div>
          <div className="font-medium text-sm text-foreground line-clamp-2">{item.title}</div>
          <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{item.shortDescription}</div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {(item.masterName || item.masterId != null) && (
              <div className="text-xs text-violet-700 font-medium">
                Мастер: {item.masterName ?? `#${item.masterId}`}
              </div>
            )}
            {item.amountAtRisk != null && Number(item.amountAtRisk) > 0 && (
              <div className="text-xs font-semibold text-red-700">
                Под риском: {Number(item.amountAtRisk).toLocaleString("ru-RU")} ₽
              </div>
            )}
          </div>
        </button>

        {/* Быстрые действия справа */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <ChevronRight className="w-4 h-4 text-muted-foreground mt-1" />
          <div className="flex gap-1 mt-1">
            {/* AI-подсказка */}
            {onAiHint && (
              <button
                onClick={(e) => { e.stopPropagation(); onAiHint(item.id); setShowHint(true); }}
                className="w-7 h-7 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 flex items-center justify-center transition"
                title="AI-совет"
              >
                {aiHintLoading ? <Loader2 className="w-3.5 h-3.5 text-amber-700 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-700" />}
              </button>
            )}
            {item.masterPhone && onQuickCall && (
              <button
                onClick={(e) => { e.stopPropagation(); onQuickCall(item.id); }}
                className="w-7 h-7 rounded-lg bg-green-50 hover:bg-green-100 border border-green-200 flex items-center justify-center transition"
                title="Позвонить мастеру"
              >
                <Phone className="w-3.5 h-3.5 text-green-700" />
              </button>
            )}
            {item.masterId && onQuickMessage && (
              <button
                onClick={(e) => { e.stopPropagation(); onQuickMessage(item.id); }}
                className="w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 flex items-center justify-center transition"
                title="Написать мастеру"
              >
                <MessageCircle className="w-3.5 h-3.5 text-blue-700" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* AI-подсказка (раскрывающийся блок) */}
      {showHint && aiHintText && (
        <div className="mx-3 mb-3 mt-1 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-900 leading-relaxed">
          <div className="flex items-start gap-1.5">
            <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <span className="font-bold text-amber-700">AI-совет: </span>
              {aiHintText}
            </div>
          </div>
          <button
            onClick={() => setShowHint(false)}
            className="mt-1.5 text-[10px] text-amber-600 hover:text-amber-800 underline"
          >
            Скрыть
          </button>
        </div>
      )}
    </div>
  );
}
