import { useState } from "react";
import { TrendingUp, Loader2, Play, Database } from "lucide-react";

/**
 * CRM-карточка «Реальные цены» (spec: .kiro/specs/real-price). Админ одним кликом
 * импортирует исторические сметы в базу цен и пересчитывает агрегаты — backfill
 * выполняется на сервере (POST /api/real-price/backfill), где доступна БД.
 */
interface BackfillReport {
  apply: boolean;
  completedOrders: number;
  receipts: number;
  lineItems: number;
  matched: number;
  unmatched: number;
  topUnmatched: { description: string; count: number }[];
  pointsBuilt: number;
  pointsWritten?: number;
  aggregates?: { points: number; aggregates: number; indexable: number };
}

export function RealPriceCard() {
  const [loading, setLoading] = useState<null | "dry" | "apply">(null);
  const [report, setReport] = useState<BackfillReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(apply: boolean) {
    setLoading(apply ? "apply" : "dry");
    setError(null);
    try {
      const r = await fetch("/api/real-price/backfill", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) setError("Не удалось выполнить. Нужны права администратора.");
      else setReport(d.report as BackfillReport);
    } catch {
      setError("Сеть недоступна, попробуйте позже.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-6 border-b border-border/50">
        <div className="p-2 bg-rose-500/10 rounded-xl">
          <TrendingUp className="w-5 h-5 text-rose-500" />
        </div>
        <div>
          <h2 className="font-display font-bold text-lg">Реальные цены</h2>
          <p className="text-sm text-muted-foreground">
            Импорт исторических смет в базу цен и пересчёт агрегатов для страниц /ceny
          </p>
        </div>
      </div>
      <div className="p-6 space-y-4">
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => run(false)}
            disabled={!!loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            {loading === "dry" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Сухой прогон
          </button>
          <button
            onClick={() => run(true)}
            disabled={!!loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading === "apply" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            Импортировать в цены
          </button>
        </div>

        {error ? <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-sm">{error}</div> : null}

        {report ? (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-sm space-y-1.5">
            <div>
              Завершённых заказов: <b>{report.completedOrders}</b> · смет: <b>{report.receipts}</b>
            </div>
            <div>
              Позиций: <b>{report.lineItems}</b> · сопоставлено: <b>{report.matched}</b> · не распознано:{" "}
              <b>{report.unmatched}</b>
            </div>
            <div>
              Ценовых точек: <b>{report.pointsBuilt}</b>
              {report.apply && report.aggregates ? (
                <> · записано; агрегатов: <b>{report.aggregates.aggregates}</b> (индексируемых: {report.aggregates.indexable})</>
              ) : (
                <> · <i>сухой прогон, ничего не записано</i></>
              )}
            </div>
            {report.topUnmatched.length > 0 ? (
              <div className="pt-2">
                <div className="text-muted-foreground mb-1.5">Не распознаны (добавьте синонимы в словарь):</div>
                <div className="flex flex-wrap gap-1.5">
                  {report.topUnmatched.map((u, i) => (
                    <span key={i} className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs">
                      {u.count}× {u.description}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
