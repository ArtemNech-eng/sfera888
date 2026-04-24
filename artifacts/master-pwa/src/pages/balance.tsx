import { useEffect, useRef, useState } from "react";
import { api, uploadPhoto } from "@/lib/api";
import { toast } from "sonner";
import {
  Wallet, TrendingUp, AlertTriangle, CheckCircle2, Clock,
  Copy, Camera, Loader2, ChevronDown, ChevronUp,
} from "lucide-react";

interface PartialPayment {
  id: number;
  amount: number;
  note: string | null;
  paidAt: string;
}

interface Transaction {
  id: number;
  orderId: number;
  orderServiceType: string | null;
  orderCity: string | null;
  orderAmount: number;
  commission: number;
  netPayable: number;
  prepaymentDeducted: number;
  totalPartialPaid: number;
  partialPayments: PartialPayment[];
  paymentStatus: string;
  createdAt: string;
  paidAt: string | null;
}

interface BalanceData {
  debt: number;
  totalEarned: number;
  totalPaidCommission: number;
  pendingCommission: number;
  pendingEarnings: number;
  transactions: Transaction[];
}

const BANK_NUMBER = "89892860863";
const BANK_NAME = "Альфа Банк · Игорь К.";

const statusLabel: Record<string, { label: string; color: string }> = {
  paid: { label: "Оплачено", color: "text-green-600 dark:text-green-400" },
  pending: { label: "Ожидает", color: "text-amber-600 dark:text-amber-400" },
  debt: { label: "Долг", color: "text-red-600 dark:text-red-400" },
  cancelled: { label: "Отменён", color: "text-muted-foreground" },
};

function PaymentSection({ debt }: { debt: number }) {
  const [showDetails, setShowDetails] = useState(debt > 0);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(BANK_NUMBER);
      toast.success("Номер скопирован");
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  const handleProofUpload = async (file: File) => {
    setUploading(true);
    try {
      const photoUrl = await uploadPhoto(file);
      await api.paymentProof(photoUrl);
      toast.success("Скриншот отправлен менеджеру");
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка отправки");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3.5 active:opacity-80"
        onClick={() => setShowDetails(v => !v)}
      >
        <span className="font-semibold text-sm">Оплата комиссии</span>
        {showDetails
          ? <ChevronUp size={16} className="text-muted-foreground" />
          : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>

      {showDetails && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Реквизиты для перевода</p>
            <div className="bg-muted rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">{BANK_NAME}</p>
                  <p className="font-mono font-bold text-base tracking-wide">{BANK_NUMBER}</p>
                </div>
                <button
                  onClick={copyNumber}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium active:opacity-80"
                >
                  <Copy size={14} />
                  Копировать
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              После оплаты отправьте скриншот менеджеру — он подтвердит платёж.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Подтверждение оплаты</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleProofUpload(f);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-primary/50 text-primary text-sm font-medium active:opacity-80 disabled:opacity-50 bg-primary/5"
            >
              {uploading
                ? <Loader2 size={16} className="animate-spin" />
                : <Camera size={16} />}
              {uploading ? "Отправляем..." : "Отправить скриншот оплаты"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TxCard({ tx }: { tx: Transaction }) {
  const [expanded, setExpanded] = useState(false);
  const s = statusLabel[tx.paymentStatus] ?? { label: tx.paymentStatus, color: "text-muted-foreground" };
  const hasParts = tx.partialPayments?.length > 0;
  const paidFraction = tx.commission > 0
    ? Math.min(1, ((tx.prepaymentDeducted ?? 0) + (tx.totalPartialPaid ?? 0)) / tx.commission)
    : 0;
  const fmt = (n: number) => n.toLocaleString("ru-RU");

  return (
    <div className="bg-card border border-border rounded-xl p-3.5 space-y-2">
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
          <p className="font-bold text-base">{fmt(tx.orderAmount)} ₽</p>
          <p className="text-xs text-muted-foreground">Комиссия: {fmt(tx.commission)} ₽</p>
          {tx.netPayable !== undefined && tx.paymentStatus !== "paid" && tx.netPayable < tx.commission && (
            <p className="text-xs text-blue-600 font-medium">Остаток: {fmt(tx.netPayable)} ₽</p>
          )}
          <div className={`flex items-center gap-1 justify-end text-xs font-medium ${s.color}`}>
            {tx.paymentStatus === "paid" ? <CheckCircle2 size={12} /> : <Clock size={12} />}
            {s.label}
          </div>
        </div>
      </div>

      {/* Progress bar (only for partially paid) */}
      {paidFraction > 0 && paidFraction < 1 && (
        <div className="space-y-1">
          <div className="w-full bg-muted rounded-full h-1.5">
            <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${paidFraction * 100}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground">Оплачено {Math.round(paidFraction * 100)}%</p>
        </div>
      )}

      {/* Expand partial payment history */}
      {hasParts && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-between text-xs text-blue-600 py-1 active:opacity-70"
        >
          <span>Частичные платежи ({tx.partialPayments.length})</span>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      )}
      {expanded && hasParts && (
        <div className="border-t border-border pt-2 space-y-1.5">
          {tx.partialPayments.map((p, i) => (
            <div key={p.id} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                #{i + 1} · {new Date(p.paidAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } as any)}
                {p.note && ` · ${p.note}`}
              </span>
              <span className="font-semibold text-blue-700">{fmt(p.amount)} ₽</span>
            </div>
          ))}
          <div className="flex justify-between text-xs border-t border-border/50 pt-1">
            <span className="text-muted-foreground">Итого частями</span>
            <span className="font-semibold">{fmt(tx.totalPartialPaid)} ₽</span>
          </div>
        </div>
      )}
    </div>
  );
}

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

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-xl p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <TrendingUp size={14} />
              <span>Заработано (оплач.)</span>
            </div>
            <p className="text-xl font-bold">{data.totalEarned.toLocaleString("ru-RU")} ₽</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <Wallet size={14} />
              <span>Чистый доход</span>
            </div>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">
              {(data.totalEarned - data.totalPaidCommission).toLocaleString("ru-RU")} ₽
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-xl p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <Wallet size={14} />
              <span>Комиссия оплачена</span>
            </div>
            <p className="text-lg font-bold">{data.totalPaidCommission.toLocaleString("ru-RU")} ₽</p>
          </div>
          {data.pendingCommission > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3.5 space-y-1">
              <div className="flex items-center gap-1.5 text-amber-600 text-xs">
                <Clock size={14} />
                <span>Ожидает оплаты</span>
              </div>
              <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
                {data.pendingCommission.toLocaleString("ru-RU")} ₽
              </p>
              <p className="text-[11px] text-amber-600/80">с {data.pendingEarnings.toLocaleString("ru-RU")} ₽</p>
            </div>
          )}
        </div>
      </div>

      <PaymentSection debt={data.debt} />

      <section className="space-y-2">
        <h2 className="font-semibold text-sm">История транзакций</h2>
        {data.transactions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Транзакций пока нет
          </div>
        ) : (
          data.transactions.map(tx => <TxCard key={tx.id} tx={tx} />)
        )}
      </section>
    </div>
  );
}
