import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import {
  Brain, AlertTriangle, Eye, Shield, HelpCircle, Archive,
  RefreshCw, CheckCircle, RotateCcw, MessageSquare, Phone,
  ExternalLink, ChevronRight, Loader2, Copy, Send, X, Lock
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MasterInfo {
  id: number;
  alias: string;
  phone?: string | null;
  maxChatId?: string | null;
  telegramId?: string | null;
}

interface ChatCase {
  id: number;
  orderId: number;
  masterId: number;
  city: string;
  district: string;
  serviceType: string;
  orderStatus: string;
  currentStage: string;
  riskLevel: string;
  riskReason?: string | null;
  summary?: string | null;
  nextAction: string;
  nextActionDeadline?: string | null;
  lastMasterMessageAt?: string | null;
  lastAiMessageAt?: string | null;
  hoursWithoutContact?: string | null;
  hoursWithoutEstimate?: string | null;
  hoursWithoutPayment?: string | null;
  expectedRevenue?: string | null;
  expectedCommission?: string | null;
  tags: string[];
  confidence: string;
  isResolved: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  master: MasterInfo | null;
}

interface Stats {
  total: number;
  green: number;
  yellow: number;
  red: number;
  bypass: number;
  ambiguous: number;
  frozenMoney: number;
}

interface ApiResponse {
  cases: ChatCase[];
  stats: Stats;
  page: number;
  limit: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  green: "bg-emerald-50 border-emerald-100",
  yellow: "bg-yellow-50 border-yellow-100",
  red: "bg-red-50 border-red-100",
};

const RISK_BADGE: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-800",
  yellow: "bg-yellow-100 text-yellow-800",
  red: "bg-red-100 text-red-800",
};

const RISK_ICON: Record<string, string> = {
  green: "🟢",
  yellow: "🟡",
  red: "🔴",
};

const STAGE_LABELS: Record<string, string> = {
  assigned: "Назначен",
  waiting_estimate: "Ждём смету",
  waiting_payment: "Ждём оплату",
  in_progress: "В работе",
  waiting_update: "Нет обновлений",
  possible_bypass: "Риск обхода",
  conflict: "Конфликт",
  completed: "Завершён",
  cancelled: "Отменён",
};

const ACTION_LABELS: Record<string, string> = {
  remind_master_estimate: "Напомнить про смету",
  remind_master_payment: "Напомнить про оплату",
  ask_master_status: "Запросить статус",
  call_master: "Позвонить мастеру",
  review_for_reassign: "На пересмотр",
  review_for_cancel: "Рассмотреть отмену",
  no_action: "Норма",
};

const TAG_LABELS: Record<string, string> = {
  possible_bypass: "Обход системы",
  delayed_estimate: "Задержка сметы",
  delayed_payment: "Задержка оплаты",
  master_delay: "Откладывает",
  client_refused: "Клиент отказался",
  conflict: "Конфликт",
  no_money: "Нет денег",
  ambiguous_order_link: "Неточная привязка",
  ambiguous_status: "Неясный статус",
};

const TAG_COLORS: Record<string, string> = {
  possible_bypass: "bg-red-100 text-red-700 border border-red-200",
  conflict: "bg-red-100 text-red-700 border border-red-200",
  delayed_estimate: "bg-orange-100 text-orange-700 border border-orange-200",
  delayed_payment: "bg-orange-100 text-orange-700 border border-orange-200",
  master_delay: "bg-yellow-100 text-yellow-700 border border-yellow-200",
  client_refused: "bg-slate-100 text-slate-600 border border-slate-200",
  no_money: "bg-yellow-100 text-yellow-700 border border-yellow-200",
  ambiguous_order_link: "bg-blue-100 text-blue-700 border border-blue-200",
  ambiguous_status: "bg-blue-100 text-blue-700 border border-blue-200",
};

