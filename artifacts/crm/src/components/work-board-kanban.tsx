import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Bell, Bot, CheckCircle2, ChevronDown, ChevronRight, Clock,
  Filter, Inbox, MapPin, Radio, RefreshCw, Search, Sparkles, TrendingUp,
  User, Wallet, ArrowLeftCircle, MessageCircle, Phone,
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
  bot?: { action: string; eta: string; tone: BotTone };
  badge?: { text: string; tone: BadgeTone };
  status: string;
  problemReason?: string;
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

// ── Visual constants ─────────────────────────────────────────────────────────

const COLUMN_ACCENT: Record<ColumnKey, string> = {
  new: "border-l-sky-400",
  waiting_master: "border-l-amber-400",
  no_estimate: "border-l-violet-400",
  estimate_unpaid: "border-l-emerald-400",
  estimate_paid: "border-l-green-500",
  commission_left: "border-l-yellow-400",
  closed_24h: "border-l-slate-400",
  problem: "border-l-red-500",
};

const BADGE_TONE: Record<BadgeTone, string> = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warn: "bg-amber-50 text-amber-700 border-amber-200",
  bad: "bg-red-50 text-red-700 border-red-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
};

const BOT_TONE: Record<BotTone, string> = {
  ok: "bg-slate-50 text-slate-600 border-slate-200",
  warn: "bg-amber-50 text-amber-700 border-amber-200",
  bad: "bg-red-50 text-red-700 border-red-200",
};

const fmtMoney = (n: number) => new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";

// ── Mini card ────────────────────────────────────────────────────────────────

function MiniCard({ card, onOpen }: { card: BoardCard; onOpen: (id: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(card.orderId)}
      aria-label={`Заявка #${card.leadId ?? card.orderId} — ${card.title}`}
      className="block w-full text-left bg-white border border-slate-200 rounded-md p-2 text-[11px] leading-tight shadow-sm hover:shadow transition cursor-pointer space-y-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-slate-400">#{card.leadId ?? card.orderId}</span>
        <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
          <Clock className="w-3 h-3" />
          {card.timeInStage}
        </span>
      </div>
      <div className="font-medium text-slate-800 line-clamp-2">{card.title}</div>
      <div className="flex items-center gap-1 text-slate-500">
        <MapPin className="w-3 h-3 shrink-0" />
        <span className="truncate">{card.address}</span>
      </div>
      {card.master && (
        <div className="flex items-center gap-1 text-slate-600">
          <User className="w-3 h-3 shrink-0" />
          <span className="truncate">{card.master}</span>
        </div>
      )}
      {card.money && (
        <div className={
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold " +
          (card.money.kind === "paid" ? "bg-emerald-100 text-emerald-700"
           : card.money.kind === "commission" ? "bg-yellow-100 text-yellow-800"
           : "bg-violet-100 text-violet-700")
        }>
          <Wallet className="w-3 h-3" />
          {card.money.kind === "paid" && "оплачено "}
          {card.money.kind === "commission" && "комиссия "}
          {card.money.kind === "estimate" && "смета "}
          {fmtMoney(card.money.amount)}
        </div>
      )}
      {card.badge && (
        <div className={"inline-flex ml-1 items-center px-1.5 py-0.5 rounded text-[10px] border " + BADGE_TONE[card.badge.tone]}>
          {card.badge.text}
        </div>
      )}
      {card.bot && (
        <div className={"flex items-start gap-1 px-1.5 py-1 rounded border text-[10px] " + BOT_TONE[card.bot.tone]}>
          <Bot className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            <span className="opacity-70">{card.bot.action}</span>{" "}
            <span className="font-semibold">{card.bot.eta}</span>
          </span>
        </div>
      )}
    </button>
  );
}

// ── Desktop column ───────────────────────────────────────────────────────────

