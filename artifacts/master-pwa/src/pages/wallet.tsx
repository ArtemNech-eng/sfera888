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

  const [depositData, setDepositData] = useState<DepositData | null>(null);
  const [depositLoading, setDepositLoading] = useState(false);

  interface DepositData {
    depositBalance: number;
    recommendedAmount: number;
    transactions: Array<{
      id: number;
      type: string;
      amount: number;
      balanceBefore: number;
      balanceAfter: number;
      reason: string | null;
      createdAt: string;
    }>;
  }

  const loadCommissionBalance = useCallback(async () => {
    setCommissionLoading(true);
    try {
      const r = await fetch("/api/master-pwa/balance", { credentials: "include" });
      if (r.ok) setCommissionBalance(await r.json());
    } catch {}
    setCommissionLoading(false);
  }, []);

  const loadDeposit = useCallback(async () => {
    setDepositLoading(true);
    try {
      const r = await fetch("/api/master-pwa/deposit", { credentials: "include" });
      if (r.ok) setDepositData(await r.json());
    } catch {}
    setDepositLoading(false);
  }, []);

  useEffect(() => { loadCommissionBalance(); loadDeposit(); }, [loadCommissionBalance, loadDeposit]);

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

      {/* Deposit Section */}
      <div className="max-w-lg mx-auto px-4 py-5 space-y-6 border-t border-border mt-6">
        <div className="flex items-center gap-3">
          <Wallet size={24} className="text-emerald-500" />
          <div>
            <h2 className="text-lg font-bold">Депозит</h2>
            <p className="text-sm text-muted-foreground">Гарантийный взнос</p>
          </div>
        </div>

        {depositLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : depositData ? (
          <>
            <div className="bg-emerald-900 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
              <div className="relative">
                <p className="text-sm font-medium text-emerald-200 mb-1">Баланс депозита</p>
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-4xl font-bold tracking-tight">{depositData.depositBalance.toLocaleString("ru-RU")}</span>
                  <span className="text-xl font-medium text-emerald-300 mb-1">₽</span>
                </div>
                <p className="text-xs text-emerald-300">Рекомендуемый: {depositData.recommendedAmount.toLocaleString("ru-RU")} ₽</p>
              </div>
            </div>

            {depositData.transactions.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-medium text-sm">История операций</h3>
                {depositData.transactions.slice(0, 5).map((tx: any) => (
                  <div key={tx.id} className="bg-card border rounded-lg p-3 flex justify-between items-center">
                    <div>
                      <div className="font-medium text-sm">{tx.type === "deposit" ? "Зачисление" : "Удержание"}</div>
                      <div className="text-xs text-muted-foreground">{tx.reason ?? "—"}</div>
                    </div>
                    <div className="text-right">
                      <div className={`font-medium text-sm ${tx.type === "deposit" ? "text-green-600" : "text-red-500"}`}>
                        {tx.type === "deposit" ? "+" : "−"}{tx.amount.toLocaleString("ru-RU")} ₽
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Нет данных о депозите
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
