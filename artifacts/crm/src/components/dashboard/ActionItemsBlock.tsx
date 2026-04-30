import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Filter, Search, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionItemModal } from "./ActionItemModal";

type Priority = "critical" | "high" | "medium" | "low";
type Item = { id: string; type: string; priority: Priority; title: string; shortDescription: string; fullDescription: string; createdAt: string; deadline: string | null; status: string; entityType: string; entityId: string | number | null; orderId: string | number | null; masterId: string | number | null; clientId: string | number | null; city: string | null; amountAtRisk: number | null; actions: { key: string; label: string; style: string }[] };

const pOrder: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const pill: Record<Priority, string> = { critical: "bg-red-100 text-red-700", high: "bg-orange-100 text-orange-700", medium: "bg-blue-100 text-blue-700", low: "bg-slate-100 text-slate-700" };

async function fetcher() { const r = await fetch("/api/dashboard/action-items", { credentials: "include" }); if (!r.ok) throw new Error("load"); return r.json(); }

function Card({ item, onOpen }: { item: Item; onOpen: (id: string) => void }) {
  return <button onClick={() => onOpen(item.id)} className={`w-full text-left rounded-xl border p-3 bg-white hover:shadow-sm transition ${item.priority === "critical" ? "border-red-200 bg-red-50/40" : "border-slate-200"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2 mb-1"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${pill[item.priority]}`}>{item.priority}</span><span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Clock className="w-3 h-3" />{item.deadline ? new Date(item.deadline).toLocaleString("ru-RU") : "без дедлайна"}</span></div><div className="font-medium text-sm text-foreground line-clamp-2">{item.title}</div><div className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.shortDescription}</div></div><ChevronRight className="w-4 h-4 text-muted-foreground mt-1 shrink-0" /></div></button>;
}

export function ActionItemsBlock() {
  const [priority, setPriority] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading, refetch } = useQuery({ queryKey: ["action-items"], queryFn: fetcher, refetchInterval: 15000 });
  const items: Item[] = data?.items ?? [];
  const summary = data?.summary ?? { critical: 0, high: 0, medium: 0, low: 0, doneToday: 0 };
  const filtered = useMemo(() => items.filter(i => (priority === "all" || i.priority === priority) && (search === "" || `${i.title} ${i.orderId ?? ""} ${i.masterId ?? ""}`.toLowerCase().includes(search.toLowerCase()))).slice(0, 6), [items, priority, search]);

  return <section className="bg-white rounded-2xl border shadow-sm p-5"><div className="flex items-start justify-between gap-3 mb-4"><div><h2 className="text-base font-bold text-foreground">Что делать сейчас</h2><p className="text-xs text-muted-foreground">Задачи, требующие вашего действия</p></div><div className="flex gap-2 flex-wrap"><span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700">Критичные {summary.critical}</span><span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-700">Высокий {summary.high}</span><span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700">В работе {summary.medium}</span><span className="px-2 py-1 text-xs rounded-full bg-slate-100 text-slate-700">Выполнено сегодня {summary.doneToday}</span></div></div><div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4"><div className="relative"><Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" /><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по задаче, заказу, мастеру" className="pl-9" /></div><div className="flex gap-2 flex-wrap"><Button variant={priority === "all" ? "default" : "outline"} size="sm" onClick={() => setPriority("all")}><Filter className="w-4 h-4" />Все</Button><Button variant={priority === "critical" ? "default" : "outline"} size="sm" onClick={() => setPriority("critical")}>Критичные</Button><Button variant={priority === "high" ? "default" : "outline"} size="sm" onClick={() => setPriority("high")}>Высокие</Button><Button variant={priority === "medium" ? "default" : "outline"} size="sm" onClick={() => setPriority("medium")}>Средние</Button><Button variant={priority === "low" ? "default" : "outline"} size="sm" onClick={() => setPriority("low")}>Низкие</Button></div></div>{isLoading ? <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}</div> : filtered.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground"><CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-green-600" />Нет задач</div> : <div className="space-y-2">{filtered.map(item => <Card key={item.id} item={item} onOpen={setOpenId} />)}</div>}<div className="mt-4 flex justify-end"><Button variant="outline" size="sm" onClick={() => refetch()}>Обновить</Button></div><ActionItemModal id={openId} open={!!openId} onOpenChange={(o) => !o && setOpenId(null)} /></section>;
}