function fmtMoney(v?: string | number | null) {
  if (!v) return null;
  const n = Number(v);
  if (isNaN(n)) return null;
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

function fmtHours(h?: string | null) {
  if (!h) return "—";
  const n = Number(h);
  if (n < 1) return "<1ч";
  if (n < 24) return `${Math.round(n)}ч`;
  return `${Math.floor(n / 24)}д ${Math.round(n % 24)}ч`;
}

// ─── Message templates ────────────────────────────────────────────────────────

function buildTemplate(action: string, masterName: string, orderId: number): string {
  const n = masterName;
  const id = orderId;
  if (action === "remind_master_estimate") {
    return `${n}, добрый день.\nПо заказу #${id} ещё не отправлена смета.\nПожалуйста отправьте её через приложение сегодня.\nБез сметы заказ не двигается.`;
  }
  if (action === "remind_master_payment") {
    return `${n}, по заказу #${id} предоплата ещё не закрыта.\nПроверьте статус и дайте обратную связь.`;
  }
  if (action === "ask_master_status") {
    return `${n}, подскажите статус по заказу #${id}.\nКогда будет следующий шаг?`;
  }
  if (action === "review_for_cancel" || action === "review_for_reassign") {
    return `${n}, напоминаю: все заказы ведём только через систему, со сметой и предоплатой через приложение.\nПодтвердите пожалуйста текущий статус по заказу #${id}.`;
  }
  return `${n}, подскажите статус по заказу #${id}.`;
}

// ─── Message modal ────────────────────────────────────────────────────────────

function MessageModal({ caseItem, onClose }: { caseItem: ChatCase; onClose: () => void }) {
  const masterName = caseItem.master?.alias ?? `Мастер #${caseItem.masterId}`;
  const [text, setText] = useState(buildTemplate(caseItem.nextAction, masterName, caseItem.orderId));
  const [copied, setCopied] = useState(false);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/chat-cases/${caseItem.id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text }),
      });
      if (!r.ok) throw new Error(await r.text());
    },
    onSuccess: onClose,
  });

  const templates = [
    { label: "Смета", key: "remind_master_estimate" },
    { label: "Оплата", key: "remind_master_payment" },
    { label: "Статус", key: "ask_master_status" },
    { label: "Риск обхода", key: "review_for_cancel" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <div>
            <h3 className="font-semibold text-foreground">Написать мастеру</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{masterName} · Заказ #{caseItem.orderId}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-2 flex-wrap">
            {templates.map(t => (
              <button key={t.key} onClick={() => setText(buildTemplate(t.key, masterName, caseItem.orderId))}
                className="text-xs px-3 py-1.5 rounded-full border border-border/60 hover:bg-slate-50 transition-colors text-muted-foreground">
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={6}
            className="w-full text-sm border border-border/60 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl border border-border/60 hover:bg-slate-50 transition-colors text-muted-foreground">
              <Copy className="w-3.5 h-3.5" />{copied ? "Скопировано" : "Скопировать"}
            </button>
            <button onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending || !text.trim()}
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {sendMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Отправить в Max
            </button>
          </div>
          {sendMutation.isError && <p className="text-xs text-red-600">{String((sendMutation.error as any)?.message ?? "Ошибка")}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Case row ─────────────────────────────────────────────────────────────────

function CaseRow({ c, onMessage }: { c: ChatCase; onMessage: (c: ChatCase) => void }) {
  const queryClient = useQueryClient();

  const resolveMutation = useMutation({
    mutationFn: async (action: string) => {
      await fetch(`/api/chat-cases/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/chat-cases"] }),
  });

  const masterName = c.master?.alias ?? `Мастер #${c.masterId}`;

  return (
    <tr className={cn("border-b border-border/40 transition-colors hover:brightness-95 text-sm", RISK_COLORS[c.riskLevel] ?? "bg-white")}>
      {/* Order */}
      <td className="px-3 py-3 pl-4 whitespace-nowrap">
        <a href={`/leads?tab=work&highlight=${c.orderId}`} className="font-semibold text-primary hover:underline">#{c.orderId}</a>
      </td>
      {/* Master */}
      <td className="px-3 py-3 whitespace-nowrap">
        <div className="font-medium text-foreground">{masterName}</div>
        {c.master?.phone && <div className="text-[11px] text-muted-foreground">{c.master.phone}</div>}
      </td>
      {/* Location */}
      <td className="px-3 py-3 whitespace-nowrap text-muted-foreground text-xs">
        {c.city}{c.district ? `, ${c.district}` : ""}
      </td>
      {/* Service */}
      <td className="px-3 py-3 max-w-[160px]">
        <div className="truncate text-foreground text-xs">{c.serviceType}</div>
      </td>
      {/* Stage */}
      <td className="px-3 py-3 whitespace-nowrap">
        <span className="text-xs text-muted-foreground bg-white/80 border border-border/40 px-2 py-0.5 rounded-full">
          {STAGE_LABELS[c.currentStage] ?? c.currentStage}
        </span>
      </td>
      {/* Risk */}
      <td className="px-3 py-3 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", RISK_BADGE[c.riskLevel])}>
            {RISK_ICON[c.riskLevel]} {c.riskLevel === "green" ? "Норма" : c.riskLevel === "yellow" ? "Внимание" : "Критично"}
          </span>
        </div>
        {c.riskReason && c.riskLevel !== "green" && (
          <div className="text-[10px] text-muted-foreground mt-0.5 max-w-[140px] truncate">{c.riskReason}</div>
        )}
      </td>
      {/* Last contact */}
      <td className="px-3 py-3 whitespace-nowrap text-xs text-muted-foreground">
        {fmtDate(c.lastMasterMessageAt ?? c.lastAiMessageAt)}
      </td>
      {/* Hours without contact */}
      <td className="px-3 py-3 whitespace-nowrap text-xs">
        <span className={cn(
          "font-medium",
          Number(c.hoursWithoutContact) >= 48 ? "text-red-600" :
          Number(c.hoursWithoutContact) >= 12 ? "text-yellow-600" : "text-muted-foreground"
        )}>
          {fmtHours(c.hoursWithoutContact)}
        </span>
      </td>
      {/* Expected revenue/commission */}
      <td className="px-3 py-3 whitespace-nowrap text-xs">
        {c.expectedRevenue ? (
          <div>
            <div className="text-foreground">{fmtMoney(c.expectedRevenue)}</div>
            {c.expectedCommission && <div className="text-emerald-600">ком. {fmtMoney(c.expectedCommission)}</div>}
          </div>
        ) : <span className="text-muted-foreground/40">—</span>}
      </td>
      {/* Tags */}
      <td className="px-3 py-3 max-w-[160px]">
        <div className="flex flex-wrap gap-1">
          {(c.tags as string[]).map(tag => (
            <span key={tag} className={cn("text-[10px] px-1.5 py-0.5 rounded-full", TAG_COLORS[tag] ?? "bg-slate-100 text-slate-600")}>
              {TAG_LABELS[tag] ?? tag}
            </span>
          ))}
        </div>
      </td>
      {/* Summary */}
      <td className="px-3 py-3 max-w-[220px]">
        {c.summary && (
          <div className="text-[11px] text-muted-foreground bg-white/80 border border-border/30 rounded-lg p-2 leading-relaxed line-clamp-3">
            {c.summary}
          </div>
        )}
      </td>
      {/* Next action */}
      <td className="px-3 py-3 whitespace-nowrap">
        {c.nextAction !== "no_action" && (
          <div>
            <div className="text-xs font-medium text-foreground">{ACTION_LABELS[c.nextAction] ?? c.nextAction}</div>
            {c.nextActionDeadline && <div className="text-[10px] text-muted-foreground">до {fmtDate(c.nextActionDeadline)}</div>}
          </div>
        )}
        {c.nextAction === "no_action" && <span className="text-[11px] text-muted-foreground/60">—</span>}
      </td>
      {/* Actions */}
      <td className="px-3 py-3 pr-4 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onMessage(c)}
            title="Написать мастеру"
            className="p-1.5 rounded-lg hover:bg-white/80 text-primary transition-colors border border-primary/20">
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
          {c.master?.phone && (
            <a href={`tel:${c.master.phone}`} title="Позвонить мастеру"
              className="p-1.5 rounded-lg hover:bg-white/80 text-emerald-600 transition-colors border border-emerald-200">
              <Phone className="w-3.5 h-3.5" />
            </a>
          )}
          <a href={`/leads?tab=work&highlight=${c.orderId}`}
            title="Открыть заказ"
            className="p-1.5 rounded-lg hover:bg-white/80 text-muted-foreground transition-colors border border-border/40">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          {c.isResolved ? (
            <button onClick={() => resolveMutation.mutate("unresolve")} title="Вернуть на пересмотр"
              className="p-1.5 rounded-lg hover:bg-white/80 text-orange-500 transition-colors border border-orange-200">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button onClick={() => resolveMutation.mutate("resolve")} title="Отметить как проверено (12ч)"
              className="p-1.5 rounded-lg hover:bg-white/80 text-muted-foreground transition-colors border border-border/40">
              <CheckCircle className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TABS = [
  { key: "active", label: "Все активные", icon: Brain },
  { key: "critical", label: "Критичные", icon: AlertTriangle },
  { key: "watch", label: "Под наблюдением", icon: Eye },
  { key: "bypass", label: "Риск обхода", icon: Shield },
  { key: "ambiguous", label: "Нужно уточнение", icon: HelpCircle },
  { key: "fomo", label: "Ограниченные", icon: Lock },
  { key: "archive", label: "Архив", icon: Archive },
] as const;

export default function MasterControlPage() {
  const [activeTab, setActiveTab] = useState<string>("active");
  const [page, setPage] = useState(1);
  const [messageCase, setMessageCase] = useState<ChatCase | null>(null);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data, isLoading, isFetching } = useQuery<ApiResponse>({
    queryKey: ["/api/chat-cases", activeTab, page],
    queryFn: () =>
      fetch(`/api/chat-cases?tab=${activeTab}&page=${page}&limit=50`, { credentials: "include" })
        .then(r => r.json()),
    refetchInterval: 30_000,
  });

  const { data: fomoData } = useQuery<Array<{
    masterId: number; alias: string; city: string; type: string; reason: string;
    orderId: number | null; hoursElapsed: number | null;
  }>>({
    queryKey: ["/api/masters/fomo-blocked"],
    queryFn: () => fetch("/api/masters/fomo-blocked", { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30_000,
    enabled: activeTab === "fomo",
  });

  const triggerMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/chat-cases/trigger", { method: "POST", credentials: "include" });
      await new Promise(r => setTimeout(r, 3000));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/chat-cases"] }),
  });

  const stats = data?.stats;
  const cases = data?.cases ?? [];

  const tabBadges: Record<string, number> = {
    active: stats?.total ?? 0,
    critical: stats?.red ?? 0,
    watch: stats?.yellow ?? 0,
    bypass: stats?.bypass ?? 0,
    ambiguous: stats?.ambiguous ?? 0,
    fomo: fomoData?.length ?? 0,
    archive: 0,
  };

  return (
    <Layout>
      <div className="flex flex-col min-h-full bg-background">
        {/* Header */}
        <div className="bg-card border-b border-border/50 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Центр контроля мастеров</h1>
                <p className="text-xs text-muted-foreground">Автоматический анализ коммуникации по активным заказам</p>
              </div>
            </div>
            <button
              onClick={() => triggerMutation.mutate()}
              disabled={triggerMutation.isPending}
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl border border-border/60 hover:bg-slate-50 text-muted-foreground transition-colors disabled:opacity-50">
              <RefreshCw className={cn("w-4 h-4", (triggerMutation.isPending || isFetching) && "animate-spin")} />
              {triggerMutation.isPending ? "Пересчёт..." : "Обновить"}
            </button>
          </div>

          {/* Stats bar */}
          {stats && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard icon="📊" label="Всего активных" value={String(stats.total)} color="text-foreground" />
              <StatCard icon="🟢" label="Норма" value={String(stats.green)} color="text-emerald-600" />
              <StatCard icon="🟡" label="Под наблюдением" value={String(stats.yellow)} color="text-yellow-600" />
              <StatCard icon="🔴" label="Критичных" value={String(stats.red)} color="text-red-600" />
              <StatCard icon="⚠️" label="Риск обхода" value={String(stats.bypass)} color="text-orange-600" />
              <StatCard
                icon="💰"
                label="Зависло денег"
                value={stats.frozenMoney > 0 ? (fmtMoney(stats.frozenMoney) ?? "0₽") : "0₽"}
                color="text-foreground"
              />
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-card border-b border-border/50 px-6">
          <div className="flex gap-0 overflow-x-auto">
            {TABS.map(({ key, label, icon: Icon }) => {
              const badge = tabBadges[key];
              const isActive = activeTab === key;
              return (
                <button
                  key={key}
                  onClick={() => { setActiveTab(key); setPage(1); }}
                  className={cn(
                    "flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border/60"
                  )}>
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  {badge > 0 && (
                    <span className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center",
                      key === "critical" ? "bg-red-100 text-red-700" :
                      key === "bypass" ? "bg-orange-100 text-orange-700" :
                      key === "watch" ? "bg-yellow-100 text-yellow-700" :
                      "bg-slate-100 text-slate-600"
                    )}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 p-6">
          {/* FOMO blocked masters tab */}
          {activeTab === "fomo" ? (
            fomoData == null ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : fomoData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                <Lock className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-lg font-medium">Нет заблокированных мастеров</p>
                <p className="text-sm mt-1">Все мастера могут откликаться на заявки</p>
              </div>
            ) : (
              <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50/80 text-muted-foreground font-medium border-b border-border/50 text-xs">
                      <tr>
                        <th className="px-3 py-3 pl-4">Мастер</th>
                        <th className="px-3 py-3">Город</th>
                        <th className="px-3 py-3">Причина</th>
                        <th className="px-3 py-3">Заказ</th>
                        <th className="px-3 py-3">Просрочка</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fomoData.map(f => (
                        <tr key={f.masterId} className="border-b border-border/30 hover:bg-slate-50/60 transition-colors">
                          <td className="px-3 py-3 pl-4">
                            <button
                              onClick={() => setLocation(`/masters?openMaster=${f.masterId}`)}
                              className="flex items-center gap-2 hover:underline text-left group"
                            >
                              <Lock className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                              <span className="font-medium text-foreground group-hover:text-primary">{f.alias}</span>
                              <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          </td>
                          <td className="px-3 py-3 text-muted-foreground text-xs">{f.city}</td>
                          <td className="px-3 py-3">
                            <span className={cn(
                              "text-xs px-2 py-0.5 rounded-full font-medium",
                              f.type === "no_estimate" ? "bg-yellow-100 text-yellow-700" :
                              f.type === "no_payment" ? "bg-orange-100 text-orange-700" :
                              f.type === "limit_reached" ? "bg-blue-100 text-blue-700" :
                              "bg-red-100 text-red-700"
                            )}>
                              {f.type === "no_estimate" ? "Нет сметы 48ч+" :
                               f.type === "no_payment" ? "Нет оплаты 72ч+" :
                               f.type === "limit_reached" ? "Лимит заказов" :
                               "Задолженность"}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-muted-foreground text-xs">
                            {f.orderId ? `#${f.orderId}` : "—"}
                          </td>
                          <td className="px-3 py-3 text-muted-foreground text-xs">
                            {f.hoursElapsed ? `${f.hoursElapsed} ч` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ) : isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : cases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <Brain className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-lg font-medium">Нет кейсов</p>
              <p className="text-sm mt-1">
                {activeTab === "active" ? "Нет активных заказов с назначенными мастерами" : "По этому фильтру ничего не найдено"}
              </p>
              {activeTab === "active" && (
                <button onClick={() => triggerMutation.mutate()} className="mt-4 flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors">
                  <RefreshCw className="w-4 h-4" /> Запустить расчёт
                </button>
              )}
            </div>
          ) : (
            <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50/80 text-muted-foreground font-medium border-b border-border/50 text-xs">
                    <tr>
                      <th className="px-3 py-3 pl-4">Заказ</th>
                      <th className="px-3 py-3">Мастер</th>
                      <th className="px-3 py-3">Город</th>
                      <th className="px-3 py-3">Вид работ</th>
                      <th className="px-3 py-3">Стадия</th>
                      <th className="px-3 py-3">Риск</th>
                      <th className="px-3 py-3">Последний контакт</th>
                      <th className="px-3 py-3">Без контакта</th>
                      <th className="px-3 py-3">Сумма / Ком.</th>
                      <th className="px-3 py-3">Теги</th>
                      <th className="px-3 py-3">Сводка</th>
                      <th className="px-3 py-3">Следующий шаг</th>
                      <th className="px-3 py-3 pr-4">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.map(c => (
                      <CaseRow key={c.id} c={c} onMessage={setMessageCase} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {(data?.cases.length ?? 0) >= 50 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="text-sm px-3 py-1.5 rounded-lg border border-border/60 disabled:opacity-40 hover:bg-slate-50 transition-colors">
                    ← Назад
                  </button>
                  <span className="text-xs text-muted-foreground">Страница {page}</span>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    className="text-sm px-3 py-1.5 rounded-lg border border-border/60 hover:bg-slate-50 transition-colors">
                    Вперёд →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Message modal */}
      {messageCase && (
        <MessageModal caseItem={messageCase} onClose={() => setMessageCase(null)} />
      )}
    </Layout>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <div className="bg-slate-50/60 border border-border/40 rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <span>{icon}</span>{label}
      </div>
      <div className={cn("text-lg font-bold", color)}>{value}</div>
    </div>
  );
}
