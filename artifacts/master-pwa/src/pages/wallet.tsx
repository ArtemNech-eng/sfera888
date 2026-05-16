import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Coins, Plus, ArrowDownCircle, ArrowUpCircle, RotateCcw,
  Gift, Wrench, ChevronLeft, Copy, CheckCircle2, Clock,
  CreditCard, X, Loader2, AlertTriangle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WalletData {
  tokens_balance: number;
  total_purchased: number;
  total_spent: number;
  total_refunded: number;
  total_rub_spent: number;
  credit_tokens_issued: number;
  credit_tokens_spent: number;
}

interface TokenPackage {
  id: number;
  name: string;
  tokens_count: number;
  price_rub: number;
  price_per_token: number;
}

interface Transaction {
  id: number;
  type: string;
  tokens_amount: number;
  rub_amount: number | null;
  package_name: string | null;
  order_id: number | null;
  reason: string | null;
  status: string;
  created_at: string;
}

interface PaymentDetails {
  bankName: string;
  cardNumber: string;
  holder: string;
  comment: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TX_META: Record<string, { label: string; color: string; icon: React.ReactNode; sign: string }> = {
  purchase: { label: "Покупка",      color: "text-green-600 dark:text-green-400",  icon: <Plus size={14} />,           sign: "+" },
  credit:   { label: "Тест. токен",  color: "text-blue-600 dark:text-blue-400",    icon: <Gift size={14} />,           sign: "+" },
  spend:    { label: "Списание",     color: "text-red-500 dark:text-red-400",      icon: <ArrowUpCircle size={14} />,  sign: "−" },
  refund:   { label: "Возврат",      color: "text-emerald-600 dark:text-emerald-400", icon: <RotateCcw size={14} />,  sign: "+" },
  bonus:    { label: "Бонус",        color: "text-purple-600 dark:text-purple-400", icon: <Gift size={14} />,          sign: "+" },
  adjustment:{ label: "Корректировка",color: "text-gray-500",                      icon: <Wrench size={14} />,         sign: "" },
};

function fmtDate(d: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(d));
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") return null;
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
      status === "pending"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        : "bg-red-100 text-red-600"
    }`}>
      {status === "pending" ? "Ожидает" : status}
    </span>
  );
}

// ─── Purchase Sheet ───────────────────────────────────────────────────────────

function PurchaseSheet({
  pkg,
  onClose,
  onSuccess,
}: {
  pkg: TokenPackage;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [details, setDetails] = useState<PaymentDetails | null>(null);
  const [step, setStep] = useState<"details" | "confirm" | "done">("details");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/settings/payment-details", { credentials: "include" })
      .then(r => r.json())
      .then(setDetails)
      .catch(() => {});
  }, []);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePaid = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/wallet/my/purchase-request", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_id: pkg.id }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Ошибка");
      setStep("done");
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted">
          <ChevronLeft size={20} />
        </button>
        <span className="font-bold">Покупка: {pkg.name}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        {step === "done" ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-5">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 size={44} className="text-green-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Заявка принята!</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Токены будут зачислены после подтверждения оплаты администратором.
              </p>
            </div>
            <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              <Clock size={16} className="shrink-0" />
              Обычно в течение нескольких часов
            </div>
            <button
              onClick={() => { onSuccess(); onClose(); }}
              className="w-full max-w-sm h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm"
            >
              Понятно
            </button>
          </div>
        ) : (
          <>
            {/* Package summary */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-lg">{pkg.tokens_count} токенов</span>
                <span className="text-2xl font-bold text-amber-600">{pkg.price_rub.toLocaleString("ru-RU")} ₽</span>
              </div>
              <p className="text-xs text-muted-foreground">{pkg.price_per_token} ₽ за токен</p>
            </div>

            {/* Instructions */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">Инструкция:</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Переведите <strong>{pkg.price_rub.toLocaleString("ru-RU")} ₽</strong> на реквизиты ниже.
                После подтверждения оплаты токены будут зачислены на баланс.
              </p>
            </div>

            {/* Payment details */}
            {details ? (
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                {details.bankName && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Банк</span>
                    <span className="text-sm font-medium">{details.bankName}</span>
                  </div>
                )}
                {details.cardNumber && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Номер карты</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-bold tracking-widest">{details.cardNumber}</span>
                      <button onClick={() => handleCopy(details.cardNumber)}
                        className="text-primary hover:text-primary/80">
                        {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                )}
                {details.holder && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Получатель</span>
                    <span className="text-sm font-medium">{details.holder}</span>
                  </div>
                )}
                {details.comment && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Комментарий</span>
                    <span className="text-sm text-muted-foreground">{details.comment}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                <p className="text-sm text-amber-700">Реквизиты пока не настроены. Обратитесь к администратору.</p>
              </div>
            )}

            <button
              onClick={handlePaid}
              disabled={loading || !details?.cardNumber}
              className="w-full h-14 rounded-2xl bg-green-500 text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading
                ? <Loader2 size={20} className="animate-spin" />
                : <CheckCircle2 size={20} />}
              Я оплатил
            </button>
            <p className="text-center text-xs text-muted-foreground">
              Нажимая «Я оплатил», вы подтверждаете, что перевели деньги
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WalletPage() {
  const [, setLocation] = useLocation();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txPage, setTxPage] = useState(1);
  const [txLoading, setTxLoading] = useState(false);
  const [txHasMore, setTxHasMore] = useState(true);
  const [selectedPkg, setSelectedPkg] = useState<TokenPackage | null>(null);
  const [loading, setLoading] = useState(true);

  const loadWallet = useCallback(async () => {
    try {
      const [w, p] = await Promise.all([
        fetch("/api/wallet/my", { credentials: "include" }).then(r => r.json()),
        fetch("/api/settings/token-packages/public").then(r => r.json()),
      ]);
      setWallet(w);
      setPackages(Array.isArray(p) ? p : []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  const loadTx = useCallback(async (page: number, append = false) => {
    setTxLoading(true);
    try {
      const r = await fetch(`/api/wallet/my/transactions?page=${page}&limit=20`, { credentials: "include" });
      const data: Transaction[] = await r.json();
      setTransactions(prev => append ? [...prev, ...data] : data);
      setTxHasMore(data.length === 20);
    } catch {}
    finally { setTxLoading(false); }
  }, []);

  useEffect(() => { loadWallet(); loadTx(1); }, [loadWallet, loadTx]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <Loader2 size={32} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const balance = wallet?.tokens_balance ?? 0;
  const creditIssued = wallet?.credit_tokens_issued ?? 0;

  return (
    <>
      <div className="max-w-lg mx-auto px-4 py-5 space-y-6 pb-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation("/")} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted">
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-xl font-bold">Кошелёк</h1>
        </div>

        {/* Balance block */}
        <div className="bg-gradient-to-br from-amber-400 to-amber-500 rounded-3xl p-6 text-white shadow-lg">
          <p className="text-sm font-medium opacity-80 mb-1">Баланс токенов</p>
          <div className="flex items-end gap-2 mb-4">
            <span className="text-5xl font-bold">{balance}</span>
            <span className="text-xl font-medium opacity-80 mb-1">т.</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              {creditIssued > 0 && (
                <p className="text-xs opacity-70">Тест. токены: {creditIssued}</p>
              )}
              <p className="text-xs opacity-70">Потрачено: {wallet?.total_spent ?? 0} т.</p>
            </div>
            <button
              onClick={() => document.getElementById("packages-section")?.scrollIntoView({ behavior: "smooth" })}
              className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 transition-colors px-4 py-2 rounded-xl text-sm font-semibold"
            >
              <Plus size={16} /> Пополнить
            </button>
          </div>
        </div>

        {/* Packages */}
        <section id="packages-section" className="space-y-3">
          <h2 className="text-base font-bold">Пакеты токенов</h2>
          {packages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пакеты пока не настроены</p>
          ) : (
            <div className="space-y-3">
              {packages.map(pkg => (
                <div key={pkg.id}
                  className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-sm">{pkg.name}</p>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-amber-600 font-bold text-base">
                        <Coins size={15} /> {pkg.tokens_count} т.
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · {pkg.price_per_token} ₽/т.
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedPkg(pkg)}
                    className="flex-shrink-0 h-10 px-4 rounded-xl bg-green-500 text-white font-semibold text-sm hover:bg-green-600 transition-colors"
                  >
                    {pkg.price_rub.toLocaleString("ru-RU")} ₽
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Transactions */}
        <section className="space-y-3">
          <h2 className="text-base font-bold">История операций</h2>
          {transactions.length === 0 && !txLoading ? (
            <div className="bg-muted/40 rounded-2xl px-4 py-8 text-center text-sm text-muted-foreground">
              Операций ещё нет
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map(tx => {
                const meta = TX_META[tx.type] ?? { label: tx.type, color: "text-foreground", icon: null, sign: "" };
                const positive = ["purchase", "credit", "refund", "bonus"].includes(tx.type) ||
                  (tx.type === "adjustment" && tx.tokens_amount > 0);
                return (
                  <div key={tx.id}
                    className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      tx.type === "credit"
                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                        : positive
                          ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                          : "bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400"
                    }`}>
                      {meta.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium">{meta.label}</span>
                        {tx.type === "credit" && (
                          <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded-full">
                            Тестовый токен
                          </span>
                        )}
                        <StatusBadge status={tx.status} />
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {tx.reason ?? tx.package_name ?? (tx.order_id ? `Заказ #${tx.order_id}` : "")}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{fmtDate(tx.created_at)}</p>
                    </div>
                    <div className={`text-sm font-bold tabular-nums ${meta.color}`}>
                      {positive ? "+" : "−"}{Math.abs(tx.tokens_amount)} т.
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {txLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          )}

          {txHasMore && !txLoading && transactions.length > 0 && (
            <button
              onClick={() => { const next = txPage + 1; setTxPage(next); loadTx(next, true); }}
              className="w-full h-10 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Загрузить ещё
            </button>
          )}
        </section>
      </div>

      {/* Purchase sheet */}
      {selectedPkg && (
        <PurchaseSheet
          pkg={selectedPkg}
          onClose={() => setSelectedPkg(null)}
          onSuccess={loadWallet}
        />
      )}
    </>
  );
}
