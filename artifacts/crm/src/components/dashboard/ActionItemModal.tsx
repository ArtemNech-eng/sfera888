import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

async function fetchDetail(id: string) { const r = await fetch(`/api/dashboard/action-items/${id}`, { credentials: "include" }); if (!r.ok) throw new Error("load"); return r.json(); }

export function ActionItemModal({ id, open, onOpenChange }: { id: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [comment, setComment] = useState("");
  const { data, refetch } = useQuery({ queryKey: ["action-item", id], queryFn: () => fetchDetail(id!), enabled: !!id && open });
  useEffect(() => { if (id) setComment(localStorage.getItem(`action-item-comment-${id}`) ?? ""); }, [id]);
  useEffect(() => { if (id) localStorage.setItem(`action-item-comment-${id}`, comment); }, [id, comment]);
  const item = data;

  const act = async (action: string) => { if (!id) return; await fetch(`/api/dashboard/action-items/${id}/action`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload: { comment } }) }); await refetch(); };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-[820px] max-h-[85vh] overflow-y-auto rounded-[18px]"><DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-primary" />{item?.title ?? "Задача"}</DialogTitle><DialogDescription>{item?.shortDescription}</DialogDescription></DialogHeader><div className="space-y-4"><div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm"><div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Приоритет</div><div className="font-medium">{item?.priority}</div></div><div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Статус</div><div className="font-medium">{item?.status}</div></div><div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Дедлайн</div><div className="font-medium inline-flex items-center gap-1"><Clock className="w-4 h-4" />{item?.deadline ?? "—"}</div></div></div><div className="rounded-xl border bg-slate-50 p-4 text-sm"><div className="text-xs uppercase text-muted-foreground mb-1">Описание</div><div>{item?.fullDescription}</div></div><Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Комментарий к задаче" /></div><DialogFooter className="gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}><X className="w-4 h-4" />Закрыть</Button><Button onClick={() => act("resolve")}><CheckCircle2 className="w-4 h-4" />Пометить выполненной</Button><Button variant="secondary" onClick={() => act("dismiss")}>Отложить</Button></DialogFooter></DialogContent></Dialog>;
}