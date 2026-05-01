import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Copy, MapPin, Package, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

async function fetchDetail(id: string) {
  const r = await fetch(`/api/dashboard/action-items/${id}`, { credentials: "include" });
  if (!r.ok) throw new Error("load");
  return r.json();
}

export function ActionItemModal({ id, open, onOpenChange }: { id: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [inlineValue, setInlineValue] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [subAction, setSubAction] = useState<string | null>(null);
  const { data, refetch } = useQuery({ queryKey: ["action-item", id], queryFn: () => fetchDetail(id!), enabled: !!id && open });

  useEffect(() => { if (id) setComment(localStorage.getItem(`action-item-comment-${id}`) ?? ""); }, [id]);
  useEffect(() => { if (id) localStorage.setItem(`action-item-comment-${id}`, comment); }, [id, comment]);
  useEffect(() => { if (!open) { setSubAction(null); setInlineValue(""); setToast(null); } }, [open]);

  const item = data;
  const timeline = useMemo(() => item?.timeline ?? [], [item]);
  const actions = item?.actions ?? [];
  const lastActionBy = item?.lastActionBy ?? null;
  const lastUpdatedAt = item?.updatedAt ?? null;
  const taskUrl = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}?taskId=${id ?? ""}` : "";

  const priorityColor = item?.priority === "critical" ? "bg-red-500" : item?.priority === "high" ? "bg-orange-500" : item?.priority === "medium" ? "bg-blue-500" : "bg-slate-400";
  const badgeColor = item?.priority === "critical" ? "bg-red-100 text-red-700" : item?.priority === "high" ? "bg-orange-100 text-orange-700" : item?.priority === "medium" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700";

  const hoursSince = (createdAt?: string | null) => createdAt ? `${Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 3600000))} ч` : "—";

  const act = async (action: string, payload: Record<string, unknown> = {}) => {
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
    setInlineValue("");
  };

  const renderTypeDetails = () => {
    if (!item) return null;
    const common = (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border p-3">Заказ: <span className="font-medium">{item.orderId ?? "—"}</span></div>
        <div className="rounded-xl border p-3">Мастер: <span className="font-medium">{item.masterId ?? "—"}</span></div>
      </div>
    );

    switch (item.type) {
      case "no_estimate":
        return <div className="space-y-3">{common}<div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm"><div className="rounded-xl border p-3">Часов без сметы: <span className="font-medium">{hoursSince(item.createdAt)}</span></div><div className="rounded-xl border p-3">Ожидаемая комиссия: <span className="font-medium">{item.amountAtRisk ? `${Number(item.amountAtRisk).toLocaleString("ru-RU")} ₽` : "—"}</span></div></div></div>;
      case "no_payment":
        return <div className="space-y-3">{common}<div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm"><div className="rounded-xl border p-3">Клиент: <span className="font-medium">{item.clientId ?? "—"}</span></div><div className="rounded-xl border p-3">Сумма риска: <span className="font-medium">{item.amountAtRisk ? `${Number(item.amountAtRisk).toLocaleString("ru-RU")} ₽` : "—"}</span></div></div></div>;
      case "no_master_response":
        return <div className="space-y-3">{common}<div className="rounded-xl border p-3 text-sm">Нет отклика: <span className="font-medium">{hoursSince(item.createdAt)}</span></div></div>;
      case "blocked_master":
        return <div className="space-y-3 text-sm"><div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div className="rounded-xl border p-3">Мастер: <span className="font-medium">{item.masterId ?? "—"}</span></div><div className="rounded-xl border p-3">Причина блокировки: <span className="font-medium">Блокировка FOMO / blocked</span></div></div><div className="rounded-xl border p-3 md:col-span-2">Проблемный заказ:<div className="mt-2 rounded-lg border bg-slate-50 p-3"><div className="font-medium">{item.orderId ? `Заказ #${item.orderId}` : "—"}</div><div className="text-xs text-muted-foreground">Карточка заказа отображается прямо в popup без перехода.</div></div></div><div className="rounded-xl border p-3">Сколько часов висит: <span className="font-medium">{hoursSince(item.createdAt)}</span></div></div>;
      case "low_avito_balance":
        return <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm"><div className="rounded-xl border p-3">Текущий баланс: <span className="font-medium">{item.amountAtRisk ? `${Number(item.amountAtRisk).toLocaleString("ru-RU")} ₽` : "—"}</span></div><div className="rounded-xl border p-3">Минимальный баланс: <span className="font-medium">1 000 ₽</span></div><div className="rounded-xl border p-3">Средний расход в день: <span className="font-medium">—</span></div></div>;
      case "possible_bypass":
      case "conflict":
        return <div className="space-y-3 text-sm">{common}<div className="rounded-xl border bg-slate-50 p-4"><div className="text-xs uppercase text-muted-foreground mb-1">Краткое описание и риск</div><div className="font-medium">{item.shortDescription ?? "—"}</div><div className="text-sm mt-2">{item.fullDescription ?? "—"}</div></div><div className="rounded-xl border p-3"><div className="font-medium">Последние сообщения / сигналы</div><div className="text-xs text-muted-foreground mt-1">Таймлайн и сигналы приходят из backend-деталей задачи.</div></div></div>;
      default:
        return null;
    }
  };

  const renderInlineAction = () => {
    if (!subAction) return null;
    return (
      <div className="rounded-xl border bg-slate-50 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium">Панель быстрого действия</div>
          <Button variant="ghost" size="sm" onClick={() => setSubAction(null)}>Скрыть</Button>
        </div>
        {subAction === "message_master" && <><div className="text-sm text-muted-foreground">Сообщение уйдёт без перехода со страницы.</div><Textarea value={inlineValue} onChange={(e) => setInlineValue(e.target.value)} placeholder="Введите текст сообщения" className="min-h-[110px]" /><div className="flex gap-2 flex-wrap"><Button onClick={() => act("message_master", { message: inlineValue })} disabled={busy === "message_master" || !inlineValue.trim()}>Отправить сообщение</Button><Button variant="outline" onClick={() => setInlineValue("")}>Очистить</Button></div></>}
        {subAction === "reassign" && <><div className="text-sm text-muted-foreground">Укажите мастера для переназначения.</div><Textarea value={inlineValue} onChange={(e) => setInlineValue(e.target.value)} placeholder="ID мастера или имя" className="min-h-[88px]" /><div className="flex gap-2 flex-wrap"><Button onClick={() => act("reassign", { master: inlineValue })} disabled={busy === "reassign" || !inlineValue.trim()}>Назначить мастера</Button><Button variant="outline" onClick={() => setInlineValue("")}>Очистить</Button></div></>}
        {subAction === "update_balance" && <><div className="text-sm text-muted-foreground">Введите новый баланс Avito и сохраните его.</div><Textarea value={inlineValue} onChange={(e) => setInlineValue(e.target.value)} placeholder="Новый баланс" className="min-h-[88px]" /><div className="flex gap-2 flex-wrap"><Button onClick={() => act("update_balance", { balance: inlineValue })} disabled={busy === "update_balance" || !inlineValue.trim()}>Сохранить баланс</Button><Button variant="outline" onClick={() => setInlineValue("")}>Очистить</Button></div></>}
        {subAction === "cancel_order" && <Button variant="destructive" onClick={() => act("cancel_order")} disabled={busy === "cancel_order"}>Подтвердить отмену заказа</Button>}
        {subAction === "return_to_pool" && <Button onClick={() => act("return_to_pool")} disabled={busy === "return_to_pool"}>Подтвердить возврат в пул</Button>}
        {subAction === "manual_unblock" && <Button variant="destructive" onClick={() => act("manual_unblock")} disabled={busy === "manual_unblock"}>Подтвердить разблокировку</Button>}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[860px] w-[95vw] max-h-[85vh] rounded-[18px] bg-white shadow-xl p-0 overflow-hidden">
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${priorityColor}`} />
        <div className="max-h-[85vh] overflow-y-auto">
          <div className="p-6 pl-7 space-y-5 pr-8">
            <DialogHeader>
              <DialogTitle className="flex items-start gap-3">
                <div className={`mt-0.5 rounded-full p-2 ${badgeColor}`}><AlertTriangle className="w-5 h-5" /></div>
                <div className="min-w-0">
                  <div className="text-base font-semibold text-foreground">{item?.title ?? "Задача"}</div>
                  <div className="mt-2 flex flex-wrap gap-2"><span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${badgeColor}`}>{item?.priority ?? "—"}</span><span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">{item?.status ?? "—"}</span></div>
                </div>
              </DialogTitle>
              <DialogDescription className="mt-2">{item?.shortDescription}</DialogDescription>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={async () => { if (taskUrl) await navigator.clipboard.writeText(taskUrl); setToast("Ссылка на задачу скопирована"); }}><Copy className="w-4 h-4" />Скопировать ссылку на задачу</Button>
              </div>
            </DialogHeader>

            <div className="space-y-4">
              {renderTypeDetails()}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Тип задачи</div><div className="font-medium break-all">{item?.type ?? "—"}</div></div>
                <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Сущность</div><div className="font-medium">{item?.entityType ?? "—"}</div></div>
                <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">ID сущности</div><div className="font-medium break-all">{item?.entityId ?? "—"}</div></div>
                <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Статус</div><div className="font-medium">{item?.status ?? "—"}</div></div>
                <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Город</div><div className="font-medium inline-flex items-center gap-1"><MapPin className="w-4 h-4" />{item?.city ?? "—"}</div></div>
                <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Создано</div><div className="font-medium">{item?.createdAt ? new Date(item.createdAt).toLocaleString("ru-RU") : "—"}</div></div>
                <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Дедлайн</div><div className="font-medium inline-flex items-center gap-1"><Clock className="w-4 h-4" />{item?.deadline ? new Date(item.deadline).toLocaleString("ru-RU") : "—"}</div></div>
                <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Сумма под риском</div><div className="font-medium inline-flex items-center gap-1"><Package className="w-4 h-4" />{item?.amountAtRisk ? `${Number(item.amountAtRisk).toLocaleString("ru-RU")} ₽` : "—"}</div></div>
                <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Последнее обновление</div><div className="font-medium">{lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString("ru-RU") : "—"}</div></div>
                <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Последнее действие</div><div className="font-medium">{lastActionBy ?? "—"}</div></div>
                <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Заказ</div><div className="font-medium">{item?.orderId ?? "—"}</div></div>
                <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Мастер</div><div className="font-medium">{item?.masterId ?? "—"}</div></div>
                <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">Клиент</div><div className="font-medium">{item?.clientId ?? "—"}</div></div>
              </div>

              <div className="rounded-xl border bg-slate-50 p-4 text-sm space-y-2"><div className="text-xs uppercase text-muted-foreground">Полное описание</div><div className="leading-6">{item?.fullDescription}</div></div>

              <div className="rounded-xl border p-4 bg-white">
                <div className="text-sm font-medium mb-3">Быстрые действия</div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSubAction("message_master")}>Написать мастеру</Button>
                  <Button variant="outline" size="sm" onClick={() => setSubAction("reassign")}>Переназначить</Button>
                  <Button variant="outline" size="sm" onClick={() => setSubAction("update_balance")}>Обновить баланс</Button>
                  <Button variant="outline" size="sm" onClick={() => setSubAction("return_to_pool")}>Вернуть в пул</Button>
                  <Button variant="outline" size="sm" onClick={() => setSubAction("manual_unblock")}>Разблокировать</Button>
                </div>
              </div>

              {renderInlineAction()}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Последние события</div>
                  <div className="max-h-44 overflow-y-auto space-y-2 rounded-xl border bg-slate-50 p-2">
                    {timeline.length === 0 ? <div className="text-sm text-muted-foreground p-2">Таймлайн пока пуст</div> : timeline.map((t: any, idx: number) => <div key={idx} className="rounded-lg border bg-white p-2 text-sm"><div className="font-medium">{t.title ?? t.event ?? "Событие"}</div><div className="text-xs text-muted-foreground">{t.at ?? t.createdAt ?? ""}</div></div>)}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Действия</div>
                  <div className="flex flex-wrap gap-2">
                    {actions.map((a: any) => <Button key={a.key} variant={a.style === "primary" ? "default" : a.style === "secondary" ? "secondary" : a.style === "danger" ? "destructive" : "outline"} onClick={() => { if (["message_master", "reassign", "update_balance", "cancel_order", "return_to_pool", "manual_unblock"].includes(a.key)) { setSubAction(a.key); return; } act(a.key); }} disabled={busy === a.key}>{a.label}</Button>)}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button variant="secondary" onClick={() => act("resolve")} disabled={busy === "resolve"}><CheckCircle2 className="w-4 h-4" />Выполнить действие</Button>
                    <Button variant="outline" onClick={() => act("dismiss")} disabled={busy === "dismiss"}>Отложить</Button>
                    <Button variant="ghost" onClick={() => navigator.clipboard.writeText(taskUrl)}><Copy className="w-4 h-4" />Скопировать ссылку</Button>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">Комментарий</div>
                <Textarea value={comment} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setComment(e.target.value)} placeholder="Комментарий к задаче" />
                <div className="text-xs text-muted-foreground mt-2">Комментарий сохраняется локально автоматически.</div>
              </div>
            </div>
          </div>
        </div>

        {toast && <div className="px-6 pb-2 text-sm text-green-700">{toast}</div>}
        <DialogFooter className="gap-2 flex-wrap p-6 pt-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}><X className="w-4 h-4" />Закрыть</Button>
          <Button variant="secondary" onClick={() => act("resolve")} disabled={busy === "resolve"}><CheckCircle2 className="w-4 h-4" />{busy === "resolve" ? "Пометить задачу выполненной" : "Пометить задачу выполненной"}</Button>
          <Button variant="secondary" onClick={() => act("dismiss")} disabled={busy === "dismiss"}>Отложить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