function DesktopColumn({ col, onOpen }: { col: BoardColumn; onOpen: (id: number) => void }) {
  const [expanded, setExpanded] = useState(col.key === "problem");
  const visible = expanded ? col.cards : col.cards.slice(0, 2);
  const sum = col.sumPaid ?? col.sumPending;
  return (
    <div className="flex flex-col bg-slate-50 border border-slate-200 rounded-md min-w-[220px] flex-1">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className={"flex items-start gap-1.5 p-2 border-b border-slate-200 border-l-4 " + COLUMN_ACCENT[col.key]}
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 mt-0.5" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 mt-0.5" />}
        <div className="flex-1 text-left">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-800">
            <span>{col.emoji}</span>
            <span>{col.title}</span>
            <span className="ml-auto bg-white border border-slate-200 text-slate-600 rounded px-1 text-[10px]">{col.count}</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">{col.hint}</div>
          {sum !== undefined && sum > 0 && (
            <div className={"text-[10px] mt-0.5 font-mono " + (col.sumPaid !== undefined ? "text-emerald-700" : "text-violet-700")}>
              {fmtMoney(sum)}
            </div>
          )}
          {col.breakdown && (
            <div className="text-[9px] mt-0.5 text-slate-500 leading-tight">{col.breakdown}</div>
          )}
        </div>
      </button>
      <div className="p-1.5 space-y-1.5 overflow-hidden">
        {col.cards.length === 0 ? (
          <div className="text-[10px] text-slate-400 py-3 text-center">пусто</div>
        ) : (
          <>
            {visible.map(c => <MiniCard key={c.id} card={c} onOpen={onOpen} />)}
            {col.cards.length > visible.length && (
              <button
                onClick={() => setExpanded(true)}
                className="w-full text-[10px] text-slate-500 hover:text-slate-700 py-1 border border-dashed border-slate-300 rounded"
              >
                ещё {col.cards.length - visible.length}…
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Mobile card ──────────────────────────────────────────────────────────────

function MobileCard({ card, onOpen, onReturnToPool, returning }: {
  card: BoardCard;
  onOpen: (id: number) => void;
  onReturnToPool: (id: number) => void;
  returning: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const isProblem = !!card.problemReason || card.badge?.tone === "bad";
  return (
    <div className={"bg-white border border-slate-200 rounded-md p-2.5 shadow-sm border-l-4 " + (isProblem ? "border-l-red-500" : "border-l-slate-300")}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[10px] text-slate-400">#{card.leadId ?? card.orderId}</span>
        <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
          <Clock className="w-3 h-3" /> {card.timeInStage}
        </span>
      </div>
      <div className="font-semibold text-slate-900 text-[12px] leading-snug mb-1">{card.title}</div>
      <div className="text-[11px] text-slate-500 flex items-center gap-1 mb-0.5">
        <MapPin className="w-3 h-3 shrink-0" /> {card.address}
      </div>
      <div className="text-[11px] text-slate-500 flex items-center gap-1 mb-1.5">
        <User className="w-3 h-3 shrink-0" /> Мастер: {card.master ?? "—"}
      </div>
      {card.money && (
        <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700 mr-1">
          <Wallet className="w-3 h-3" /> {card.money.kind === "paid" ? "оплачено " : card.money.kind === "commission" ? "комиссия " : "смета "}{fmtMoney(card.money.amount)}
        </div>
      )}
      {card.bot && (
        <div className={"mt-2 flex items-start gap-1 px-2 py-1.5 rounded border text-[11px] " + BOT_TONE[card.bot.tone]}>
          <Bot className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span><span className="opacity-70">{card.bot.action}</span> <span className="font-semibold">{card.bot.eta}</span></span>
        </div>
      )}
      {card.problemReason && (
        <div className="mt-1.5 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          <AlertTriangle className="w-3 h-3 inline mr-1" />{card.problemReason}
        </div>
      )}
      <div className="mt-2 flex gap-1.5">
        <button onClick={() => onOpen(card.orderId)} className="flex-1 bg-slate-900 text-white text-[11px] py-1.5 rounded font-semibold">Открыть</button>
        {confirm ? (
          <>
            <button
              onClick={() => { onReturnToPool(card.orderId); setConfirm(false); }}
              disabled={returning}
              className="bg-amber-500 text-white text-[11px] py-1.5 px-2 rounded font-semibold disabled:opacity-50"
            >Подтвердить</button>
            <button onClick={() => setConfirm(false)} className="bg-slate-200 text-slate-700 text-[11px] py-1.5 px-2 rounded">Отмена</button>
          </>
        ) : (
          <button onClick={() => setConfirm(true)} className="bg-amber-100 text-amber-800 text-[11px] py-1.5 px-2 rounded">↩︎ В пул</button>
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
      cards: col.cards.filter(c =>
        String(c.leadId ?? c.orderId).includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        (c.master ?? "").toLowerCase().includes(q),
      ),
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
    const mobileCards: BoardCard[] = columns.flatMap(c =>
      mobileChip === "all" ? c.cards :
      mobileChip === c.key ? c.cards :
      [],
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
          {mobileCards.map(c => (
            <MobileCard key={c.id} card={c} onOpen={onOpenOrder}
                        onReturnToPool={(id) => returnToPool.mutate(id)}
                        returning={returnToPool.isPending} />
          ))}
        </div>
      </div>
    );
  }

  // ── Desktop view ───────────────────────────────────────────────────────────
  const f = data?.funnel;
  return (
    <div className="space-y-3">
      {/* Funnel header */}
      <div className="bg-card border border-border/50 rounded-2xl p-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 text-[11px]">
        <div>
          <div className="text-muted-foreground">Активных в работе</div>
          <div className="text-2xl font-bold">{f?.activeCount ?? 0}</div>
          <div className="text-[10px] text-muted-foreground">обновлено {updatedAgo}</div>
        </div>
        <div className="border-l border-border/50 pl-3">
          <div className="text-muted-foreground flex items-center gap-1"><Wallet className="w-3 h-3" /> в работе</div>
          <div className="text-xl font-bold text-violet-700">{f ? fmtMoney(f.sumInWork) : "—"}</div>
          <div className="text-[10px] text-muted-foreground">смета без оплаты</div>
        </div>
        <div className="border-l border-border/50 pl-3">
          <div className="text-muted-foreground flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> оплачено</div>
          <div className="text-xl font-bold text-emerald-700">{f ? fmtMoney(f.sumPaid) : "—"}</div>
          <div className="text-[10px] text-muted-foreground">комиссия: {f ? fmtMoney(f.expectedCommission) : "—"} · 5к до 50к / 15% выше</div>
        </div>
        <div className="border-l border-border/50 pl-3">
          <div className="text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" /> доходимость</div>
          <div className="text-xl font-bold">{f?.conversionPct ?? 0}%</div>
          <div className="text-[10px] text-muted-foreground">завершено / в работе</div>
        </div>
        <div className="border-l border-border/50 pl-3">
          <div className="text-muted-foreground flex items-center gap-1"><Bot className="w-3 h-3" /> бот ведёт</div>
          <div className="text-xl font-bold">{(f?.activeCount ?? 0) - (f?.problemCount ?? 0)}</div>
          <div className="text-[10px] text-muted-foreground">авто-сценарии</div>
        </div>
        <div className="border-l border-border/50 pl-3">
          <div className="text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-red-500" /> требуют тебя</div>
          <div className={"text-xl font-bold " + ((f?.problemCount ?? 0) > 0 ? "text-red-600" : "")}>{f?.problemCount ?? 0}</div>
          <div className="text-[10px] text-muted-foreground">в колонке «Проблема»</div>
        </div>
        <div className="border-l border-border/50 pl-3 flex flex-col justify-center gap-1">
          <button onClick={() => refetch()} className="border border-border/50 text-foreground text-[11px] py-1.5 rounded flex items-center justify-center gap-1 hover:bg-slate-100">
            <RefreshCw className={"w-3 h-3 " + (isLoading ? "animate-spin" : "")} /> обновить
          </button>
          <div className="flex items-center justify-center gap-1 text-[10px] text-emerald-700 border border-emerald-200 bg-emerald-50 rounded py-1">
            <Radio className="w-3 h-3" /> live · SSE
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-2 text-[11px]">
        <div className="flex items-center gap-1.5 bg-card border border-border/60 rounded px-2 py-1.5 flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
                 placeholder="Поиск по №, адресу, мастеру, клиенту…"
                 className="bg-transparent outline-none text-[12px] flex-1" />
        </div>
        <span className="text-muted-foreground ml-auto flex items-center gap-1">
          <Inbox className="w-3 h-3" /> обновлено {updatedAgo}
        </span>
      </div>

      {/* Kanban */}
      {isLoading && !data ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Загрузка ленты…</div>
      ) : (
        <div className="flex gap-2 items-start overflow-x-auto pb-4">
          {columns.map(c => <DesktopColumn key={c.key} col={c} onOpen={onOpenOrder} />)}
        </div>
      )}

      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <Bell className="w-3 h-3 text-muted-foreground/70" />
        Карточки сами переезжают между колонками. Возврат в пул — только по подтверждению оператора.
      </div>
    </div>
  );
}
