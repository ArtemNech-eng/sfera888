import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { format, formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  User, MapPin, Phone, Zap, TrendingUp, Wallet, History,
  Activity, Star, Clock, CheckCircle2, XCircle, BarChart3,
  ArrowUpRight, Coins, ShoppingCart, ReceiptText, Calendar,
  Loader2, AlertTriangle, RefreshCw, Gift, X, Package,
  FileSignature, ShieldCheck, ShieldAlert, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TokenMasterDetail {
  id: number;
  alias: string;
  city: string;
  specialization: string;
  specializations: string[];
  phone: string | null;
  status: string;
  rating: number;
  avgResponseTime: number | null;
  lastSeenAt: string | null;
  avatarUrl: string | null;
  createdAt: string;
  contractSignedAt: string | null;
  passportVerified: boolean;
  telegramId: string | null;
  pwaLogin: string | null;
  tags: string[];
  wallet: {
    tokensBalance: number;
    totalTokensPurchased: number;
    totalTokensSpent: number;
    totalTokensRefunded: number;
    totalRubSpent: number;
    creditLimitTokens: number;
  } | null;
  stats: {
    totalRevenue: number;
    avgRevenue: number;
    tokenOrdersTotal: number;
    tokenOrdersCompleted: number;
    tokenOrdersCancelled: number;
    conversion: number | null;
    roi: number | null;
  };
  transactions: {
    id: number;
    type: string;
    tokensAmount: number;
    rubAmount: number | null;
    packageName: string | null;
    orderId: number | null;
    reason: string | null;
    createdBy: string;
    status: string;
    createdAt: string;
  }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  active:           { label: "Активен",          cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  suspended:        { label: "Приостановлен",    cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  inactive:         { label: "Неактивен",         cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  pending_contract: { label: "Ожидает договора", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
};

const TX_TYPE_LABELS: Record<string, { label: string; sign: string; cls: string }> = {
  purchase: { label: "Покупка",   sign: "+", cls: "text-green-600 dark:text-green-400" },
  spend:    { label: "Списание",  sign: "−", cls: "text-red-500 dark:text-red-400" },
  refund:   { label: "Возврат",   sign: "+", cls: "text-blue-600 dark:text-blue-400" },
  credit:   { label: "Кредит",    sign: "+", cls: "text-purple-600 dark:text-purple-400" },
  debit:    { label: "Списание",  sign: "−", cls: "text-orange-600 dark:text-orange-400" },
};

function fmt(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("ru-RU");
}
function fmtDate(s: string) { return format(new Date(s), "d MMM yyyy", { locale: ru }); }
function fmtRelative(s: string) { return formatDistanceToNow(new Date(s), { addSuffix: true, locale: ru }); }

function Avatar({ url, alias }: { url: string | null; alias: string }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt={alias}
        className="w-14 h-14 rounded-full object-cover shrink-0"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
      <span className="text-white font-bold text-xl">{alias[0]?.toUpperCase()}</span>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = "default" }: {
  icon: any; label: string; value: string | number; sub?: string; color?: "green" | "red" | "blue" | "purple" | "default";
}) {
  const colors = {
    green:   "from-green-50 to-emerald-50 border-green-100 dark:from-green-900/20 dark:to-emerald-900/20 dark:border-green-800/30",
    red:     "from-red-50 to-rose-50 border-red-100 dark:from-red-900/20 dark:to-rose-900/20 dark:border-red-800/30",
    blue:    "from-blue-50 to-indigo-50 border-blue-100 dark:from-blue-900/20 dark:to-indigo-900/20 dark:border-blue-800/30",
    purple:  "from-purple-50 to-violet-50 border-purple-100 dark:from-purple-900/20 dark:to-violet-900/20 dark:border-purple-800/30",
    default: "from-gray-50 to-slate-50 border-gray-100 dark:from-gray-800/40 dark:to-slate-800/40 dark:border-gray-700/40",
  };
  const iconColors = {
    green: "text-green-600 dark:text-green-400",
    red:   "text-red-500 dark:text-red-400",
    blue:  "text-blue-600 dark:text-blue-400",
    purple:"text-purple-600 dark:text-purple-400",
    default:"text-gray-500 dark:text-gray-400",
  };
  return (
    <div className={cn("rounded-xl border bg-gradient-to-br p-3 flex flex-col gap-1", colors[color])}>
      <div className="flex items-center gap-1.5">
        <Icon className={cn("w-3.5 h-3.5", iconColors[color])} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-lg font-bold leading-none">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function OverviewTab({ m, masterId }: { m: TokenMasterDetail; masterId: number }) {
  const statusInfo = STATUS_LABELS[m.status] ?? { label: m.status, cls: "bg-gray-100 text-gray-600" };
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [verifyingPassport, setVerifyingPassport] = useState(false);
  const [markingExternal, setMarkingExternal] = useState(false);

  const handleVerifyPassport = async () => {
    setVerifyingPassport(true);
    try {
      const r = await fetch(`/api/masters/${masterId}/verify-passport`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified: true }),
      });
      if (r.ok) {
        toast.success("Паспорт подтверждён — токены в долг теперь доступны");
        queryClient.invalidateQueries({ queryKey: ["/api/token-masters", masterId] });
      } else {
        const d = await r.json();
        toast.error(d.error ?? "Ошибка подтверждения");
      }
    } catch { toast.error("Ошибка сети"); }
    finally { setVerifyingPassport(false); }
  };

  const handleMarkExternal = async (source: "okidoki" | "paper") => {
    setMarkingExternal(true);
    try {
      const r = await fetch(`/api/masters/${masterId}/mark-contract-external`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      if (r.ok) {
        toast.success("Договор отмечён — мастер активирован");
        queryClient.invalidateQueries({ queryKey: ["/api/token-masters", masterId] });
      } else {
        const d = await r.json();
        toast.error(d.error ?? "Ошибка");
      }
    } catch { toast.error("Ошибка сети"); }
    finally { setMarkingExternal(false); }
  };

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="flex items-start gap-4">
        <Avatar url={m.avatarUrl} alias={m.alias} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-lg leading-tight">{m.alias}</h3>
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", statusInfo.cls)}>{statusInfo.label}</span>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span>{m.city}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{m.specialization}</p>
        </div>
      </div>

      {/* Stars */}
      <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-4 py-3 border border-amber-100 dark:border-amber-800/30">
        <Star className="w-5 h-5 text-amber-500 fill-amber-400" />
        <span className="font-bold text-amber-700 dark:text-amber-400 text-lg">{m.rating.toFixed(1)}</span>
        <span className="text-sm text-muted-foreground ml-auto">Рейтинг</span>
      </div>

      {/* Contact info */}
      <div className="space-y-2">
        {m.phone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>{m.phone}</span>
          </div>
        )}
        {m.telegramId && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground w-4 h-4 shrink-0 flex items-center justify-center text-xs font-bold">TG</span>
            <span className="font-mono text-xs">{m.telegramId}</span>
          </div>
        )}
        {m.pwaLogin && (
          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-xs font-mono text-muted-foreground">PWA: {m.pwaLogin}</span>
          </div>
        )}
      </div>

      {/* Tags */}
      {m.tags && m.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {m.tags.map(t => (
            <span key={t} className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{t}</span>
          ))}
        </div>
      )}

      {/* Contract block */}
      <div className={`rounded-xl border p-3 space-y-2 ${
        m.contractSignedAt && m.passportVerified
          ? "border-green-200 bg-green-50 dark:border-green-800/30 dark:bg-green-900/10"
          : m.contractSignedAt
          ? "border-amber-200 bg-amber-50 dark:border-amber-800/30 dark:bg-amber-900/10"
          : "border-gray-200 bg-gray-50 dark:border-gray-700/40 dark:bg-gray-800/20"
      }`}>
        <div className="flex items-center gap-2">
          <FileSignature className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">Договор</span>
          {m.contractSignedAt && m.passportVerified ? (
            <span className="ml-auto text-xs text-green-700 dark:text-green-400 flex items-center gap-1 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" /> Подтверждён
            </span>
          ) : m.contractSignedAt ? (
            <span className="ml-auto text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1 font-semibold">
              <ShieldAlert className="w-3.5 h-3.5" /> Ожидает проверки
            </span>
          ) : (
            <span className="ml-auto text-xs text-muted-foreground">Не подписан</span>
          )}
        </div>
        {m.contractSignedAt && (
          <p className="text-xs text-muted-foreground">Подписан: {fmtDate(m.contractSignedAt)}</p>
        )}
        {user?.role === "admin" && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {m.contractSignedAt && (
              <a
                href={`/api/contract/view/${m.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 hover:bg-violet-200 font-semibold px-2.5 py-1 rounded-lg transition-colors"
              >
                <ExternalLink className="w-3 h-3" /> Открыть договор
              </a>
            )}
            {m.contractSignedAt && !m.passportVerified && (
              <button
                onClick={handleVerifyPassport}
                disabled={verifyingPassport}
                className="inline-flex items-center gap-1 text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
              >
                {verifyingPassport ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                Подтвердить
              </button>
            )}
            {!m.contractSignedAt && (
              <>
                <button
                  onClick={() => handleMarkExternal("okidoki")}
                  disabled={markingExternal}
                  className="inline-flex items-center gap-1 text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 hover:bg-violet-200 font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                >
                  {markingExternal ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  ОкиДоки
                </button>
                <button
                  onClick={() => handleMarkExternal("paper")}
                  disabled={markingExternal}
                  className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700/40 text-gray-600 dark:text-gray-400 hover:bg-gray-200 font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                >
                  Бумажный
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Dates */}
      <div className="space-y-1 text-sm text-muted-foreground border-t pt-3">
        <div className="flex justify-between">
          <span>Зарегистрирован</span>
          <span className="text-foreground">{fmtDate(m.createdAt)}</span>
        </div>
        {m.lastSeenAt && (
          <div className="flex justify-between">
            <span>Последняя активность</span>
            <span className="text-foreground">{fmtRelative(m.lastSeenAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function EfficiencyTab({ m }: { m: TokenMasterDetail }) {
  const { stats } = m;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={CheckCircle2} label="Завершено (токен)" value={fmt(stats.tokenOrdersCompleted)} color="green" />
        <StatCard icon={XCircle} label="Отменено" value={fmt(stats.tokenOrdersCancelled)} color="red" />
        <StatCard
          icon={TrendingUp}
          label="Конверсия"
          value={stats.conversion != null ? `${stats.conversion}%` : "—"}
          sub={`из ${fmt(stats.tokenOrdersTotal)} токен-заказов`}
          color="blue"
        />
        <StatCard
          icon={Clock}
          label="Скорость ответа"
          value={m.avgResponseTime != null ? `${Math.round(m.avgResponseTime)} мин` : "—"}
          color="default"
        />
      </div>

      {/* ROI Block */}
      <div className="rounded-xl border bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 border-violet-100 dark:border-violet-800/30 p-4">
        <div className="flex items-center gap-2 mb-3">
          <ArrowUpRight className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          <span className="font-semibold text-sm">ROI — окупаемость токенов</span>
        </div>
        <div className="flex items-end gap-2">
          <span className="text-3xl font-bold text-violet-700 dark:text-violet-300">
            {stats.roi != null ? `${stats.roi}x` : "—"}
          </span>
          {stats.roi != null && (
            <span className="text-sm text-muted-foreground mb-1">
              на каждый ₽ вложенный в токены
            </span>
          )}
        </div>
        {stats.roi == null && (
          <p className="text-xs text-muted-foreground mt-1">
            Данных о выручке пока нет — мастер не указывал сумму при завершении заказов
          </p>
        )}
      </div>

      {/* Avg revenue */}
      {stats.avgRevenue > 0 && (
        <div className="rounded-xl bg-muted/50 p-3 flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Средний чек (по заявленным)</span>
          <span className="font-semibold">{fmt(stats.avgRevenue)} ₽</span>
        </div>
      )}
    </div>
  );
}

function FinanceTab({ m, masterId }: { m: TokenMasterDetail; masterId: number }) {
  const { wallet, stats } = m;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCreditForm, setShowCreditForm] = useState(false);
  const [creditTokens, setCreditTokens] = useState("1");
  const [creditReason, setCreditReason] = useState("Тестовый заказ");
  const [creditLoading, setCreditLoading] = useState(false);
  const [showLimitForm, setShowLimitForm] = useState(false);
  const [limitValue, setLimitValue] = useState("");
  const [limitLoading, setLimitLoading] = useState(false);

  // Test package form
  const [showTestForm, setShowTestForm] = useState(false);
  const [testTokens, setTestTokens] = useState("1");
  const [testDays, setTestDays] = useState("7");
  const [testLoading, setTestLoading] = useState(false);

  const handleCreateTestPackage = async () => {
    const n = Number(testTokens);
    if (!n || n < 1) { toast.error("Токены должны быть ≥ 1"); return; }
    setTestLoading(true);
    try {
      const r = await fetch(`/api/wallet/${masterId}/bonus`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens: n, reason: "Тестовое начисление" }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error ?? "Ошибка начисления");
      } else {
        toast.success(`Начислено ${n} ток. на баланс`);
        queryClient.invalidateQueries({ queryKey: ["/api/token-masters", masterId] });
        setShowTestForm(false);
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setTestLoading(false);
    }
  };

  const handleCredit = async () => {
    const n = Number(creditTokens);
    if (!n || n < 1 || n > 10) { toast.error("От 1 до 10 токенов"); return; }
    if (!creditReason.trim()) { toast.error("Укажите причину"); return; }
    setCreditLoading(true);
    try {
      const r = await fetch(`/api/wallet/${masterId}/credit`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens: n, reason: creditReason }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error ?? "Ошибка выдачи токенов");
      } else {
        toast.success(`Выдан кредитный лимит ${n} ток.`);
        queryClient.invalidateQueries({ queryKey: ["/api/token-masters", masterId] });
        setShowCreditForm(false);
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setCreditLoading(false);
    }
  };

  const handleSetLimit = async () => {
    const n = Number(limitValue);
    if (isNaN(n) || n < 0) { toast.error("Лимит должен быть неотрицательным числом"); return; }
    setLimitLoading(true);
    try {
      const r = await fetch(`/api/wallet/${masterId}/set-credit-limit`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credit_limit: n }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error ?? "Ошибка");
      } else {
        toast.success(`Кредитный лимит установлен: ${n} т.`);
        queryClient.invalidateQueries({ queryKey: ["/api/token-masters", masterId] });
        setShowLimitForm(false);
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setLimitLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Credit token button — admin only */}
      {user?.role === "admin" && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-900/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Gift className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Выдать кредитный лимит</span>
            </div>
            {!m.contractSignedAt && (
              <span className="text-xs text-red-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Договор не подписан
              </span>
            )}
            {m.contractSignedAt && !m.passportVerified && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" /> Не подтверждён
              </span>
            )}
            {m.contractSignedAt && m.passportVerified && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Подтверждён
              </span>
            )}
          </div>
          {!showCreditForm ? (
            <button
              onClick={() => setShowCreditForm(true)}
              className="w-full h-8 text-xs font-semibold rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors flex items-center justify-center gap-1.5"
            >
              <Gift className="w-3.5 h-3.5" /> Выдать кредитный лимит
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">Токены (1–10)</label>
                  <input
                    type="number" min={1} max={10} step={1}
                    className="mt-0.5 w-full h-8 border rounded-lg px-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-300"
                    value={creditTokens}
                    onChange={e => setCreditTokens(e.target.value)}
                  />
                </div>
                <div className="flex-[2]">
                  <label className="text-xs text-muted-foreground">Причина</label>
                  <input
                    className="mt-0.5 w-full h-8 border rounded-lg px-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-300"
                    value={creditReason}
                    onChange={e => setCreditReason(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCredit}
                  disabled={creditLoading}
                  className="flex-1 h-8 text-xs font-semibold rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
                >
                  {creditLoading ? "Выдаю…" : "Подтвердить"}
                </button>
                <button
                  onClick={() => setShowCreditForm(false)}
                  className="h-8 w-8 rounded-lg border flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Set credit limit — admin only */}
      {user?.role === "admin" && (
        <div className="rounded-xl border border-violet-200 dark:border-violet-800/40 bg-violet-50 dark:bg-violet-900/20 p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            <span className="text-sm font-medium text-violet-700 dark:text-violet-300">Кредитный лимит (допустимый минус)</span>
          </div>
          {!showLimitForm ? (
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{wallet?.creditLimitTokens ?? 0} т.</span>
              <button
                onClick={() => { setLimitValue(String(wallet?.creditLimitTokens ?? 0)); setShowLimitForm(true); }}
                className="h-8 px-3 text-xs font-semibold rounded-lg bg-violet-500 text-white hover:bg-violet-600 transition-colors"
              >
                Изменить
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="number" min={0} step={1}
                className="w-full h-8 border rounded-lg px-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-violet-300"
                value={limitValue}
                onChange={e => setLimitValue(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSetLimit}
                  disabled={limitLoading}
                  className="flex-1 h-8 text-xs font-semibold rounded-lg bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50 transition-colors"
                >
                  {limitLoading ? "Сохраняю…" : "Сохранить"}
                </button>
                <button
                  onClick={() => setShowLimitForm(false)}
                  className="h-8 w-8 rounded-lg border flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Token balance */}
      <div className={cn(
        "rounded-xl p-4 border",
        wallet && wallet.tokensBalance > 0
          ? "bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-100 dark:from-emerald-900/20 dark:to-green-900/20 dark:border-emerald-800/30"
          : "bg-gradient-to-br from-red-50 to-rose-50 border-red-100 dark:from-red-900/20 dark:to-rose-900/20 dark:border-red-800/30"
      )}>
        <div className="flex items-center gap-2 mb-2">
          <Zap className={cn("w-5 h-5", wallet && wallet.tokensBalance > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")} />
          <span className="text-sm font-medium">Баланс токенов</span>
        </div>
        <p className={cn("text-4xl font-bold", wallet && wallet.tokensBalance > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-400")}>
          {wallet ? fmt(wallet.tokensBalance) : "0"}
        </p>
        {wallet && (
          <div className="mt-2 space-y-1">
            {wallet.creditLimitTokens > 0 && (
              <p className="text-xs text-blue-600">Кредитный лимит: +{wallet.creditLimitTokens} т.</p>
            )}
            <p className="text-xs text-emerald-600">Доступно: {wallet.tokensBalance + wallet.creditLimitTokens} т.</p>
            {wallet.tokensBalance < 0 && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Кредитный долг: {Math.abs(wallet.tokensBalance)} ток.
              </p>
            )}
            {wallet.tokensBalance === 0 && (
              <p className="text-xs text-amber-500 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Токены закончились
              </p>
            )}
          </div>
        )}
      </div>

      {/* Token stats */}
      {wallet && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={ShoppingCart} label="Куплено токенов" value={fmt(wallet.totalTokensPurchased)} color="green" />
          <StatCard icon={Coins} label="Потрачено токенов" value={fmt(wallet.totalTokensSpent)} color="default" />
          <StatCard icon={Wallet} label="Вложено в токены" value={`${fmt(wallet.totalRubSpent)} ₽`} color="blue" />
          <StatCard icon={RefreshCw} label="Возврат токенов" value={fmt(wallet.totalTokensRefunded)} color="purple" />
        </div>
      )}

      {/* Test package button — admin only */}
      {user?.role === "admin" && (
        <div className="rounded-xl border border-purple-200 dark:border-purple-800/40 bg-purple-50 dark:bg-purple-900/20 p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Gift className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span className="text-sm font-medium text-purple-700 dark:text-purple-300">Начислить тестовые токены</span>
          </div>
          {!showTestForm ? (
            <button
              onClick={() => setShowTestForm(true)}
              className="w-full h-8 text-xs font-semibold rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors flex items-center justify-center gap-1.5"
            >
              <Gift className="w-3.5 h-3.5" /> Начислить токены
            </button>
          ) : (
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground">Токены</label>
                <input type="number" min={1} step={1}
                  className="mt-0.5 w-full h-8 border rounded-lg px-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-purple-300"
                  value={testTokens} onChange={e => setTestTokens(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreateTestPackage} disabled={testLoading}
                  className="flex-1 h-8 text-xs font-semibold rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 transition-colors">
                  {testLoading ? "Начисляю…" : "Подтвердить"}
                </button>
                <button onClick={() => setShowTestForm(false)}
                  className="h-8 w-8 rounded-lg border flex items-center justify-center hover:bg-muted transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Revenue */}
      <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <ReceiptText className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Заявленная выручка</span>
        </div>
        <p className="text-2xl font-bold">
          {stats.totalRevenue > 0 ? `${fmt(stats.totalRevenue)} ₽` : "—"}
        </p>
        <p className="text-xs text-muted-foreground">
          Сумма, которую мастер указал при завершении заказов. Данные частичные — не все мастера вносят суммы.
        </p>
      </div>
    </div>
  );
}

function TokenHistoryTab({ m }: { m: TokenMasterDetail }) {
  const { transactions } = m;

  if (!transactions.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Coins className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Нет токен-транзакций</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {transactions.map(tx => {
        const typeInfo = TX_TYPE_LABELS[tx.type] ?? { label: tx.type, sign: "", cls: "text-foreground" };
        return (
          <div key={tx.id} className="flex items-start gap-3 rounded-xl bg-muted/40 p-3 border border-border/50">
            <div className="shrink-0 mt-0.5">
              {tx.type === "purchase" && <ShoppingCart className="w-4 h-4 text-green-500" />}
              {tx.type === "spend" && <Zap className="w-4 h-4 text-orange-500" />}
              {tx.type === "refund" && <RefreshCw className="w-4 h-4 text-blue-500" />}
              {tx.type === "credit" && <Coins className="w-4 h-4 text-purple-500" />}
              {!["purchase","spend","refund","credit"].includes(tx.type) && <Coins className="w-4 h-4 text-gray-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{typeInfo.label}</span>
                <span className={cn("text-sm font-bold tabular-nums", typeInfo.cls)}>
                  {typeInfo.sign}{fmt(Math.abs(tx.tokensAmount))} токенов
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground truncate">
                  {tx.packageName ?? tx.reason ?? (tx.orderId ? `Заказ #${tx.orderId}` : "—")}
                </span>
                {tx.rubAmount != null && tx.rubAmount !== 0 && (
                  <span className="text-xs text-muted-foreground shrink-0">{fmt(tx.rubAmount)} ₽</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                {fmtRelative(tx.createdAt)}
                {tx.status !== "completed" && (
                  <span className="ml-1 text-yellow-600">· {tx.status}</span>
                )}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActivityTab({ m }: { m: TokenMasterDetail }) {
  const now = new Date();
  const lastSeen = m.lastSeenAt ? new Date(m.lastSeenAt) : null;
  const isOnline = lastSeen && (now.getTime() - lastSeen.getTime()) < 5 * 60 * 1000;
  const isActiveToday = lastSeen && lastSeen.toDateString() === now.toDateString();

  return (
    <div className="space-y-4">
      {/* Online status */}
      <div className={cn(
        "rounded-xl p-4 border flex items-center gap-3",
        isOnline
          ? "bg-green-50 border-green-100 dark:bg-green-900/20 dark:border-green-800/30"
          : isActiveToday
          ? "bg-blue-50 border-blue-100 dark:bg-blue-900/20 dark:border-blue-800/30"
          : "bg-muted/40 border-border/50"
      )}>
        <div className={cn(
          "w-3 h-3 rounded-full",
          isOnline ? "bg-green-500 animate-pulse" : isActiveToday ? "bg-blue-500" : "bg-gray-300"
        )} />
        <div>
          <p className="font-semibold text-sm">
            {isOnline ? "Онлайн сейчас" : isActiveToday ? "Активен сегодня" : "Не в сети"}
          </p>
          {lastSeen && (
            <p className="text-xs text-muted-foreground">
              Последний раз: {fmtRelative(m.lastSeenAt!)}
            </p>
          )}
          {!lastSeen && <p className="text-xs text-muted-foreground">Активность не зафиксирована</p>}
        </div>
      </div>

      {/* Activity stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={CheckCircle2} label="Взял (токен)" value={fmt(m.stats.tokenOrdersTotal)} color="green" />
        <StatCard icon={BarChart3} label="Завершено" value={fmt(m.stats.tokenOrdersCompleted)} color="default" />
        <StatCard
          icon={TrendingUp}
          label="Конверсия"
          value={m.stats.conversion != null ? `${m.stats.conversion}%` : "—"}
          color="blue"
        />
        <StatCard
          icon={Clock}
          label="Скорость ответа"
          value={m.avgResponseTime != null ? `${Math.round(m.avgResponseTime)} мин` : "—"}
          color="default"
        />
      </div>

      {/* Specializations */}
      {m.specializations && m.specializations.length > 1 && (
        <div className="rounded-xl bg-muted/40 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Специализации</p>
          <div className="flex flex-wrap gap-1.5">
            {m.specializations.map(s => (
              <span key={s} className="text-xs bg-secondary px-2 py-0.5 rounded-full text-secondary-foreground">{s}</span>
            ))}
          </div>
        </div>
      )}

      {/* Registration timeline */}
      <div className="rounded-xl bg-muted/40 p-3 space-y-2 text-sm">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-3.5 h-3.5" />
            <span>Зарегистрирован</span>
          </div>
          <span>{fmtDate(m.createdAt)}</span>
        </div>
        {m.contractSignedAt && (
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Договор</span>
            </div>
            <span>{fmtDate(m.contractSignedAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────

interface TokenMasterDrawerProps {
  masterId: number | null;
  onClose: () => void;
}

export function TokenMasterDrawer({ masterId, onClose }: TokenMasterDrawerProps) {
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    if (masterId !== null) {
      setTab("overview");
    }
  }, [masterId]);

  const { data, isLoading, isError } = useQuery<TokenMasterDetail>({
    queryKey: ["/api/token-masters", masterId],
    queryFn: () => fetch(`/api/token-masters/${masterId}`, { credentials: "include" }).then(r => r.json()),
    enabled: masterId !== null,
    placeholderData: (previousData) => previousData,
  });

  return (
    <Sheet open={masterId !== null} onOpenChange={open => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col gap-0 p-0 overflow-hidden">
        <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Zap className="w-5 h-5 text-violet-500" />
            Token Master
          </SheetTitle>
          <SheetDescription className="sr-only">
            Детальная информация о мастере
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col overflow-hidden">
          {isLoading && !data ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <div className="flex-1 flex items-center justify-center flex-col gap-2 text-muted-foreground">
              <AlertTriangle className="w-8 h-8" />
              <p className="text-sm">Ошибка загрузки данных</p>
            </div>
          ) : data ? (
            <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="mx-6 mt-4 mb-0 shrink-0 h-9 text-xs grid grid-cols-5">
                <TabsTrigger value="overview" className="text-xs px-1">Обзор</TabsTrigger>
                <TabsTrigger value="efficiency" className="text-xs px-1">Эффект.</TabsTrigger>
                <TabsTrigger value="finance" className="text-xs px-1">Финансы</TabsTrigger>
                <TabsTrigger value="history" className="text-xs px-1">Токены</TabsTrigger>
                <TabsTrigger value="activity" className="text-xs px-1">Активность</TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                <TabsContent value="overview" className="mt-0">
                  <OverviewTab m={data} masterId={masterId!} />
                </TabsContent>
                <TabsContent value="efficiency" className="mt-0">
                  <EfficiencyTab m={data} />
                </TabsContent>
                <TabsContent value="finance" className="mt-0">
                  <FinanceTab m={data} masterId={masterId!} />
                </TabsContent>
                <TabsContent value="history" className="mt-0">
                  <TokenHistoryTab m={data} />
                </TabsContent>
                <TabsContent value="activity" className="mt-0">
                  <ActivityTab m={data} />
                </TabsContent>
              </div>
            </Tabs>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
