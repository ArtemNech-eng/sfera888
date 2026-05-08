import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Bell, Bot, CheckCircle2, ChevronRight, Clock,
  Inbox, MapPin, Radio, RefreshCw, Search, TrendingUp,
  User, Wallet,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

// ── Types ────────────────────────────────────────────────────────────────────

type ColumnKey =
  | "new" | "waiting_master" | "no_estimate" | "estimate_unpaid"
  | "estimate_paid" | "commission_left" | "closed_24h" | "problem";

type BotTone = "ok" | "warn" | "bad";
type BadgeTone = "ok" | "warn" | "bad" | "info";

interface BoardCard {
  id: string;
  orderId: number;
  leadId: number | null;
  title: string;
  address: string;
  master: string | null;
  masterId: number | null;
  timeInStage: string;
  ageMs: number;
  money?: { kind: "estimate" | "paid" | "commission"; amount: number; tier?: "fixed" | "percent" };
  commission?: {
    orderTotal: number;
    total: number;
    paid: number;
    left: number;
    tier: "fixed" | "percent";
    prepaymentDeducted?: number;
    totalPartialPaid?: number;
    partialPayments?: { id: number; amount: number; note: string | null; paidAt: string }[];
  };
  bot?: { action: string; eta: string; tone: BotTone };
  badge?: { text: string; tone: BadgeTone };
  status: string;
  problemReason?: string;
  responseCount?: number;
}

interface BoardColumn {
  key: ColumnKey;
  emoji: string;
  title: string;
  hint: string;
  count: number;
  sumPaid?: number;
  sumPending?: number;
  expectedCommission?: number;
  breakdown?: string;
  cards: BoardCard[];
}

interface BoardData {
  funnel: {
    activeCount: number;
    sumInWork: number;
    sumPaid: number;
    expectedCommission: number;
    conversionPct: number;
    problemCount: number;
  };
  columns: BoardColumn[];
  generatedAt: string;
}

// ── Visual constants — matched to voronka.tsx palette ────────────────────────

interface ColumnStyle {
  accent: string;       // top-border + ring color
  headerBg: string;     // soft pastel header background
  badgeBg: string;      // count pill bg
  badgeText: string;    // count pill text
}

const COLUMN_STYLE: Record<ColumnKey, ColumnStyle> = {
  new:             { accent: "#60a5fa", headerBg: "rgba(219,234,254,0.55)", badgeBg: "rgba(59,130,246,0.13)",  badgeText: "#1d4ed8" },
  waiting_master:  { accent: "#fb923c", headerBg: "rgba(255,237,213,0.55)", badgeBg: "rgba(251,146,60,0.13)",  badgeText: "#c2410c" },
  no_estimate:     { accent: "#a78bfa", headerBg: "rgba(237,233,254,0.55)", badgeBg: "rgba(167,139,250,0.13)", badgeText: "#5b21b6" },
  estimate_unpaid: { accent: "#fbbf24", headerBg: "rgba(254,243,199,0.55)", badgeBg: "rgba(251,191,36,0.13)",  badgeText: "#92400e" },
  estimate_paid:   { accent: "#34d399", headerBg: "rgba(209,250,229,0.55)", badgeBg: "rgba(52,211,153,0.13)",  badgeText: "#065f46" },
  commission_left: { accent: "#2dd4bf", headerBg: "rgba(204,251,241,0.55)", badgeBg: "rgba(45,212,191,0.13)",  badgeText: "#0f766e" },
  closed_24h:      { accent: "#94a3b8", headerBg: "rgba(241,245,249,0.55)", badgeBg: "rgba(148,163,184,0.13)", badgeText: "#475569" },
  problem:         { accent: "#f87171", headerBg: "rgba(254,226,226,0.55)", badgeBg: "rgba(248,113,113,0.13)", badgeText: "#b91c1c" },
};

// Columns where return-to-pool action is meaningful (others have an active master / are paid / closed)
const RETURNABLE_COLUMNS: ReadonlySet<ColumnKey> = new Set(["problem", "waiting_master"]);

