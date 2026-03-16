import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Wallet, TrendingUp, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

interface Transaction {
  id: number;
  orderId: number;
  orderServiceType: string | null;
  orderCity: string | null;
  orderAmount: number;
  commission: number;
  paymentStatus: string;
  createdAt: string;
  paidAt: string | null;
}

interface BalanceData {
  debt: number;
  totalEarned: number;
  totalPaidCommission: number;
  transactions: Transaction[];
}

const statusLabel: Record<string, { label: string; color: string }> = {
  paid: { label: "Оплачено", color: "text-green-600 dark:text-green-400" },
  pending: { label: "Ожидает", color: "text-amber-600 dark:text-amber-400" },
  debt: { label: "Долг", color: "text-red-600 dark:text-red-400" },
  cancelled: { label: "Отменён", color: "text-muted-foreground" },
};

export default function BalancePage() {
  const [data, setData] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.balance()
      .then(setData)
      .catch(() => toast.error("Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="px-4 pt-5 pb-4 space-y-5">
      <h1 className="text-xl font-bold">Баланс</h1>

      {data.debt > 0 && (
        <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-700 dark:text-red-400">Задолженность</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-500 mt-1">
              {data.debt.toLocaleString("ru-RU")} ₽
            </p>
            <p className="text-xs text-red-500 mt-1">Необходимо погасить до следующего заказа</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-3.5 space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <TrendingUp size={14} />
            <span>Заработано всего</span>
          </div>
          <p className="text-xl font-bold">{data.totalEarned.toLocaleString("ru-RU")} ₽</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3.5 space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Wallet size={14} />
            <span>Комиссия оплачена</span>
          </div>
          <p className="text-xl font-bold">{data.totalPaidCommission.toLocaleString("ru-RU")} ₽</p>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold text-sm">История транзакций</h2>
        {data.transactions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Транзакций пока нет
          </div>
        ) : (
          data.transactions.map(tx => {
            const s = statusLabel[tx.paymentStatus] ?? { label: tx.paymentStatus, color: "text-muted-foreground" };
            return (
              <div key={tx.id} className="bg-card border border-border rounded-xl p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {tx.orderServiceType ?? "Заказ"} #{tx.orderId}
                    </p>
                    <p className="text-xs text-muted-foreground">{tx.orderCity ?? ""}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.createdAt).toLocaleDateString("ru-RU", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="text-right space-y-1 shrink-0">
                    <p className="font-bold text-base">{tx.orderAmount.toLocaleString("ru-RU")} ₽</p>
                    <p className="text-xs text-muted-foreground">
                      Комиссия: {tx.commission.toLocaleString("ru-RU")} ₽
                    </p>
                    <div className={`flex items-center gap-1 justify-end text-xs font-medium ${s.color}`}>
                      {tx.paymentStatus === "paid"
                        ? <CheckCircle2 size={12} />
                        : <Clock size={12} />}
                      {s.label}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
