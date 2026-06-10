import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  ChevronLeft, Loader2, Wallet,
} from "lucide-react";

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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WalletPage() {
  const [, setLocation] = useLocation();
  const [commissionBalance, setCommissionBalance] = useState<CommissionData | null>(null);
  const [commissionLoading, setCommissionLoading] = useState(false);

  const [accountBalance, setAccountBalance] = useState<AccountBalanceData | null>(null);
  const [accountBalanceLoading, setAccountBalanceLoading] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");

  interface AccountBalanceData {
    balance: number;
    creditLimit: number;
    available: number;
    totalServiceFeesSpent: number;
    totalTopups: number;
  }

  const loadCommissionBalance = useCallback(async () => {
    setCommissionLoading(true);
    try {
      const r = await fetch("/api/master-pwa/balance", { credentials: "include" });
      if (r.ok) setCommissionBalance(await r.json());
    } catch {}
    setCommissionLoading(false);
  }, []);

  const loadAccountBalance = useCallback(async () => {
    setAccountBalanceLoading(true);
    try {
      const r = await fetch("/api/account-balance/my", { credentials: "include" });
      if (r.ok) setAccountBalance(await r.json());
    } catch {}
    setAccountBalanceLoading(false);
  }, []);

  const handleTopup = async () => {
    const amount = Number(topupAmount);
    if (!amount || amount <= 0) {
      toast.error("Укажите сумму пополнения");
      return;
    }
    try {
      const r = await fetch("/api/account-balance/my/topup-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount }),
      });
      if (r.ok) {
        toast.success("Баланс пополнен");
        setTopupAmount("");
        loadAccountBalance();
      } else {
        const data = await r.json();
        toast.error(data.error || "Ошибка пополнения");
      }
    } catch {
      toast.error("Ошибка сети");
    }
  };

  useEffect(() => { loadCommissionBalance(); loadAccountBalance(); }, [loadCommissionBalance, loadAccountBalance]);

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
      </div>

      {/* Account Balance Section */}
      <div className="max-w-lg mx-auto px-4 py-5 space-y-6 border-t border-border mt-6">
        <div className="flex items-center gap-3">
          <Wallet size={24} className="text-emerald-500" />
          <div>
            <h2 className="text-lg font-bold">Баланс</h2>
            <p className="text-sm text-muted-foreground">Для получения заказов</p>
          </div>
        </div>

        {accountBalanceLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : accountBalance ? (
          <>
            <div className="bg-emerald-900 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
              <div className="relative">
                <p className="text-sm font-medium text-emerald-200 mb-1">Баланс</p>
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-4xl font-bold tracking-tight">{accountBalance.balance.toLocaleString("ru-RU")}</span>
                  <span className="text-xl font-medium text-emerald-300 mb-1">₽</span>
                </div>
                <p className="text-xs text-emerald-300">
                  Кредитный лимит: {accountBalance.creditLimit.toLocaleString("ru-RU")} ₽
                  &nbsp;·&nbsp; Доступно: {accountBalance.available.toLocaleString("ru-RU")} ₽
                </p>
              </div>
            </div>

            {/* Topup */}
            <div className="bg-card border rounded-xl p-4 space-y-3">
              <h3 className="font-medium text-sm">Пополнить баланс</h3>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  placeholder="Сумма"
                  className="flex-1 h-10 px-3 rounded-lg border bg-background text-sm"
                />
                <button
                  onClick={handleTopup}
                  className="h-10 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                >
                  Пополнить
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Сервисный сбор за получение заказа: 500 ₽. Комиссия с суммы работ оплачивается отдельно. Рекомендуемый минимум: 1 000 ₽.
              </p>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Нет данных о балансе
          </div>
        )}
      </div>

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
