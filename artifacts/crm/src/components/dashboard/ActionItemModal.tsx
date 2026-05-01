import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, Clock, Copy, MapPin, Package, ShieldAlert,
  UserRoundPen, X, Banknote, TriangleAlert, CircleDot, Wrench, RefreshCw,
  PhoneCall, MessageSquare, UserX, BadgeAlert, Settings,
} from "lucide-react";
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

const PRIORITY_RU: Record<string, string> = {
  critical: "Критично",
  high: "Высокий приоритет",
  medium: "Средний приоритет",
  low: "Низкий приоритет",
};

const STATUS_RU: Record<string, string> = {
  open: "Открыта",
  in_progress: "В работе",
  done: "Выполнена",
  dismissed: "Отложена",
};

const TYPE_ICON: Record<string, ReactNode> = {
  no_estimate: <Wrench className="w-5 h-5" />,
  no_payment: <Banknote className="w-5 h-5" />,
  no_master_response: <MessageSquare className="w-5 h-5" />,
  no_progress: <Clock className="w-5 h-5" />,
  low_avito_balance: <TriangleAlert className="w-5 h-5" />,
  blocked_master: <UserX className="w-5 h-5" />,
  possible_bypass: <ShieldAlert className="w-5 h-5" />,
  conflict: <BadgeAlert className="w-5 h-5" />,
  no_manager_id: <UserRoundPen className="w-5 h-5" />,
  custom_manual: <Settings className="w-5 h-5" />,
};

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

  const { data, refetch } = useQuery({
    queryKey: ["action-item", id],
    queryFn: () => fetchDetail(id!),
    enabled: !!id && open,
  });

  useEffect(() => { if (id) setComment(localStorage.getItem(`action-item-comment-${id}`) ?? ""); }, [id]);
  useEffect(() => { if (id) localStorage.setItem(`action-item-comment-${id}`, comment); }, [id, comment]);
  useEffect(() => {
    if (!open) {
      setSubAction(null); setToast(null); setMessage("");
      setMasterQuery(""); setMasterId(""); setBalance(""); setConfirmTyped("");
    }
  }, [open]);

  const item = data;
  const timeline = useMemo(() => item?.timeline ?? [], [item]);
  const actions: { key: string; label: string; style: string }[] = item?.actions ?? [];
  const lastUpdatedAt = item?.updatedAt ?? null;
  const taskUrl = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}?taskId=${id ?? ""}` : "";
  const masters: MasterOption[] = (data?.availableMasters ?? []) as MasterOption[];
  const filteredMasters = masters.filter((m) =>
    `${m.id} ${m.name} ${m.city ?? ""}`.toLowerCase().includes(masterQuery.toLowerCase())
  );

  const priorityColor =
    item?.priority === "critical" ? "bg-red-500" :
    item?.priority === "high" ? "bg-orange-500" :
    item?.priority === "medium" ? "bg-blue-500" : "bg-slate-400";

  const badgeColor =
    item?.priority === "critical" ? "bg-red-100 text-red-700" :
    item?.priority === "high" ? "bg-orange-100 text-orange-700" :
    item?.priority === "medium" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700";

  const fire = async (action: string, payload: Record<string, unknown> = {}) => {
    if (!id) return;
    setBusy(action);
    try {
      await fetch(`/api/dashboard/action-items/${id}/action`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload: { comment, ...payload } }),
      });
      await refetch();
      window.dispatchEvent(new CustomEvent("dashboard-action-items:changed"));
      setToast("Действие выполнено");
      setTimeout(() => setToast(null), 2500);
    } catch {
      setToast("Ошибка при выполнении действия");
      setTimeout(() => setToast(null), 2500);
    } finally {
      setBusy(null);
      setSubAction(null);
      setMessage(""); setMasterQuery(""); setMasterId(""); setBalance(""); setConfirmTyped("");
    }
  };

  const DANGEROUS_SUB_ACTIONS = ["cancel_order", "return_to_pool", "manual_unblock", "reassign"];

  const handleActionClick = (key: string) => {
    if (["message_master", ...DANGEROUS_SUB_ACTIONS, "update_balance"].includes(key)) {
      setSubAction(key as SubAction);
    } else {
      fire(key);
    }
  };

  const renderActionPanel = () => {
    if (!subAction) return null;
    return (
      <div className="rounded-xl border bg-slate-50 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold">
            {subAction === "message_master" && "Написать мастеру"}
            {subAction === "reassign" && "Переназначить мастера"}
            {subAction === "update_balance" && "Обновить баланс Avito"}
            {subAction === "cancel_order" && "Отмена заказа"}
            {subAction === "return_to_pool" && "Вернуть заказ в пул"}
            {subAction === "manual_unblock" && "Разблокировать мастера вручную"}
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setSubAction(null); setConfirmTyped(""); }}>
            <X className="w-4 h-4" /> Скрыть
          </Button>
        </div>

        {subAction === "message_master" && (
          <>
            <Textarea
              value={message}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
              placeholder="Введите текст сообщения для мастера"
              className="min-h-[110px]"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => fire("message_master", { message })}
                disabled={busy === "message_master" || !message.trim()}
              >
                <MessageSquare className="w-4 h-4" /> Отправить
              </Button>
              <Button variant="outline" onClick={() => setMessage("")}>Очистить</Button>
            </div>
          </>
        )}

        {subAction === "reassign" && (
          <>
            <Input
              value={masterQuery}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setMasterQuery(e.target.value)}
              placeholder="Поиск по ID, имени или городу"
            />
            {filteredMasters.length > 0 && (
              <div className="max-h-44 overflow-y-auto rounded-xl border bg-white p-2 space-y-2">
                {filteredMasters.slice(0, 10).map((m) => (
                  <button
                    key={m.id}
                    className={`w-full text-left rounded-lg border px-3 py-2 text-sm ${masterId === m.id ? "border-green-500 bg-green-50" : "hover:bg-slate-50"}`}
                    onClick={() => setMasterId(m.id)}
                  >
                    <div className="font-medium">{m.name}</div>
                    <div className="text-xs text-muted-foreground">ID: {m.id}{m.city ? ` · ${m.city}` : ""}</div>
                  </button>
                ))}
              </div>
            )}
            <Input
              value={masterId}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setMasterId(e.target.value)}
              placeholder="ID мастера вручную"
            />
            <Button
              onClick={() => fire("reassign", { master: masterId })}
              disabled={busy === "reassign" || !masterId.trim()}
            >
              Назначить мастера
            </Button>
          </>
        )}

        {subAction === "update_balance" && (
          <>
            <div className="text-sm text-muted-foreground">Введите новый баланс Avito в рублях.</div>
            <Input
              value={balance}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setBalance(e.target.value)}
              placeholder="Например: 5000"
              type="number"
            />
            <Button
              onClick={() => fire("update_balance", { balance: Number(balance) })}
              disabled={busy === "update_balance" || !balance.trim()}
            >
              Сохранить баланс
            </Button>
          </>
        )}

        {subAction === "cancel_order" && (
          <>
            <div className="text-sm text-muted-foreground text-red-700">
              Это действие отменит заказ. Введите слово <strong>ОТМЕНИТЬ</strong> для подтверждения.
            </div>
            <Input
              value={confirmTyped}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmTyped(e.target.value)}
              placeholder="ОТМЕНИТЬ"
            />
            <Button
              variant="destructive"
              onClick={() => fire("cancel_order")}
              disabled={busy === "cancel_order" || confirmTyped.trim().toUpperCase() !== "ОТМЕНИТЬ"}
            >
              Подтвердить отмену заказа
            </Button>
          </>
        )}

        {subAction === "return_to_pool" && (
          <>
            <div className="text-sm text-muted-foreground">Заказ будет возвращён в пул и снова станет доступен для назначения.</div>
            <Button
              onClick={() => fire("return_to_pool")}
              disabled={busy === "return_to_pool"}
            >
              <RefreshCw className="w-4 h-4" /> Подтвердить возврат в пул
            </Button>
          </>
        )}

        {subAction === "manual_unblock" && (
          <>
            <div className="text-sm text-muted-foreground text-orange-700">
              Мастер будет разблокирован вручную. Убедитесь, что проблема решена.
            </div>
            <Button
              variant="destructive"
              onClick={() => fire("manual_unblock")}
              disabled={busy === "manual_unblock"}
            >
              Подтвердить разблокировку
            </Button>
          </>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[920px] w-[95vw] max-h-[85vh] rounded-[18px] bg-white shadow-xl p-0 overflow-hidden">
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-[18px] ${priorityColor}`} />

        <div className="max-h-[85vh] overflow-y-auto">
          <div className="p-6 pl-8 pr-8 space-y-5">

            {/* Шапка */}
            <DialogHeader>
              <div className="flex items-start justify-between gap-3">
                <DialogTitle className="flex items-start gap-3">
                  <div className={`mt-0.5 rounded-full p-2 ${badgeColor} shrink-0`}>
                    {TYPE_ICON[item?.type ?? ""] ?? <AlertTriangle className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-foreground">{item?.title ?? "Задача"}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${badgeColor}`}>
                        {PRIORITY_RU[item?.priority ?? ""] ?? item?.priority}
                      </span>
                      <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                        {STATUS_RU[item?.status ?? ""] ?? item?.status}
                      </span>
                    </div>
                  </div>
                </DialogTitle>
              </div>
              {item?.shortDescription && (
                <DialogDescription className="mt-2 text-sm">{item.shortDescription}</DialogDescription>
              )}
            </DialogHeader>

            {/* Полное описание */}
            {item?.fullDescription && item.fullDescription !== item?.shortDescription && (
              <div className="rounded-xl border bg-slate-50 p-4 text-sm text-foreground leading-relaxed">
                {item.fullDescription}
              </div>
            )}

            {/* Ключевые сведения */}
            <div className="rounded-xl border bg-white p-4">
              <div className="text-xs uppercase text-muted-foreground mb-3 font-medium">Сведения по задаче</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                {item?.orderId != null && (
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Заказ:</span>
                    <span className="font-medium">#{item.orderId}</span>
                  </div>
                )}
                {item?.masterId != null && (
                  <div className="flex items-center gap-2">
                    <UserRoundPen className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Мастер:</span>
                    <span className="font-medium">#{item.masterId}</span>
                  </div>
                )}
                {item?.clientId != null && (
                  <div className="flex items-center gap-2">
                    <CircleDot className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Клиент:</span>
                    <span className="font-medium">#{item.clientId}</span>
                  </div>
                )}
                {item?.city && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Город:</span>
                    <span className="font-medium">{item.city}</span>
                  </div>
                )}
                {item?.amountAtRisk != null && (
                  <div className="flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Под риском:</span>
                    <span className="font-semibold text-red-700">{Number(item.amountAtRisk).toLocaleString("ru-RU")} ₽</span>
                  </div>
                )}
                {item?.deadline && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Дедлайн:</span>
                    <span className="font-medium">{new Date(item.deadline).toLocaleString("ru-RU")}</span>
                  </div>
                )}
                {lastUpdatedAt && (
                  <div className="flex items-center gap-2 col-span-2 md:col-span-1">
                    <RefreshCw className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Обновлено:</span>
                    <span className="font-medium">{new Date(lastUpdatedAt).toLocaleString("ru-RU")}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Кнопки копирования ссылки */}
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={async () => {
                if (taskUrl) await navigator.clipboard.writeText(taskUrl).catch(() => {});
                setToast("Ссылка скопирована");
                setTimeout(() => setToast(null), 1500);
              }}>
                <Copy className="w-4 h-4" /> Скопировать ссылку
              </Button>
            </div>

            {/* Панель действий из item.actions */}
            {actions.length > 0 && (
              <div className="rounded-xl border bg-white p-4">
                <div className="text-sm font-semibold mb-3">Действия</div>
                <div className="flex flex-wrap gap-2">
                  {actions.map((a) => (
                    <Button
                      key={a.key}
                      variant={a.style === "danger" ? "destructive" : a.style === "primary" ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleActionClick(a.key)}
                      disabled={busy === a.key}
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Панель текущего суб-действия */}
            {renderActionPanel()}

            {/* Последние события */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-semibold mb-2">Последние события</div>
                <div className="max-h-44 overflow-y-auto space-y-2 rounded-xl border bg-slate-50 p-2">
                  {timeline.length === 0 ? (
                    <div className="text-sm text-muted-foreground p-2">Таймлайн пока пуст</div>
                  ) : (
                    timeline.map((t: any, idx: number) => (
                      <div key={idx} className="rounded-lg border bg-white p-2 text-sm">
                        <div className="font-medium">{t.title ?? t.event ?? "Событие"}</div>
                        {t.at && <div className="text-xs text-muted-foreground mt-0.5">{new Date(t.at).toLocaleString("ru-RU")}</div>}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Комментарий */}
              <div>
                <div className="text-sm font-semibold mb-2">Комментарий</div>
                <Textarea
                  value={comment}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setComment(e.target.value)}
                  placeholder="Добавьте комментарий к задаче"
                  className="min-h-[100px]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`px-6 pb-2 text-sm font-medium ${toast.includes("Ошибка") ? "text-red-700" : "text-green-700"}`}>
            {toast}
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="gap-2 flex-wrap px-6 pb-6 pt-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4" /> Закрыть
          </Button>
          <Button variant="secondary" onClick={() => fire("dismiss")} disabled={busy === "dismiss"}>
            Отложить
          </Button>
          <Button onClick={() => fire("resolve")} disabled={busy === "resolve"}>
            <CheckCircle2 className="w-4 h-4" />
            {busy === "resolve" ? "Завершаем..." : "Пометить выполненной"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
