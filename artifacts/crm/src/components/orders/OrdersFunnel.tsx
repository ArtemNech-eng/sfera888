import { useMemo } from "react";
import { Users, Wallet, CheckCircle2, TrendingUp, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FunnelData {
  activeCount: number;
  sumInWork: number;
  sumPaid: number;
  expectedCommission: number;
  conversionPct: number;
  problemCount: number;
}

interface Props {
  funnel: FunnelData | undefined;
  updatedAt: number | undefined;
  loading: boolean;
  onRefresh: () => void;
}

const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";

/**
 * Operational summary of the orders work board (current state, not a period
 * cohort): active orders, money in work, money collected + expected commission,
 * throughput and orders needing operator attention.
 */
export default function OrdersFunnel({ funnel, updatedAt, loading, onRefresh }: Props) {
  const updatedAgo = useMemo(() => {
    if (!updatedAt) return "—";
    const sec = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
    if (sec < 60) return `${sec}с назад`;
    return `${Math.floor(sec / 60)}м назад`;
  }, [updatedAt]);

  const problems = funnel?.problemCount ?? 0;

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-foreground">Сводка по заказам</span>
          <span className="text-[11px] text-muted-foreground">обновлено {updatedAgo}</span>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`h-3 w-3 mr-2 ${loading ? "animate-spin" : ""}`} />
          Обновить
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Tile
          icon={<Users className="w-4 h-4" />}
          color="#3B82F6"
          label="Активных"
          value={funnel?.activeCount ?? 0}
          hint="в работе сейчас"
        />
        <Tile
          icon={<Wallet className="w-4 h-4" />}
          color="#8B5CF6"
          label="В работе"
          value={funnel ? fmt(funnel.sumInWork) : "—"}
          hint="смета без оплаты + остаток комиссии"
        />
        <Tile
          icon={<CheckCircle2 className="w-4 h-4" />}
          color="#16A34A"
          label="Оплачено"
          value={funnel ? fmt(funnel.sumPaid) : "—"}
          hint={funnel ? `комиссия: ${fmt(funnel.expectedCommission)}` : ""}
        />
        <Tile
          icon={<TrendingUp className="w-4 h-4" />}
          color="#0EA5E9"
          label="Доходимость"
          value={`${funnel?.conversionPct ?? 0}%`}
          hint="завершено / всего"
        />
        <Tile
          icon={<AlertTriangle className="w-4 h-4" />}
          color={problems > 0 ? "#DC2626" : "#9CA3AF"}
          label="Требуют внимания"
          value={problems}
          hint="проблемные заказы"
          alert={problems > 0}
        />
      </div>
    </div>
  );
}

interface TileProps {
  icon: React.ReactNode;
  color: string;
  label: string;
  value: number | string;
  hint?: string;
  alert?: boolean;
}

function Tile({ icon, color, label, value, hint, alert }: TileProps) {
  return (
    <div
      className={`rounded-xl border bg-white p-3 transition-shadow hover:shadow-sm ${
        alert ? "border-red-200 ring-1 ring-red-100" : "border-border/60"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-full"
          style={{ backgroundColor: color + "1A", color }}
        >
          {icon}
        </span>
      </div>
      <div className="text-xl font-bold leading-none" style={{ color: alert ? "#DC2626" : undefined }}>
        {value}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground mt-1.5 leading-tight">{hint}</div>}
    </div>
  );
}