const BADGE_TONE: Record<BadgeTone, string> = {
  ok:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  warn: "bg-amber-50 text-amber-700 border-amber-200",
  bad:  "bg-red-50 text-red-700 border-red-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
};

const BOT_TONE: Record<BotTone, string> = {
  ok:   "bg-slate-50/80 text-slate-600 border-slate-200",
  warn: "bg-amber-50 text-amber-700 border-amber-200",
  bad:  "bg-red-50 text-red-700 border-red-200",
};

const fmtMoney = (n: number) => new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";

// ── Order card (shared desktop + mobile) ─────────────────────────────────────

function OrderCard({
  card,
  onOpen,
  onReturnToPool,
  returning,
  showReturnButton,
}: {
  card: BoardCard;
  onOpen: (id: number) => void;
  onReturnToPool?: (id: number) => void;
  returning?: boolean;
  showReturnButton?: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const isProblem = !!card.problemReason || card.badge?.tone === "bad";

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-150 hover:-translate-y-px"
      style={{
        background: "rgba(255,255,255,0.85)",
        border: isProblem ? "1px solid rgba(248,113,113,0.45)" : "1px solid rgba(255,255,255,0.95)",
        boxShadow: isProblem
          ? "0 2px 10px rgba(248,113,113,0.10), 0 1px 3px rgba(0,0,0,0.04)"
          : "0 2px 10px rgba(120,80,220,0.06), 0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <button
        type="button"
        onClick={() => onOpen(card.orderId)}
      aria-label={`Заявка #${card.orderId} — ${card.title}`}
        className="block w-full text-left px-3 pt-2.5 pb-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[11px] text-slate-400">#{card.orderId}</span>
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {card.timeInStage}
          </span>
        </div>

        <div className="font-semibold text-[12.5px] text-slate-800 leading-snug line-clamp-2 mb-1.5">
          {card.title}
        </div>

        <div className="flex items-center gap-1 text-[11px] text-slate-500 mb-0.5 leading-tight">
          <MapPin className="w-3 h-3 shrink-0 text-slate-400" />
          <span className="truncate">{card.address}</span>
        </div>

        <div className="flex items-center gap-1 text-[11px] text-slate-600 leading-tight">
          <User className="w-3 h-3 shrink-0 text-slate-400" />
          <span className="truncate">{card.master ?? "не назначен"}</span>
        </div>

        {/* Commission progress block (estimate_paid / commission_left) */}
        {card.commission && (
          <div className="mt-2 rounded-md border border-slate-200 bg-slate-50/70 px-2 py-1.5">
            <div className="flex items-baseline justify-between text-[10.5px] mb-1">
              <span className="text-slate-500">Сумма заказа</span>
              <span className="font-semibold text-slate-700 font-mono">{fmtMoney(card.commission.orderTotal)}</span>
            </div>
            <div className="flex items-baseline justify-between text-[10.5px]">
              <span className="text-slate-500">
                Комиссия <span className="text-slate-400">({card.commission.tier === "fixed" ? "5к фикс" : "15%"})</span>
              </span>
              <span className="font-semibold font-mono">
                <span className={card.commission.left === 0 ? "text-emerald-700" : "text-emerald-700"}>{fmtMoney(card.commission.paid)}</span>
                <span className="text-slate-400"> / {fmtMoney(card.commission.total)}</span>
              </span>
            </div>
            {/* Progress bar */}
            <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div
                className={"h-full rounded-full transition-all " + (card.commission.left === 0 ? "bg-emerald-500" : "bg-amber-400")}
                style={{ width: `${card.commission.total > 0 ? Math.min(100, Math.round((card.commission.paid / card.commission.total) * 100)) : 0}%` }}
              />
            </div>
            {/* Breakdown: prepayment + partials */}
            {card.commission.prepaymentDeducted != null && card.commission.prepaymentDeducted > 0 && (
              <div className="mt-1 text-[10px] text-blue-700 flex items-center justify-between">
                <span>Бронь по смете</span>
                <span className="font-mono">−{fmtMoney(card.commission.prepaymentDeducted)}</span>
              </div>
            )}
            {card.commission.totalPartialPaid != null && card.commission.totalPartialPaid > 0 && (
              <div className="mt-0.5 text-[10px] text-violet-700 flex items-center justify-between">
                <span>Оплачено мастером {card.commission.partialPayments && card.commission.partialPayments.length > 1 && <span className="text-violet-500">({card.commission.partialPayments.length} пл.)</span>}</span>
                <span className="font-mono">−{fmtMoney(card.commission.totalPartialPaid)}</span>
              </div>
            )}
            {card.commission.left > 0 ? (
              <div className="mt-1 text-[10px] text-amber-700 border-t border-slate-200 pt-1">
                остаток: <span className="font-semibold font-mono">{fmtMoney(card.commission.left)}</span>
              </div>
            ) : (
              <div className="mt-1 text-[10px] text-emerald-700 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> комиссия оплачена
              </div>
            )}
          </div>
        )}

        <div className="flex items-center flex-wrap gap-1 mt-2">
          {/* Plain money badge — only when no detailed commission block is shown */}
          {!card.commission && card.money && (
            <span className={
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold " +
              (card.money.kind === "paid" ? "bg-emerald-100 text-emerald-700"
               : card.money.kind === "commission" ? "bg-yellow-100 text-yellow-800"
               : "bg-violet-100 text-violet-700")
            }>
              <Wallet className="w-3 h-3" />
              {card.money.kind === "paid" && "оплачено "}
              {card.money.kind === "commission" && "комиссия "}
              {card.money.kind === "estimate" && "смета "}
              {fmtMoney(card.money.amount)}
            </span>
          )}
          {card.badge && (
            <span className={"inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] border " + BADGE_TONE[card.badge.tone]}>
              {card.badge.text}
            </span>
          )}
        </div>

        {card.bot && (
          <div className={"mt-2 flex items-start gap-1.5 px-2 py-1.5 rounded-md border text-[10.5px] " + BOT_TONE[card.bot.tone]}>
            <Bot className="w-3 h-3 mt-0.5 shrink-0" />
            <span className="leading-tight">
              <span className="opacity-70">{card.bot.action}</span>{" "}
              <span className="font-semibold">{card.bot.eta}</span>
            </span>
          </div>
        )}

        {card.problemReason && (
          <div className="mt-2 text-[10.5px] text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1.5 leading-tight">
            <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />
            {card.problemReason}
          </div>
        )}
      </button>

      {showReturnButton && onReturnToPool && (
        <div className="px-3 pb-2.5 -mt-0.5">
          {confirm ? (
            <div className="flex gap-1.5">
              <button
                onClick={() => { onReturnToPool(card.orderId); setConfirm(false); }}
                disabled={returning}
                className="flex-1 bg-amber-500 text-white text-[11px] py-1.5 rounded-md font-semibold disabled:opacity-50 hover:bg-amber-600 transition-colors"
              >Подтвердить</button>
              <button
                onClick={() => setConfirm(false)}
                className="bg-slate-100 text-slate-600 text-[11px] py-1.5 px-2.5 rounded-md hover:bg-slate-200 transition-colors"
              >Отмена</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirm(true)}
              className="w-full bg-amber-50 text-amber-700 text-[11px] py-1.5 rounded-md font-medium hover:bg-amber-100 transition-colors"
            >↩︎ Вернуть в пул</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Desktop column — voronka-style glass card ────────────────────────────────

function DesktopColumn({
  col,
  onOpen,
  onReturnToPool,
  returning,
}: {
  col: BoardColumn;
  onOpen: (id: number) => void;
  onReturnToPool: (id: number) => void;
  returning: boolean;
}) {
  const s = COLUMN_STYLE[col.key];
  const sum = col.sumPaid ?? col.sumPending;
  const sumColor = col.sumPaid !== undefined ? "text-emerald-700" : col.sumPending !== undefined ? "text-violet-700" : "text-slate-500";

  return (
    <div
      className="flex-shrink-0 w-[260px] flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.60)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        border: "1px solid rgba(255,255,255,0.82)",
        boxShadow: "0 4px 20px rgba(120,80,220,0.07), 0 1px 3px rgba(0,0,0,0.04)",
        borderTop: `2px solid ${s.accent}`,
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2.5"
        style={{
          background: s.headerBg,
          borderBottom: "1px solid rgba(0,0,0,0.04)",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[14px] leading-none">{col.emoji}</span>
            <span className="font-semibold text-[13px] text-slate-700 truncate">{col.title}</span>
          </div>
          <span
            className="text-[11px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1.5 flex-shrink-0"
            style={{ background: s.badgeBg, color: s.badgeText }}
          >
            {col.count}
          </span>
        </div>
        <div className="text-[10.5px] text-slate-500 mt-0.5 leading-tight">{col.hint}</div>
        {sum !== undefined && sum > 0 && (
          <div className={"text-[11px] mt-1 font-semibold font-mono " + sumColor}>{fmtMoney(sum)}</div>
        )}
        {col.breakdown && (
          <div className="text-[10px] mt-0.5 text-slate-500 leading-tight">{col.breakdown}</div>
        )}
      </div>

      {/* Cards (scrollable, no forced collapse) */}
      <div
        className="voronka-scroll flex-1 overflow-y-auto p-2 space-y-2"
        style={{ maxHeight: "calc(100vh - 280px)", minHeight: "120px" }}
      >
        {col.cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-300">
            <Inbox className="w-5 h-5 mb-1" />
            <p className="text-[11px]">Пусто</p>
          </div>
        ) : (
          col.cards.map(c => (
            <OrderCard
              key={c.id}
              card={c}
              onOpen={onOpen}
              onReturnToPool={onReturnToPool}
              returning={returning}
              showReturnButton={col.key === "problem" || col.key === "waiting_master"}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function WorkBoardKanban({ onOpenOrder }: { onOpenOrder: (orderId: number) => void }) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [mobileChip, setMobileChip] = useState<ColumnKey | "all">("problem");

  const { data, isLoading, refetch, dataUpdatedAt } = useQuery<BoardData>({
    queryKey: ["/api/work-board"],
    queryFn: async () => {
      const r = await fetch("/api/work-board", { credentials: "include" });
      if (!r.ok) throw new Error("Не удалось загрузить ленту");
      return r.json();
    },
    refetchInterval: 15_000,
  });

  // SSE — invalidate on tick/changed events for true live updates
  useEffect(() => {
    const es = new EventSource("/api/work-board/stream", { withCredentials: true });
    const onAny = () => queryClient.invalidateQueries({ queryKey: ["/api/work-board"] });
    es.addEventListener("tick", onAny);
    es.addEventListener("changed", onAny);
    es.onerror = () => { /* auto-reconnect by browser */ };
    return () => es.close();
  }, [queryClient]);

  const returnToPool = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/work-board/return-to-pool/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ confirmed: true }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Ошибка");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Заявка возвращена в пул" });
      queryClient.invalidateQueries({ queryKey: ["/api/work-board"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: (e: any) => toast({ title: "Не удалось вернуть", description: String(e?.message ?? e), variant: "destructive" }),
  });

  // Filter cards by search
  const columns = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.columns;
    return data.columns.map(col => ({
      ...col,
      cards: col.cards.filter(c => {
        // Если запрос — чистое число, ищем точное совпадение по orderId
        const isNumeric = /^\d+$/.test(q);
        if (isNumeric) return String(c.orderId) === q;
        return (
          String(c.orderId).includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.address.toLowerCase().includes(q) ||
          (c.master ?? "").toLowerCase().includes(q)
        );
      }),
    }));
  }, [data, search]);

  const updatedAgo = useMemo(() => {
    if (!dataUpdatedAt) return "—";
    const sec = Math.max(0, Math.round((Date.now() - dataUpdatedAt) / 1000));
    if (sec < 60) return `${sec}с назад`;
    return `${Math.floor(sec / 60)}м назад`;
  }, [dataUpdatedAt]);

  // ── Mobile view ────────────────────────────────────────────────────────────
  if (isMobile) {
    // Tag each card with its source column so the return-to-pool button only
    // appears where it makes sense (problem / waiting_master).
    const mobileCards: Array<{ card: BoardCard; columnKey: ColumnKey }> = columns.flatMap(c =>
      mobileChip === "all" || mobileChip === c.key
        ? c.cards.map(card => ({ card, columnKey: c.key }))
        : [],
    );
    const totalActive = data?.funnel.activeCount ?? 0;
    return (
      <div className="space-y-3">
        {/* Funnel mini */}
        <div className="bg-card border border-border/50 rounded-2xl p-3 grid grid-cols-3 gap-1 text-center">
          <div>
            <div className="text-xl font-bold">{totalActive}</div>
            <div className="text-[10px] text-muted-foreground">активных</div>
          </div>
          <div className="border-l border-border/50">
            <div className="text-xl font-bold text-emerald-700">{data ? fmtMoney(data.funnel.sumPaid) : "—"}</div>
            <div className="text-[10px] text-muted-foreground">оплачено</div>
          </div>
          <div className="border-l border-border/50">
            <div className="text-xl font-bold">{data?.funnel.conversionPct ?? 0}%</div>
            <div className="text-[10px] text-muted-foreground">доходимость</div>
          </div>
        </div>

        {/* Problem alert */}
        {(data?.funnel.problemCount ?? 0) > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex items-center gap-2"
               onClick={() => setMobileChip("problem")}>
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <div className="text-[12px] text-red-700 flex-1">
              <span className="font-semibold">{data!.funnel.problemCount} заявок ждут тебя</span> — остальное бот ведёт сам
            </div>
            <ChevronRight className="w-4 h-4 text-red-500" />
          </div>
        )}

        {/* Chips */}
        <div className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1">
          {(data?.columns ?? []).map(c => {
            const active = mobileChip === c.key;
            const isProb = c.key === "problem";
            return (
              <button
                key={c.key}
                onClick={() => setMobileChip(c.key)}
                className={
                  "shrink-0 px-2.5 py-1.5 rounded-full text-[11px] border whitespace-nowrap " +
                  (active && isProb ? "bg-red-600 text-white border-red-600"
                   : active ? "bg-slate-900 text-white border-slate-900"
                   : "bg-card text-foreground border-border/60")
                }
              >
                {c.emoji} {c.title} <span className="opacity-70">· {c.count}</span>
              </button>
            );
          })}
          <button
            onClick={() => setMobileChip("all")}
            className={
              "shrink-0 px-2.5 py-1.5 rounded-full text-[11px] border whitespace-nowrap " +
              (mobileChip === "all" ? "bg-slate-900 text-white border-slate-900" : "bg-card text-foreground border-border/60")
            }
          >Все · {totalActive}</button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
                 placeholder="Поиск по №, адресу, мастеру…"
                 className="w-full pl-9 pr-3 py-2 text-sm bg-card border border-border/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>

        {/* Cards list */}
        <div className="space-y-2">
          <div className="text-[11px] uppercase text-muted-foreground font-semibold tracking-wide pt-1">
            {mobileChip === "all" ? "Все · " + mobileCards.length : (data?.columns.find(c => c.key === mobileChip)?.title + " · " + mobileCards.length)}
          </div>
          {isLoading && <div className="text-center py-6 text-muted-foreground text-sm">Загрузка…</div>}
          {!isLoading && mobileCards.length === 0 && (
            <div className="text-center py-6 text-muted-foreground text-sm">Заявок нет</div>
          )}
          {mobileCards.map(({ card, columnKey }) => (
            <OrderCard
              key={card.id}
              card={card}
              onOpen={onOpenOrder}
              onReturnToPool={(id) => returnToPool.mutate(id)}
              returning={returnToPool.isPending}
              showReturnButton={RETURNABLE_COLUMNS.has(columnKey)}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Desktop view — voronka-style funnel header + glass kanban ─────────────
  const f = data?.funnel;
  return (
    <div className="space-y-3">
      {/* Funnel header — softer, glass-like */}
      <div
        className="rounded-2xl p-4"
        style={{
          background: "rgba(255,255,255,0.70)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          border: "1px solid rgba(255,255,255,0.95)",
          boxShadow: "0 4px 20px rgba(120,80,220,0.07), 0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wide font-medium">Активных в работе</div>
            <div className="text-2xl font-bold text-slate-800 mt-0.5">{f?.activeCount ?? 0}</div>
            <div className="text-[10.5px] text-slate-400 mt-0.5">обновлено {updatedAgo}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wide font-medium flex items-center gap-1">
              <Wallet className="w-3 h-3" /> в работе
            </div>
            <div className="text-xl font-bold text-violet-700 mt-0.5">{f ? fmtMoney(f.sumInWork) : "—"}</div>
            <div className="text-[10.5px] text-slate-400 mt-0.5">смета без оплаты</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wide font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" /> оплачено
            </div>
            <div className="text-xl font-bold text-emerald-700 mt-0.5">{f ? fmtMoney(f.sumPaid) : "—"}</div>
            <div className="text-[10.5px] text-slate-400 mt-0.5">
              комиссия: {f ? fmtMoney(f.expectedCommission) : "—"} · 5к до 50к / 15% выше
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wide font-medium flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> доходимость
            </div>
            <div className="text-xl font-bold text-slate-800 mt-0.5">{f?.conversionPct ?? 0}%</div>
            <div className="text-[10.5px] text-slate-400 mt-0.5">завершено / в работе</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wide font-medium flex items-center gap-1">
              <AlertTriangle className={"w-3 h-3 " + ((f?.problemCount ?? 0) > 0 ? "text-red-500" : "text-slate-400")} />
              требуют тебя
            </div>
            <div className={"text-xl font-bold mt-0.5 " + ((f?.problemCount ?? 0) > 0 ? "text-red-600" : "text-slate-800")}>
              {f?.problemCount ?? 0}
            </div>
            <div className="text-[10.5px] text-slate-400 mt-0.5">в колонке «Проблема»</div>
          </div>
          <div className="flex flex-col justify-center gap-1.5">
            <button
              onClick={() => refetch()}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-[12px] font-medium hover:bg-slate-50 transition-colors shadow-sm"
            >
              <RefreshCw className={"w-3.5 h-3.5 " + (isLoading ? "animate-spin" : "")} /> обновить
            </button>
            <div className="flex items-center justify-center gap-1 text-[10.5px] text-emerald-700 border border-emerald-200 bg-emerald-50/80 rounded-lg py-1">
              <Radio className="w-3 h-3" /> live · SSE
            </div>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2 flex-1 max-w-md shadow-sm">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по №, адресу, мастеру, клиенту…"
            className="bg-transparent outline-none text-[13px] flex-1 placeholder:text-slate-400"
          />
        </div>
        <span className="text-slate-400 text-[11px] ml-auto flex items-center gap-1">
          <Inbox className="w-3 h-3" /> обновлено {updatedAgo}
        </span>
      </div>

      {/* Kanban */}
      {isLoading && !data ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="voronka-scroll flex gap-4 overflow-x-auto pb-4 min-h-0">
          {columns.map(c => (
            <DesktopColumn
              key={c.key}
              col={c}
              onOpen={onOpenOrder}
              onReturnToPool={(id) => returnToPool.mutate(id)}
              returning={returnToPool.isPending}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-[10.5px] text-slate-400">
        <Bell className="w-3 h-3 text-slate-400/70" />
        Карточки сами переезжают между колонками. Возврат в пул — только по подтверждению оператора.
      </div>
    </div>
  );
}
