import { Clock, Wrench, Banknote, MessageSquare, TriangleAlert, UserX, ShieldAlert, BadgeAlert, Settings, Phone, MessageCircle, Sparkles, Loader2, CheckCircle2, Timer, UserPlus, RefreshCw, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { type Priority, type ActionItemCardData, pluralRu, isBurning, TYPE_LEFT_BORDER, TYPE_LABEL, PRIORITY_RU, PRIORITY_PILL, PRIORITY_LEFT_BORDER } from "./types";

type Item = ActionItemCardData;

const pill = PRIORITY_PILL;
const leftBorder = PRIORITY_LEFT_BORDER;

const TYPE_ICON: Record<string, React.ReactNode> = {
  no_estimate: <Wrench className="w-3.5 h-3.5" />, no_payment: <Banknote className="w-3.5 h-3.5" />,
  no_master_response: <MessageSquare className="w-3.5 h-3.5" />, no_progress: <Clock className="w-3.5 h-3.5" />,
  low_avito_balance: <TriangleAlert className="w-3.5 h-3.5" />, blocked_master: <UserX className="w-3.5 h-3.5" />,
  possible_bypass: <ShieldAlert className="w-3.5 h-3.5" />, conflict: <BadgeAlert className="w-3.5 h-3.5" />,
  no_manager_id: <Settings className="w-3.5 h-3.5" />, custom_manual: <Settings className="w-3.5 h-3.5" />,
  token_refund_pending: <RefreshCw className="w-3.5 h-3.5" />, master_zero_balance: <Banknote className="w-3.5 h-3.5" />,
  master_churn_risk: <Clock className="w-3.5 h-3.5" />, order_stalled_token: <AlertTriangle className="w-3.5 h-3.5" />,
};

function AgeIndicator({ createdAt }: { createdAt: string }) {
  const hours = (Date.now() - new Date(createdAt).getTime()) / 3600000;
  let color: string; let label: string;
  if (hours >= 48) { const d = Math.round(hours / 24); label = `${d} ${pluralRu(d, "день", "дня", "дней")}`; color = "text-red-600 bg-red-50"; }
  else if (hours >= 24) { const h = Math.round(hours); label = `${h} ${pluralRu(h, "час", "часа", "часов")}`; color = "text-orange-600 bg-orange-50"; }
  else if (hours >= 8) { const h = Math.round(hours); label = `${h} ${pluralRu(h, "час", "часа", "часов")}`; color = "text-amber-600 bg-amber-50"; }
  else if (hours >= 1) { const h = Math.round(hours); label = `${h} ${pluralRu(h, "час", "часа", "часов")}`; color = "text-slate-600 bg-slate-50"; }
  else { const m = Math.max(1, Math.round(hours * 60)); label = `${m} ${pluralRu(m, "минута", "минуты", "минут")}`; color = "text-slate-600 bg-slate-50"; }
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color}`}>{label}</span>;
}

// UX-5: Просрочено
function OverdueIndicator({ deadline }: { deadline: string }) {
  const overdueH = (Date.now() - new Date(deadline).getTime()) / 3600000;
  if (overdueH <= 0) return null;
  if (overdueH >= 24) { const d = Math.round(overdueH / 24); return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white animate-pulse">Просрочено на {d} {pluralRu(d, "день", "дня", "дней")}</span>; }
  const h = Math.round(overdueH); return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500 text-white">Просрочено на {h} {pluralRu(h, "час", "часа", "часов")}</span>;
}

function PulsingDot() {
  return (<span className="relative flex h-2.5 w-2.5 shrink-0"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" /></span>);
}

// UX-4: Быстрые действия при hover
function QuickActions({ item, onQuickCall, onQuickMessage, onQuickResolve, onQuickSnooze, onAssignSelf }: {
  item: Item; onQuickCall?: (id: string) => void; onQuickMessage?: (id: string) => void;
  onQuickResolve?: (id: string) => void; onQuickSnooze?: (id: string) => void; onAssignSelf?: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {item.masterPhone && onQuickCall && (
        <a href={`tel:${item.masterPhone}`} onClick={(e) => e.stopPropagation()} className="w-6 h-6 rounded-md bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 flex items-center justify-center transition" title="Позвонить мастеру"><Phone className="w-3 h-3 text-emerald-700" /></a>
      )}
      {onQuickMessage && (
        <button onClick={(e) => { e.stopPropagation(); onQuickMessage(item.id); }} className="w-6 h-6 rounded-md bg-blue-50 hover:bg-blue-100 border border-blue-200 flex items-center justify-center transition" title="Написать мастеру"><MessageCircle className="w-3 h-3 text-blue-700" /></button>
      )}
      {onQuickResolve && (
        <button onClick={(e) => { e.stopPropagation(); onQuickResolve(item.id); }} className="w-6 h-6 rounded-md bg-green-50 hover:bg-green-100 border border-green-200 flex items-center justify-center transition" title="Пометить выполненной"><CheckCircle2 className="w-3 h-3 text-green-700" /></button>
      )}
      {onQuickSnooze && (
        <button onClick={(e) => { e.stopPropagation(); onQuickSnooze(item.id); }} className="w-6 h-6 rounded-md bg-amber-50 hover:bg-amber-100 border border-amber-200 flex items-center justify-center transition" title="Отложить на 1 день"><Timer className="w-3 h-3 text-amber-700" /></button>
      )}
      {onAssignSelf && (
        <button onClick={(e) => { e.stopPropagation(); onAssignSelf(item.id); }} className="w-6 h-6 rounded-md bg-violet-50 hover:bg-violet-100 border border-violet-200 flex items-center justify-center transition" title="Взять на себя"><UserPlus className="w-3 h-3 text-violet-700" /></button>
      )}
    </div>
  );
}

export function ActionItemCard({ item, onOpen, onToggleSelect, onQuickCall, onQuickMessage, onAiHint, aiHintLoading, aiHintText, compact, onQuickResolve, onQuickSnooze, onAssignSelf }: {
  item: Item; onOpen: (id: string) => void; onToggleSelect?: (id: string) => void;
  onQuickCall?: (id: string) => void; onQuickMessage?: (id: string) => void;
  onAiHint?: (id: string) => void; aiHintLoading?: boolean; aiHintText?: string | null;
  compact?: boolean; onQuickResolve?: (id: string) => void; onQuickSnooze?: (id: string) => void; onAssignSelf?: (id: string) => void;
}) {
  const typeIcon = TYPE_ICON[item.type];
  const typeLabel = TYPE_LABEL[item.type] ?? item.type;
  const burning = isBurning(item);
  const [showHint, setShowHint] = useState(false);
  const [hovered, setHovered] = useState(false);
  const effectiveLeftBorder = TYPE_LEFT_BORDER[item.type] ?? leftBorder[item.priority];

  // UX-3: Компактный вид
  if (compact) {
    return (
      <div className={`w-full rounded-lg border border-l-4 ${effectiveLeftBorder} bg-white hover:shadow-sm transition-all ${item.selected ? "ring-2 ring-violet-400 ring-offset-1" : ""} ${item.focused ? "ring-2 ring-violet-500 ring-offset-2 shadow-md" : ""} ${burning ? "bg-red-50/30" : ""}`}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <div className="flex items-center gap-2 px-2 py-1.5">
          {onToggleSelect && (
            <button onClick={(e) => { e.stopPropagation(); onToggleSelect(item.id); }} className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition ${item.selected ? "bg-violet-500 border-violet-500" : "border-slate-300 hover:border-violet-400"}`}>
              {item.selected && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
            </button>
          )}
          {burning && <PulsingDot />}
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${pill[item.priority]}`}>{PRIORITY_RU[item.priority]}</span>
          {typeIcon && <span className={`text-[9px] font-semibold px-1 py-0.5 rounded flex items-center gap-0.5 ${pill[item.priority]} opacity-80`}>{typeIcon} {typeLabel}</span>}
          <AgeIndicator createdAt={item.createdAt} />
          {item.deadline && <OverdueIndicator deadline={item.deadline} />}
          <button onClick={() => onOpen(item.id)} className="flex-1 text-left min-w-0 text-xs font-medium text-foreground truncate">{item.title}</button>
          {(item.masterName || item.masterId != null) && <span className="text-[10px] text-violet-700 font-medium shrink-0">{item.masterName ?? `#${item.masterId}`}</span>}
          {item.amountAtRisk != null && Number(item.amountAtRisk) > 0 && item.type === "token_refund_pending" && (
            <span className="text-[10px] font-semibold text-red-700 shrink-0">
              {`${Number(item.amountAtRisk).toLocaleString("ru-RU")} ток.`}
            </span>
          )}
          {hovered && <QuickActions item={item} onQuickCall={onQuickCall} onQuickMessage={onQuickMessage} onQuickResolve={onQuickResolve} onQuickSnooze={onQuickSnooze} onAssignSelf={onAssignSelf} />}
        </div>
        {showHint && aiHintText && (
          <div className="mx-2 mb-1.5 rounded-lg bg-amber-50 border border-amber-200 p-1.5 text-[10px] text-amber-900 leading-relaxed">
            <div className="flex items-start gap-1"><Sparkles className="w-3 h-3 shrink-0 mt-0.5 text-amber-600" /><span><strong>AI:</strong> {aiHintText}</span><button onClick={() => setShowHint(false)} className="ml-1 text-amber-600 hover:text-amber-800 underline shrink-0">скрыть</button></div>
          </div>
        )}
      </div>
    );
  }

  // Обычный (полный) вид
  return (
    <div className={`w-full rounded-xl border border-l-4 ${effectiveLeftBorder} bg-white hover:shadow-sm transition-all ${item.selected ? "ring-2 ring-violet-400 ring-offset-1" : ""} ${item.focused ? "ring-2 ring-violet-500 ring-offset-2 shadow-md" : ""} ${burning ? "bg-red-50/30" : ""}`}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className="flex items-start gap-2 p-3">
        {onToggleSelect && (
          <button onClick={(e) => { e.stopPropagation(); onToggleSelect(item.id); }} className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition ${item.selected ? "bg-violet-500 border-violet-500" : "border-slate-300 hover:border-violet-400"}`}>
            {item.selected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          </button>
        )}
        <button onClick={() => onOpen(item.id)} className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {burning && <PulsingDot />}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${pill[item.priority]}`}>{PRIORITY_RU[item.priority]}</span>
            {typeIcon && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1 ${pill[item.priority]} opacity-80`}>{typeIcon} {typeLabel}</span>}
            <AgeIndicator createdAt={item.createdAt} />
            {item.deadline && <OverdueIndicator deadline={item.deadline} />}
            {item.deadline && new Date(item.deadline).getTime() >= Date.now() && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(item.deadline).toLocaleString("ru-RU")}</span>
            )}
          </div>
          <div className="font-medium text-sm text-foreground line-clamp-2">{item.title}</div>
          <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{item.shortDescription}</div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {(item.masterName || item.masterId != null) && <div className="text-xs text-violet-700 font-medium">Мастер: {item.masterName ?? `#${item.masterId}`}</div>}
            {item.amountAtRisk != null && Number(item.amountAtRisk) > 0 && item.type === "token_refund_pending" && (
              <div className="text-xs font-semibold text-red-700">
                {`Токенов: ${Number(item.amountAtRisk).toLocaleString("ru-RU")} ток.`}
              </div>
            )}
          </div>
        </button>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {hovered ? (
            <QuickActions item={item} onQuickCall={onQuickCall} onQuickMessage={onQuickMessage} onQuickResolve={onQuickResolve} onQuickSnooze={onQuickSnooze} onAssignSelf={onAssignSelf} />
          ) : (
            <div className="flex flex-col items-end gap-1">
              <div className="flex gap-1 mt-1">
                {onAiHint && (
                  <button onClick={(e) => { e.stopPropagation(); onAiHint(item.id); setShowHint(true); }} className="w-7 h-7 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 flex items-center justify-center transition" title="AI-совет">
                    {aiHintLoading ? <Loader2 className="w-3.5 h-3.5 text-amber-700 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-700" />}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {showHint && aiHintText && (
        <div className="mx-3 mb-3 mt-1 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-900 leading-relaxed">
          <div className="flex items-start gap-1.5">
            <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
            <div><span className="font-bold text-amber-700">AI-совет: </span>{aiHintText}</div>
          </div>
          <button onClick={() => setShowHint(false)} className="mt-1.5 text-[10px] text-amber-600 hover:text-amber-800 underline">Скрыть</button>
        </div>
      )}
    </div>
  );
}
