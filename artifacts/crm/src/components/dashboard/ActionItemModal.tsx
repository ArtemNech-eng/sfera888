import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Copy, MapPin, Package, ShieldAlert, UserRoundPen, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

async function fetchDetail(id: string) {
  const r = await fetch(`/api/dashboard/action-items/${id}`, { credentials: "include" });
  if (!r.ok) throw new Error("load");
  return r.json();
}

type SubAction = "message_master" | "reassign" | "update_balance" | "cancel_order" | "return_to_pool" | "manual_unblock" | null;

type MasterOption = { id: string; name: string; city?: string | null; activeOrders?: number };

export function ActionItemModal({ id, open, onOpenChange }: { id: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [subAction, setSubAction] = useState<SubAction>(null);
  const [message, setMessage] = useState("");
  const [masterQuery, setMasterQuery] = useState("");
  const [masterId, setMasterId] = useState("");
  const [balance, setBalance] = useState("");
  const [confirmTyped, setConfirmTyped] = useState("");
  const { data, refetch } = useQuery({ queryKey: ["action-item", id], queryFn: () => fetchDetail(id!), enabled: !!id && open });

  useEffect(() => { if (id) setComment(localStorage.getItem(`action-item-comment-${id}`) ?? ""); }, [id]);
  useEffect(() => { if (id) localStorage.setItem(`action-item-comment-${id}`, comment); }, [id, comment]);
  useEffect(() => { if (!open) { setSubAction(null); setToast(null); setMessage(""); setMasterQuery(""); setMasterId(""); setBalance(""); setConfirmTyped(""); } }, [open]);

  const item = data;
  const timeline = useMemo(() => item?.timeline ?? [], [item]);
  const actions = item?.actions ?? [];
  const lastUpdatedAt = item?.updatedAt ?? null;
  const taskUrl = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}?taskId=${id ?? ""}` : "";
  const masters: MasterOption[] = (data?.availableMasters ?? []) as MasterOption[];
  const filteredMasters = masters.filter((m) => `${m.id} ${m.name} ${m.city ?? ""}`.toLowerCase().includes(masterQuery.toLowerCase()));

  const priorityColor = item?.priority === "critical" ? "bg-red-500" : item?.priority === "high" ? "bg-orange-500" : item?.priority === "medium" ? "bg-blue-500" : "bg-slate-400";
  const badgeColor = item?.priority === "critical" ? "bg-red-100 text-red-700" : item?.priority === "high" ? "bg-orange-100 text-orange-700" : item?.priority === "medium" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700";

  const fire = async (action: string, payload: Record<string, unknown> = {}) => {
    if (!id) return;
    setBusy(action);
    await fetch(`/api/dashboard/action-items/${id}/action`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload: { comment, ...payload } }),
    });
    await refetch();
    window.dispatchEvent(new CustomEvent("dashboard-action-items:changed"));
    setToast("Действие выполнено");
    setTimeout(() => setToast(null), 1800);
    setBusy(null);
    setSubAction(null);
    setMessage("");
    setMasterQuery("");
    setMasterId("");
    setBalance("");
    setConfirmTyped("");
  };

  const quickActions = [
    { key: "message_master", label: "Написать мастеру" },
    { key: "reassign", label: "Переназначить" },
    { key: "update_balance", label: "Обновить баланс" },
    { key: "cancel_order", label: "Отменить заказ" },
    { key: "return_to_pool", label: "Вернуть в пул" },
    { key: "manual_unblock", label: "Разблокировать мастера" },
  ] as const;

  const renderActionPanel = () => {
    if (!subAction) return null;
    return (
      <div className="rounded-xl border bg-slate-50 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium">Панель действия</div>
          <Button variant="ghost" size="sm" onClick={() => setSubAction(null)}>Скрыть</Button>
        </div>

        {subAction === "message_master" && (
          <>
            <div className="text-sm text-muted-foreground">Мини-форма сообщения прямо в popup.</div>
            <Textarea value={message} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)} placeholder="Введите текст сообщения" className="min-h-[110px]" />
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => fire("message_master", { message })} disabled={busy === "message_master" || !message.trim()}>Отправить сообщение</Button>
              <Button variant="outline" onClick={() => setMessage("")}>Очистить</Button>
            </div>
          </>
        )}

        {subAction === "reassign" && (
          <>
            <div className="text-sm text-muted-foreground">Mini selector мастеров в popup.</div>
            <Input value={masterQuery} onChange={(e: ChangeEvent<HTMLInputElement>) => setMasterQuery(e.target.value)} placeholder="Поиск по ID, имени или городу" />
            <div className="max-h-44 overflow-y-auto rounded-xl border bg-white p-2 space-y-2">
              {filteredMasters.slice(0, 10).map((m) => (
                <button key={m.id} className={`w-full text-left rounded-lg border px-3 py-2 text-sm ${masterId === m.id ? "border-[#34C759] bg-[#E8F9EE]" : "hover:bg-slate-50"}`} onClick={() => setMasterId(m.id)}>
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-muted-foreground">ID: {m.id}{m.city ? ` · ${m.city}` : ""}</div>
                </button>
              ))}
            </div>
            <Input value={masterId} onChange={(e: ChangeEvent<HTMLInputElement>) => setMasterId(e.target.value)} placeholder="Либо введите мастер ID вручную" />
            <Button onClick={() => fire("reassign", { master: masterId })} disabled={busy === "reassign" || !masterId.trim()}>Назначить мастера</Button>
          </>
        )}

        {subAction === "update_balance" && (
          <>
            <div className="text-sm text-muted-foreground">Input + save прямо в popup.</div>
            <Input value={balance} onChange={(e: ChangeEvent<HTMLInputElement>) => setBalance(e.target.value)} placeholder="Новый баланс" />
            <Button onClick={() => fire("update_balance", { balance })} disabled={busy === "update_balance" || !balance.trim()}>Сохранить баланс</Button>
          </>
        )}

        {subAction === "cancel_order" && (
          <>
            <div className="text-sm text-muted-foreground">Confirm прямо в popup.</div>
            <Input value={confirmTyped} onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmTyped(e.target.value)} placeholder='Введите слово ОТМЕНИТЬ' />
            <Button variant="destructive" onClick={() => fire("cancel_order")} disabled={busy === "cancel_order" || confirmTyped.trim().toUpperCase() !== "ОТМЕНИТЬ"}>Подтвердить отмену заказа</Button>
          </>
        )}

        {subAction === "return_to_pool" && (
          <Button onClick={() => fire("return_to_pool")} disabled={busy === "return_to_pool"}>Подтвердить возврат в пул</Button>
        )}

        {subAction === "manual_unblock" && (
          <Button variant="destructive" onClick={() => fire("manual_unblock")} disabled={busy === "manual_unblock"}>Подтвердить разблокировку</Button>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[920px] w-[95vw] max-h-[85vh] rounded-[18px] bg-white shadow-xl p-0 overflow-hidden">
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${priorityColor}`} />
        <div className="max-h-[85vh] overflow-y-auto">
          <div className="p-6 pl-7 space-y-5 pr-8">
            <DialogHeader>
              <DialogTitle className="flex items-start gap-3">
                <div className={`mt-0.5 rounded-full p-2 ${badgeColor}`}><AlertTriangle className="w-5 h-5" /></div>
                <div className="min-w-0">
                  <div className="text-base font-semibold text-foreground">{item?.title ?? "Задача"}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${badgeColor}`}>{item?.priority ?? "—"}</span>
                    <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">{item?.status ?? "—"}</span>
                  </div>
                </div>
              </DialogTitle>
              <DialogDescription className="mt-2">{item?.shortDescription}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={async () => { if (taskUrl) await navigator.clipboard.writeText(taskUrl); setToast("Ссылка на задачу скопирована"); }}><Copy className="w-4 h-4" />Скопировать ссылку</Button>
            </div>

            <div className="rounded-xl border bg-white p-4">
              <div className="text-sm font-medium mb-3">Быстрые действия</div>
              <div className="flex flex-wrap gap-2">
                {quickActions.map((a) => <Button key={a.key} variant="outline" size="sm" onClick={() => setSubAction(a.key)}>{a.label}</Button>)}
              </div>
            </div>

            {renderActionPanel()}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium mb-2">Последние события</div>
                <div className="max-h-44 overflow-y-auto space-y-2 rounded-xl border bg-slate-50 p-2">
                  {timeline.length === 0 ? <div className="text-sm text-muted-foreground p-2">Таймлайн пока пуст</div> : timeline.map((t: any, idx: number) => <div key={idx} className="rounded-lg border bg-white p-2 text-sm"><div className="font-medium">{t.title ?? t.event ?? "Событие"}</div></div>)}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-2">Действия</div>
                <div className="flex flex-wrap gap-2">
                  {actions.map((a: any) => (
                    <Button key={a.key} variant={a.style === "danger" ? "destructive" : "outline"} onClick={() => ["message_master", "reassign", "update_balance", "cancel_order", "return_to_pool", "manual_unblock"].includes(a.key) ? setSubAction(a.key as SubAction) : fire(a.key)} disabled={busy === a.key}>{a.label}</Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-slate-50 p-4 text-sm space-y-2">
              <div className="text-xs uppercase text-muted-foreground">Ключевые сведения</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Field label="Тип" value={item?.type ?? "—"} />
                <Field label="Город" value={item?.city ?? "—"} />
                <Field label="Заказ" value={item?.orderId ?? "—"} />
                <Field label="Последнее обновление" value={lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString("ru-RU") : "—"} />
              </div>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Комментарий</div>
              <Textarea value={comment} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setComment(e.target.value)} placeholder="Комментарий к задаче" />
            </div>
          </div>
        </div>

        {toast && <div className="px-6 pb-2 text-sm text-green-700">{toast}</div>}
        <DialogFooter className="gap-2 flex-wrap p-6 pt-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}><X className="w-4 h-4" />Закрыть</Button>
          <Button variant="secondary" onClick={() => fire("resolve")} disabled={busy === "resolve"}><CheckCircle2 className="w-4 h-4" />{busy === "resolve" ? "Завершаем..." : "Пометить выполненной"}</Button>
          <Button variant="secondary" onClick={() => fire("dismiss")} disabled={busy === "dismiss"}>Отложить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium break-words mt-1">{value}</div></div>;
}
