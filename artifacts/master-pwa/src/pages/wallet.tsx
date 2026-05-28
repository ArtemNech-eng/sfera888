import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Coins, Plus, ArrowDownCircle, ArrowUpCircle, RotateCcw,
  Gift, Wrench, ChevronLeft, Copy, CheckCircle2, Clock,
  CreditCard, X, Loader2, AlertTriangle, Wallet, TrendingUp, Camera, History as HistoryIcon,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WalletData {
  tokens_balance: number;
  total_purchased: number;
  total_spent: number;
  total_refunded: number;
  total_rub_spent: number;
  credit_limit_tokens: number;
  credit_tokens_issued: number;
  credit_tokens_spent: number;
  available_tokens: number;
  topup_needed: number;
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

// ─── Commission Types ─────────────────────────────────────────────────────────

interface CommissionTransaction {
  id: number;
  orderId: number;
  orderServiceType: string | null;
  orderCity: string | null;
  orderAmount: number;
  commission: number;
  netPayable: number;
  prepaymentDeducted: number;
  totalPartialPaid: number;
  partialPayments: { id: number; amount: number; note: string | null; paidAt: string }[];
  paymentStatus: string;
  createdAt: string;
  paidAt: string | null;
}

interface CommissionData {
  debt: number;
  totalEarned: number;
  totalPaidCommission: number;
  pendingCommission: number;
  pendingEarnings: number;
  transactions: CommissionTransaction[];
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
  const [step, setStep] = useState<"details" | "done">("details");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);

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
    if (!screenshotFile) {
      toast.error("Прикрепите скриншот оплаты");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("package_id", String(pkg.id));
      formData.append("screenshot", screenshotFile);
      const r = await fetch("/api/wallet/my/purchase-request", {
        method: "POST",
        credentials: "include",
        body: formData,
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
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 animate-in fade-in duration-200" />

      {/* Sheet */}
      <div
        className="relative bg-background rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[85vh] mb-8 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1.5 bg-border rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 shrink-0">
          <h2 className="text-lg font-bold">Пополнение токенов</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5 pb-8 space-y-5">
          {step === "done" ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-5">
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
                className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm"
              >
                Понятно
              </button>
            </div>
          ) : (
            <>
              {/* Package summary */}
              <div className="bg-gradient-to-br from-amber-400 to-amber-500 rounded-2xl p-4 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium opacity-80">{pkg.name}</p>
                    <p className="text-3xl font-bold mt-0.5">{pkg.tokens_count} <span className="text-lg font-medium opacity-80">токенов</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{(pkg.price_rub ?? 0).toLocaleString("ru-RU")} ₽</p>
                    <p className="text-xs opacity-70">{pkg.price_per_token} ₽ за токен</p>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <p className="text-sm text-muted-foreground leading-relaxed">
                Переведите <strong className="text-foreground">{(pkg.price_rub ?? 0).toLocaleString("ru-RU")} ₽</strong> по реквизитам ниже и нажмите «Я оплатил». Токены зачислятся после проверки администратором.
              </p>

              {/* Payment details */}
              {details ? (
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  {details.bankName && (
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                      <span className="text-xs text-muted-foreground">Банк</span>
                      <span className="text-sm font-semibold">{details.bankName}</span>
                    </div>
                  )}
                  {details.cardNumber && (
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                      <span className="text-xs text-muted-foreground">Номер / СБП</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-bold">{details.cardNumber}</span>
                        <button
                          onClick={() => handleCopy(details.cardNumber)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        >
                          {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                        </button>
                      </div>
                    </div>
                  )}
                  {details.holder && (
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                      <span className="text-xs text-muted-foreground">Получатель</span>
                      <span className="text-sm font-semibold">{details.holder}</span>
                    </div>
                  )}
                  {details.comment && (
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-xs text-muted-foreground">Назначение</span>
                      <span className="text-sm text-muted-foreground">{details.comment}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                  <p className="text-sm text-amber-700">Реквизиты не настроены. Обратитесь к администратору.</p>
                </div>
              )}

              {/* Screenshot upload */}
              <label className="w-full block cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file) {
                      setScreenshotFile(file);
                      const reader = new FileReader();
                      reader.onload = (ev) => setScreenshotPreview(ev.target?.result as string);
                      reader.readAsDataURL(file);
                    }
                  }}
                />
                {screenshotPreview ? (
                  <div className="w-full border rounded-2xl overflow-hidden relative group">
                    <img src={screenshotPreview} alt="Скриншот" className="w-full h-40 object-cover" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-white text-sm font-medium">Изменить скриншот</span>
                    </div>
                  </div>
                ) : (
                  <div className="w-full border-2 border-dashed border-border rounded-2xl p-4 flex flex-col items-center gap-1.5 text-muted-foreground hover:bg-muted/50 transition-colors">
                    <Camera size={22} />
                    <span className="text-sm font-medium">Прикрепить скриншот оплаты</span>
                    <span className="text-xs">Обязательно для подтверждения</span>
                  </div>
                )}
              </label>

              {/* Pay button */}
              <button
                onClick={handlePaid}
                disabled={loading || !details?.cardNumber || !screenshotFile}
                className="w-full h-14 rounded-2xl bg-green-500 text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
              >
                {loading
                  ? <Loader2 size={20} className="animate-spin" />
                  : <CheckCircle2 size={20} />}
                Я оплатил
              </button>
              <p className="text-center text-xs text-muted-foreground pb-2">
                Нажимая «Я оплатил», вы подтверждаете перевод средств
              </p>
            </>
          )}
        </div>
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
  
  // Commission balance state
  const [commissionBalance, setCommissionBalance] = useState<CommissionData | null>(null);
  const [commissionLoading, setCommissionLoading] = useState(false);

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

  const loadCommissionBalance = useCallback(async () => {
    setCommissionLoading(true);
    try {
      const r = await fetch("/api/master-pwa/balance", { credentials: "include" });
      if (r.ok) setCommissionBalance(await r.json());
    } catch {}
    setCommissionLoading(false);
  }, []);

  const loadTx = useCallback(async (page: number, append = false) => {
    setTxLoading(true);
    try {
      const r = await fetch(`/api/wallet/my/transactions?page=${page}&limit=20`, { credentials: "include" });
      const raw = await r.json();
      const data: Transaction[] = Array.isArray(raw) ? raw : [];
      setTransactions(prev => append ? [...prev, ...data] : data);
      setTxHasMore(data.length === 20);
    } catch {}
    finally { setTxLoading(false); }
  }, []);

  useEffect(() => { loadWallet(); loadTx(1); loadCommissionBalance(); }, [loadWallet, loadTx, loadCommissionBalance]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <Loader2 size={32} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const balance = wallet?.tokens_balance ?? 0;
  const creditLimit = wallet?.credit_limit_tokens ?? 0;
  const available = wallet?.available_tokens ?? balance + creditLimit;
  const topupNeeded = wallet?.topup_needed ?? (balance < 0 ? -balance : 0);
  const creditIssued = wallet?.credit_tokens_issued ?? 0;
  const creditSpent = wallet?.credit_tokens_spent ?? 0;

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
        <div className="bg-slate-900 dark:bg-slate-800 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-primary/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
          <div className="relative">
            <p className="text-sm font-medium text-slate-300 mb-1">Баланс токенов</p>
            <div className="flex items-end gap-2 mb-2">
              <span className={`text-5xl font-bold tracking-tight ${balance < 0 ? "text-red-400" : ""}`}>{balance}</span>
              <span className="text-xl font-medium text-slate-400 mb-1">т.</span>
            </div>
            {balance < 0 && (
              <p className="text-sm text-red-400 mb-3">Кредитный долг: {Math.abs(balance)} ток.</p>
            )}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                {creditLimit > 0 && (
                  <p className="text-xs text-slate-400">Кредитный лимит: +{creditLimit} т.</p>
                )}
                <p className="text-xs text-emerald-400">Доступно: {available} т.</p>
                {topupNeeded > 0 && (
                  <p className="text-xs text-red-400">Пополнить до 0: {topupNeeded} т.</p>
                )}
                {creditIssued > 0 && (
                  <p className="text-xs text-slate-400">Тест. токены выдано: {creditIssued}</p>
                )}
                {creditSpent > 0 && (
                  <p className="text-xs text-slate-400">Тест. токены потрачено: {creditSpent}</p>
                )}
                <p className="text-xs text-slate-400">Потрачено: {wallet?.total_spent ?? 0} т.</p>
              </div>
              <button
                onClick={() => document.getElementById("packages-section")?.scrollIntoView({ behavior: "smooth" })}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 transition-colors px-4 py-2.5 rounded-xl text-sm font-semibold border border-white/20"
              >
                <Plus size={16} /> Пополнить
              </button>
            </div>
          </div>
        </div>

        {/* Packages */}
        <section id="packages-section" className="space-y-3">
          <h2 className="text-base font-bold">Пакеты токенов</h2>
          {packages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пакеты пока не настроены</p>
          ) : (() => {
            const minPpt = Math.min(...packages.map(p => Number(p.price_per_token)));
            return (
              <div className="space-y-4">
                {packages.map(pkg => {
                  const isBest = packages.length > 1 && Number(pkg.price_per_token) === minPpt;
                  return (
                    <div key={pkg.id} className="relative">
                      {isBest && (
                        <span className="absolute -top-2.5 left-4 z-10 bg-amber-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">
                          Выгодно
                        </span>
                      )}
                      <button
                        onClick={() => setSelectedPkg(pkg)}
                        className={`w-full bg-card rounded-2xl p-4 flex items-center justify-between gap-3 text-left transition-all shadow-sm hover:shadow active:scale-[0.98] ${isBest ? "ring-1 ring-primary/30" : ""}`}
                      >
                        <div className="space-y-1">
                          <p className="font-semibold text-sm">{pkg.name}</p>
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 text-primary font-bold text-base">
                              <Coins size={15} /> {pkg.tokens_count} т.
                            </span>
                            <span className="text-xs text-muted-foreground">{pkg.price_per_token} ₽/т.</span>
                          </div>
                        </div>
                        <div className="flex-shrink-0 h-11 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center shadow-sm">
                          {(pkg.price_rub ?? 0).toLocaleString("ru-RU")} ₽
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </section>

        {/* Transactions */}
        <section className="space-y-3">
          <h2 className="text-base font-bold">История операций</h2>
          {transactions.length === 0 && !txLoading ? (
            <div className="bg-card rounded-2xl p-8 text-center">
              <HistoryIcon size={32} className="text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">Операций ещё нет</p>
              <p className="text-xs text-muted-foreground mt-1">Здесь будет история всех операций</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map(tx => {
                const meta = TX_META[tx.type] ?? { label: tx.type, color: "text-foreground", icon: null, sign: "" };
                const positive = ["purchase", "credit", "refund", "bonus"].includes(tx.type) ||
                  (tx.type === "adjustment" && tx.tokens_amount > 0);
                const accentColor = tx.type === "credit" ? "border-l-info" : positive ? "border-l-success" : "border-l-destructive";
                return (
                  <div key={tx.id}
                    className={`bg-card rounded-xl px-4 py-3 flex items-center gap-3 shadow-sm border-l-4 ${accentColor}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium">{meta.label}</span>
                        {tx.type === "credit" && (
                          <span className="text-[10px] font-semibold bg-info/10 text-info px-1.5 py-0.5 rounded-full">
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
                    <div className={`text-sm font-bold tabular-nums ${positive ? "text-success" : "text-destructive"}`}>
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

      {/* Commission Balance Section */}
      <div className="max-w-lg mx-auto px-4 py-5 space-y-6 border-t border-border mt-6">
        <div className="flex items-center gap-3">
          <Wallet size={24} className="text-amber-500" />
          <div>
            <h2 className="text-lg font-bold">Комиссии</h2>
            <p className="text-sm text-muted-foreground">Заработок и выплаты</p>
          </div>
        </div>

        {commissionLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : commissionBalance && typeof commissionBalance.debt === "number" ? (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border rounded-xl p-3">
                <div className="text-sm text-muted-foreground mb-1">Долг</div>
                <div className={`text-lg font-bold ${commissionBalance.debt > 0 ? "text-red-500" : "text-green-600"}`}>
                  {commissionBalance.debt.toLocaleString()} ₽
                </div>
              </div>
              <div className="bg-card border rounded-xl p-3">
                <div className="text-sm text-muted-foreground mb-1">Заработано</div>
                <div className="text-lg font-bold text-green-600">
                  {(commissionBalance.totalEarned ?? 0).toLocaleString()} ₽
                </div>
              </div>
            </div>

            {/* Recent transactions */}
            {commissionBalance.transactions && commissionBalance.transactions.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-medium text-sm">Последние операции</h3>
                {commissionBalance.transactions.slice(0, 5).map((tx: any) => (
                  <div key={tx.id} className="bg-card border rounded-lg p-3 flex justify-between items-center">
                    <div>
                      <div className="font-medium">{tx.orderServiceType || "Услуга"}</div>
                      <div className="text-xs text-muted-foreground">{tx.orderCity || "—"}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{(tx.commission ?? 0).toLocaleString()} ₽</div>
                      <div className={`text-xs ${tx.paymentStatus === 'paid' ? 'text-green-600' : 'text-amber-600'}`}>
                        {tx.paymentStatus === 'paid' ? 'Оплачено' : 'Ожидает'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Нет данных о комиссиях
          </div>
        )}
      </div>
    </>
  );
}
