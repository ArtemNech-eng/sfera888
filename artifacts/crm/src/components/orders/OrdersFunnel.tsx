import { useMemo } from "react";
import { Wallet, CheckCircle2, TrendingUp, AlertTriangle, RefreshCw } from "lucide-react";
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
 * 5-tile funnel summary. Lives directly under the folder tabs and refreshes
 * via the SSE stream that the parent workspace subscribes to.
 */
export default function OrdersFunnel({ funnel, updatedAt, loading, onRefresh }: Props) {
  const updatedAgo = useMemo(() => {
    if (!updatedAt) return "—";
    const sec = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
    if (sec < 60) return `${sec}с назад`;
    return `${Math.floor(sec / 60)}м назад`;
  }, [updatedAt]);

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Tile
          label="Активных"
          value={funnel?.activeCount ?? 0}
          hint={`обновлено ${updatedAgo}`}
        />
        <Tile
          icon={<Wallet className="w-3 h-3" />}
          label="В работе"
          value={funnel ? fmt(funnel.sumInWork) : "—"}
          tone="violet"
          hint="смета без оплаты + остаток комиссии"
        />
        <Tile
          icon={<CheckCircle2 className="w-3 h-3 text-emerald-500" />}
          label="Оплачено"
          value={funnel ? fmt(funnel.sumPaid) : "—"}
          tone="emerald"
          hint={funnel ? `комиссия: ${fmt(funnel.expectedCommission)}` : ""}
        />
        <Tile
          icon={<TrendingUp className="w-3 h-3" />}
          label="Доходимость"
          value={`${funnel?.conversionPct ?? 0}%`}
          hint="завершено / в работе"
        />
        <Tile
          icon={<AlertTriangle className={`w-3 h-3 ${(funnel?.problemCount ?? 0) > 0 ? "text-red-500" : ""}`} />}
          label="Требуют тебя"
          value={funnel?.problemCount ?? 0}
          tone={(funnel?.problemCount ?? 0) > 0 ? "red" : undefined}
          hint="проблемные"
        />
      </div>
      <div className="mt-3 pt-3 border-t border-border/30 flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`h-3 w-3 mr-2 ${loading ? "animate-spin" : ""}`} />
          Обновить
        </Button>
      </div>
    </div>
  );
}

interface TileProps {
  icon?: React.ReactNode;
  label: string;
  value: number | string;
  hint?: string;
  tone?: "violet" | "emerald" | "red";
}

function Tile({ icon, label, value, hint, tone }: TileProps) {
  const valueClass =
    tone === "violet" ? "text-violet-700"
    : tone === "emerald" ? "text-emerald-700"
    : tone === "red" ? "text-red-600"
    : "text-foreground";
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className={`text-xl font-bold mt-1 ${valueClass}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}
