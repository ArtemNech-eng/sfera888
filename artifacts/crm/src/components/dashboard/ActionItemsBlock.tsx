import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionItemModal } from "./ActionItemModal";
import { ActionItemCard } from "./ActionItemCard";

type Priority = "critical" | "high" | "medium" | "low";
type Item = {
  id: string;
  type: string;
  priority: Priority;
  title: string;
  shortDescription: string;
  fullDescription: string;
  createdAt: string;
  deadline: string | null;
  status: string;
  entityType: string;
  entityId: string | number | null;
  orderId: string | number | null;
  masterId: string | number | null;
  clientId: string | number | null;
  city: string | null;
  amountAtRisk: number | null;
  assigneeId?: string | number | null;
  assigneeName?: string | null;
  actions: { key: string; label: string; style: string }[];
};

const FILTERS = [
  { key: "all", label: "Все" },
  { key: "critical", label: "Критичные" },
  { key: "orders", label: "Заказы" },
  { key: "masters", label: "Мастера" },
  { key: "finance", label: "Финансы" },
  { key: "system", label: "Системные" },
] as const;

async function fetcher(period: string) {
  const q = new URLSearchParams();
  if (period && period !== "all") q.set("period", period);
  const r = await fetch(`/api/dashboard/action-items${q.toString() ? `?${q.toString()}` : ""}`, { credentials: "include" });
  if (!r.ok) throw new Error("load");
  return r.json();
}

export function ActionItemsBlock() {
  const [period, setPeriod] = useState<string>("all");
  const [scope, setScope] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [myOnly, setMyOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const currentUserId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["action-items", period],
    queryFn: () => fetcher(period),
    refetchInterval: 15000,
  });

  const items: Item[] = data?.items ?? [];
  const summary = data?.summary ?? { critical: 0, high: 0, medium: 0, low: 0, doneToday: 0 };

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("taskId");
    if (id) setOpenId(id);
  }, []);

  const filtered = useMemo(() => {
    const ranked = items
      .filter((i) => scope === "all" || i.entityType === scope || (scope === "finance" && i.type.includes("payment")))
      .filter((i) => !myOnly || !currentUserId || String(i.assigneeId ?? "") === String(currentUserId))
      .filter((i) => search.trim() === "" || `${i.title} ${i.shortDescription} ${i.orderId ?? ""} ${i.masterId ?? ""} ${i.entityId ?? ""}`.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        const p = { critical: 0, high: 1, medium: 2, low: 3 };
        const pDiff = p[a.priority] - p[b.priority];
        if (pDiff !== 0) return pDiff;
        const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
        const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
        if (aDeadline !== bDeadline) return aDeadline - bDeadline;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    return ranked;
  }, [items, scope, myOnly, currentUserId, search]);

  return (
    <section className="bg-white rounded-2xl border shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-foreground">Что делать сейчас</h2>
          <p className="text-xs text-muted-foreground">Задачи, требующие вашего действия</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700">Критичные {summary.critical}</span>
          <span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-700">Высокий {summary.high}</span>
          <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700">Средние {summary.medium}</span>
          <span className="px-2 py-1 text-xs rounded-full bg-slate-100 text-slate-700">Выполнено сегодня {summary.doneToday}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="relative md:col-span-1">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={search} onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)} placeholder="Поиск по названию, заказу или мастеру" className="pl-9" />
        </div>
        <div className="flex gap-2 flex-wrap md:col-span-2">
          {FILTERS.map((f) => (
            <Button key={f.key} variant={scope === f.key ? "default" : "outline"} size="sm" onClick={() => setScope(f.key)}>
              <Filter className="w-4 h-4" />
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Button variant={period === "all" ? "default" : "outline"} size="sm" onClick={() => setPeriod("all")}>Все периоды</Button>
        <Button variant={myOnly ? "default" : "outline"} size="sm" onClick={() => setMyOnly((v: boolean) => !v)}>{myOnly ? "Только мои" : "Все задачи"}</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground space-y-2">
          <CheckCircle2 className="w-6 h-6 mx-auto text-green-600" />
          <div>{scope === "critical" ? "Нет критичных задач" : "Нет задач"}</div>
          <div className="text-xs">{summary.critical === 0 ? "Все критичные задачи выполнены" : "Попробуйте изменить фильтры"}</div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, 6).map((item: Item) => (
            <ActionItemCard item={item} onOpen={setOpenId} />
          ))}
          {filtered.length > 6 && (
            <div className="pt-2 flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setScope("all")}>Показать все</Button>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Button variant="outline" size="sm" onClick={() => refetch()}>Обновить</Button>
      </div>

      <ActionItemModal id={openId} open={!!openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </section>
  );
}
