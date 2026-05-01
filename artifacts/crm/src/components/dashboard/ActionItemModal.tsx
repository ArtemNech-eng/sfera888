import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, Clock, X, Banknote, TriangleAlert,
  UserX, ShieldAlert, BadgeAlert, Wrench, MessageSquare, Settings,
  UserRoundPen, Phone, MapPin, Package, RefreshCw, CircleAlert,
  ChevronRight,
} from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

async function fetchDetail(id: string) {
  const r = await fetch(`/api/dashboard/action-items/${id}`, { credentials: "include" });
  if (!r.ok) throw new Error("load");
  return r.json();
}

const PRIORITY_RU: Record<string, string> = {
  critical: "Критично",
  high: "Высокий",
  medium: "Средний",
  low: "Низкий",
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
const PRIORITY_LEFT: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-blue-500",
  low: "bg-slate-400",
};
const PRIORITY_BADGE: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-blue-100 text-blue-700",
  low: "bg-slate-100 text-slate-700",
};

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-muted-foreground whitespace-nowrap">{label}:</span>
      <span className="font-medium break-all">{value}</span>
    </div>
  );
}

function SectionBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

export function ActionItemModal({ id, open, onOpenChange }: {
  id: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [messageText, setMessageText] = useState("");
  const [selectedMasterId, setSelectedMasterId] = useState<number | null>(null);
  const [masterSearch, setMasterSearch] = useState("");
  const [balanceInput, setBalanceInput] = useState("");
  const [confirmInput, setConfirmInput] = useState("");
  const [comment, setComment] = useState("");

  const { data, refetch } = useQuery({
    queryKey: ["action-item", id],
    queryFn: () => fetchDetail(id!),
    enabled: !!id && open,
  });

  useEffect(() => {
    if (!open) {
      setMessageText(""); setSelectedMasterId(null); setMasterSearch("");
      setBalanceInput(""); setConfirmInput(""); setToast(null);
    }
  }, [open]);

  useEffect(() => {
    if (id) setComment(localStorage.getItem(`aitem-comment-${id}`) ?? "");
  }, [id]);
  useEffect(() => {
    if (id) localStorage.setItem(`aitem-comment-${id}`, comment);
  }, [id, comment]);

  const item = data;
  const ctx = item?.context ?? {};

  const badgeColor = PRIORITY_BADGE[item?.priority ?? "low"] ?? PRIORITY_BADGE.low;
  const leftColor = PRIORITY_LEFT[item?.priority ?? "low"] ?? PRIORITY_LEFT.low;

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2500);
  };

  const fire = async (action: string, payload: Record<string, unknown> = {}) => {
    if (!id) return;
    setBusy(action);
    try {
      const r = await fetch(`/api/dashboard/action-items/${id}/action`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload: { comment, ...payload } }),
      });
      if (!r.ok) throw new Error("err");
      await refetch();
      window.dispatchEvent(new CustomEvent("dashboard-action-items:changed"));
      showToast("Действие выполнено");
    } catch {
      showToast("Ошибка при выполнении", false);
    } finally {
      setBusy(null);
    }
  };

  const availableMasters: { id: number; name: string; city: string | null }[] = ctx.availableMasters ?? [];
  const filteredMasters = availableMasters.filter((m) =>
    masterSearch.trim() === "" ||
    `${m.id} ${m.name} ${m.city ?? ""}`.toLowerCase().includes(masterSearch.toLowerCase())
  );

  function renderTypePanel() {
    if (!item) return null;

    switch (item.type) {
      // ─── Нет сметы ───────────────────────────────────────────────
      case "no_estimate":
        return (
          <SectionBox title="Ситуация: заказ без сметы">
            <div className="space-y-2">
              {ctx.order && (
                <>
                  <InfoRow icon={<Package className="w-4 h-4" />} label="Заказ" value={`#${ctx.order.id}`} />
                  {ctx.order.hoursOld != null && <InfoRow icon={<Clock className="w-4 h-4" />} label="Без сметы" value={`${ctx.order.hoursOld} ч`} />}
                  {ctx.order.clientName && <InfoRow icon={<UserRoundPen className="w-4 h-4" />} label="Клиент" value={ctx.order.clientName} />}
                  {ctx.order.clientPhone && (
                    <InfoRow icon={<Phone className="w-4 h-4" />} label="Телефон клиента" value={
                      <a href={`tel:${ctx.order.clientPhone}`} className="text-blue-600 underline">{ctx.order.clientPhone}</a>
                    } />
                  )}
                </>
              )}
              {ctx.master && (
                <>
                  <InfoRow icon={<UserRoundPen className="w-4 h-4" />} label="Мастер" value={`${ctx.master.name} (#${ctx.master.id})`} />
                  {ctx.master.phone && (
                    <InfoRow icon={<Phone className="w-4 h-4" />} label="Телефон мастера" value={
                      <a href={`tel:${ctx.master.phone}`} className="text-blue-600 underline">{ctx.master.phone}</a>
                    } />
                  )}
                </>
              )}
            </div>

            <div className="border-t pt-3 space-y-3">
              <div className="text-sm font-semibold">Написать мастеру</div>
              <Textarea
                value={messageText}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMessageText(e.target.value)}
                placeholder="Привет! По заказу #... Пришлите смету до конца дня."
                className="min-h-[80px] bg-white"
              />
              <Button
                onClick={() => fire("message_master", { message: messageText })}
                disabled={busy === "message_master" || !messageText.trim()}
                size="sm"
              >
                <MessageSquare className="w-4 h-4" /> Отправить мастеру
              </Button>
            </div>

            <div className="border-t pt-3">
              <div className="text-sm font-semibold mb-2">Переназначить мастера</div>
              <Input
                value={masterSearch}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setMasterSearch(e.target.value)}
                placeholder="Поиск мастера по имени или городу"
                className="mb-2 bg-white"
              />
              <div className="max-h-36 overflow-y-auto space-y-1 rounded-xl border bg-white p-2">
                {filteredMasters.length === 0 && <div className="text-xs text-muted-foreground p-2">Нет доступных мастеров</div>}
                {filteredMasters.slice(0, 8).map((m) => (
                  <button
                    key={m.id}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition ${selectedMasterId === m.id ? "border-violet-500 bg-violet-50" : "hover:bg-slate-50"}`}
                    onClick={() => setSelectedMasterId(m.id)}
                  >
                    <span className="font-medium">{m.name}</span>
                    {m.city && <span className="text-muted-foreground ml-2">· {m.city}</span>}
                    <ChevronRight className="w-3 h-3 inline ml-1 text-muted-foreground" />
                  </button>
                ))}
              </div>
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                disabled={!selectedMasterId || busy === "reassign"}
                onClick={() => fire("reassign", { masterId: selectedMasterId })}
              >
                Назначить выбранного мастера
              </Button>
            </div>
          </SectionBox>
        );

      // ─── Нет оплаты ──────────────────────────────────────────────
      case "no_payment":
        return (
          <SectionBox title="Ситуация: предоплата не получена">
            <div className="space-y-2">
              {ctx.order && (
                <>
                  <InfoRow icon={<Package className="w-4 h-4" />} label="Заказ" value={`#${ctx.order.id}`} />
                  {ctx.order.hoursOld != null && <InfoRow icon={<Clock className="w-4 h-4" />} label="Ожидаем оплату" value={`${ctx.order.hoursOld} ч`} />}
                  {ctx.order.proposedAmount != null && (
                    <InfoRow icon={<Banknote className="w-4 h-4" />} label="Сумма сметы" value={`${Number(ctx.order.proposedAmount).toLocaleString("ru-RU")} ₽`} />
                  )}
                  {(ctx.order.clientName || ctx.client?.clientName) && (
                    <InfoRow icon={<UserRoundPen className="w-4 h-4" />} label="Клиент" value={ctx.order.clientName ?? ctx.client?.clientName} />
                  )}
                  {(ctx.order.clientPhone || ctx.client?.clientPhone) && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground text-sm">Позвонить клиенту:</span>
                      <a
                        href={`tel:${ctx.order.clientPhone ?? ctx.client?.clientPhone}`}
                        className="text-base font-bold text-violet-700 underline"
                      >
                        {ctx.order.clientPhone ?? ctx.client?.clientPhone}
                      </a>
                    </div>
                  )}
                </>
              )}
              {ctx.receipt && (
                <>
                  {ctx.receipt.prepaymentAmount && (
                    <InfoRow icon={<Banknote className="w-4 h-4" />} label="Предоплата" value={`${Number(ctx.receipt.prepaymentAmount).toLocaleString("ru-RU")} ₽`} />
                  )}
                  {ctx.receipt.prepaymentSubmittedAt && (
                    <InfoRow icon={<Clock className="w-4 h-4" />} label="Клиент оплатил" value={new Date(ctx.receipt.prepaymentSubmittedAt).toLocaleString("ru-RU")} />
                  )}
                  {ctx.receipt.prepaymentScreenshotUrl && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Скриншот оплаты:</div>
                      <a href={ctx.receipt.prepaymentScreenshotUrl} target="_blank" rel="noopener noreferrer">
                        <img src={ctx.receipt.prepaymentScreenshotUrl} alt="Скриншот" className="max-h-32 rounded-lg border object-contain" />
                      </a>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="border-t pt-3 space-y-3">
              <div className="text-sm font-semibold">Напомнить мастеру о подтверждении</div>
              <Textarea
                value={messageText}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMessageText(e.target.value)}
                placeholder="Привет! Клиент оплатил. Подтвердите получение оплаты в приложении."
                className="min-h-[80px] bg-white"
              />
              <Button
                onClick={() => fire("message_master", { message: messageText })}
                disabled={busy === "message_master" || !messageText.trim()}
                size="sm"
              >
                <MessageSquare className="w-4 h-4" /> Отправить напоминание мастеру
              </Button>
            </div>
            <div className="border-t pt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => fire("return_to_pool")} disabled={busy === "return_to_pool"}>
                <RefreshCw className="w-4 h-4" /> Вернуть в пул
              </Button>
              <Button size="sm" variant="destructive" onClick={() => { if (confirmInput.toUpperCase() === "ОТМЕНИТЬ") fire("cancel_order"); else showToast('Введите "ОТМЕНИТЬ" для подтверждения', false); }} disabled={busy === "cancel_order"}>
                Отменить заказ
              </Button>
              <Input
                value={confirmInput}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmInput(e.target.value)}
                placeholder='Введите ОТМЕНИТЬ'
                className="w-36 bg-white"
                size={10}
              />
            </div>
          </SectionBox>
        );

      // ─── Нет отклика мастера ─────────────────────────────────────
      case "no_master_response":
        return (
          <SectionBox title="Ситуация: мастер не откликается">
            <div className="space-y-2">
              {ctx.order && (
                <>
                  <InfoRow icon={<Package className="w-4 h-4" />} label="Заказ" value={`#${ctx.order.id}`} />
                  {ctx.order.hoursOld != null && <InfoRow icon={<Clock className="w-4 h-4" />} label="Ждём мастера" value={`${ctx.order.hoursOld} ч`} />}
                  {ctx.order.city && <InfoRow icon={<MapPin className="w-4 h-4" />} label="Город" value={ctx.order.city} />}
                </>
              )}
            </div>

            <div className="border-t pt-3">
              <div className="text-sm font-semibold mb-2">Назначить мастера вручную</div>
              <Input
                value={masterSearch}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setMasterSearch(e.target.value)}
                placeholder="Поиск по имени или городу"
                className="mb-2 bg-white"
              />
              <div className="max-h-44 overflow-y-auto space-y-1 rounded-xl border bg-white p-2">
                {filteredMasters.length === 0 && <div className="text-xs text-muted-foreground p-2">Нет активных мастеров</div>}
                {filteredMasters.slice(0, 10).map((m) => (
                  <button
                    key={m.id}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition ${selectedMasterId === m.id ? "border-violet-500 bg-violet-50 font-semibold" : "hover:bg-slate-50"}`}
                    onClick={() => setSelectedMasterId(m.id)}
                  >
                    {m.name}
                    {m.city && <span className="text-muted-foreground ml-2 font-normal">· {m.city}</span>}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mt-2 flex-wrap">
                <Button
                  size="sm"
                  disabled={!selectedMasterId || busy === "reassign"}
                  onClick={() => fire("reassign", { masterId: selectedMasterId })}
                >
                  Назначить мастера
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === "resend"}
                  onClick={() => fire("resend")}
                >
                  <RefreshCw className="w-4 h-4" /> Разослать повторно
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy === "cancel_order"}
                  onClick={() => fire("cancel_order")}
                >
                  Отменить заказ
                </Button>
              </div>
            </div>
          </SectionBox>
        );

      // ─── Заблокированный мастер ──────────────────────────────────
      case "blocked_master":
        return (
          <SectionBox title="Ситуация: мастер заблокирован">
            {ctx.master && (
              <div className="space-y-2">
                <InfoRow icon={<UserRoundPen className="w-4 h-4" />} label="Мастер" value={`${ctx.master.name} (#${ctx.master.id})`} />
                {ctx.master.phone && (
                  <InfoRow icon={<Phone className="w-4 h-4" />} label="Телефон" value={
                    <a href={`tel:${ctx.master.phone}`} className="text-blue-600 underline">{ctx.master.phone}</a>
                  } />
                )}
                {ctx.master.city && <InfoRow icon={<MapPin className="w-4 h-4" />} label="Город" value={ctx.master.city} />}
                {ctx.master.blockedReason && (
                  <InfoRow icon={<CircleAlert className="w-4 h-4" />} label="Причина блокировки" value={ctx.master.blockedReason} />
                )}
                {ctx.master.blockedAt && (
                  <InfoRow icon={<Clock className="w-4 h-4" />} label="Заблокирован" value={new Date(ctx.master.blockedAt).toLocaleString("ru-RU")} />
                )}
              </div>
            )}
            <div className="border-t pt-3 space-y-3">
              <div className="text-sm font-semibold">Написать мастеру</div>
              <Textarea
                value={messageText}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMessageText(e.target.value)}
                placeholder="Здравствуйте! По вашей блокировке..."
                className="min-h-[80px] bg-white"
              />
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  onClick={() => fire("message_master", { message: messageText })}
                  disabled={busy === "message_master" || !messageText.trim()}
                >
                  <MessageSquare className="w-4 h-4" /> Отправить
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => fire("manual_unblock")}
                  disabled={busy === "manual_unblock"}
                >
                  Разблокировать вручную
                </Button>
              </div>
            </div>
          </SectionBox>
        );

      // ─── Низкий баланс Avito ─────────────────────────────────────
      case "low_avito_balance":
        return (
          <SectionBox title="Ситуация: низкий баланс Avito">
            <div className="flex items-center gap-4">
              <div className="text-center p-4 rounded-xl bg-orange-50 border border-orange-200 min-w-[120px]">
                <div className="text-xs text-muted-foreground mb-1">Текущий баланс</div>
                <div className="text-2xl font-bold text-orange-700">
                  {ctx.avitoBalance != null ? `${Number(ctx.avitoBalance).toLocaleString("ru-RU")} ₽` : "—"}
                </div>
              </div>
              <div className="text-center p-4 rounded-xl bg-slate-50 border min-w-[120px]">
                <div className="text-xs text-muted-foreground mb-1">Минимум</div>
                <div className="text-2xl font-bold text-slate-600">1 000 ₽</div>
              </div>
            </div>
            <div className="border-t pt-3 space-y-2">
              <div className="text-sm font-semibold">Обновить баланс вручную</div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={balanceInput}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setBalanceInput(e.target.value)}
                  placeholder="Новый баланс (₽)"
                  className="bg-white w-44"
                />
                <Button
                  size="sm"
                  onClick={() => fire("update_balance", { balance: Number(balanceInput) })}
                  disabled={busy === "update_balance" || !balanceInput.trim()}
                >
                  Сохранить
                </Button>
              </div>
            </div>
          </SectionBox>
        );

      // ─── Обход / Конфликт ────────────────────────────────────────
      case "possible_bypass":
      case "conflict":
        return (
          <SectionBox title={item.type === "possible_bypass" ? "Ситуация: подозрение на обход" : "Ситуация: конфликт"}>
            <div className="space-y-2">
              {ctx.order && <InfoRow icon={<Package className="w-4 h-4" />} label="Заказ" value={`#${ctx.order.id}`} />}
              {ctx.master && <InfoRow icon={<UserRoundPen className="w-4 h-4" />} label="Мастер" value={`${ctx.master.name} (#${ctx.master.id})`} />}
              {ctx.master?.phone && (
                <InfoRow icon={<Phone className="w-4 h-4" />} label="Телефон" value={
                  <a href={`tel:${ctx.master.phone}`} className="text-blue-600 underline">{ctx.master.phone}</a>
                } />
              )}
            </div>
            <div className="border-t pt-3 space-y-3">
              <div className="text-sm font-semibold">Написать мастеру</div>
              <Textarea
                value={messageText}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMessageText(e.target.value)}
                placeholder="Здравствуйте! По вашему заказу..."
                className="min-h-[80px] bg-white"
              />
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  onClick={() => fire("message_master", { message: messageText })}
                  disabled={busy === "message_master" || !messageText.trim()}
                >
                  <MessageSquare className="w-4 h-4" /> Написать
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fire("manual_control")}
                  disabled={busy === "manual_control"}
                >
                  Перевести в ручной контроль
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => fire("block_master")}
                  disabled={busy === "block_master"}
                >
                  Заблокировать мастера
                </Button>
              </div>
            </div>
          </SectionBox>
        );

      // ─── Нет движения / прочее ───────────────────────────────────
      default:
        return (
          <SectionBox title="Действия по задаче">
            <div className="flex flex-wrap gap-2">
              {(item.actions ?? []).map((a: any) => (
                <Button
                  key={a.key}
                  size="sm"
                  variant={a.style === "danger" ? "destructive" : a.style === "primary" ? "default" : "outline"}
                  onClick={() => fire(a.key)}
                  disabled={busy === a.key}
                >
                  {a.label}
                </Button>
              ))}
            </div>
          </SectionBox>
        );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[860px] w-[95vw] max-h-[85vh] rounded-[18px] bg-white shadow-2xl p-0 overflow-hidden">
        {/* Цветная полоса приоритета */}
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-[18px] ${leftColor}`} />

        <div className="max-h-[85vh] overflow-y-auto">
          <div className="pl-7 pr-6 pt-6 pb-4 space-y-4">

            {/* Шапка */}
            <DialogHeader>
              <DialogTitle asChild>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 rounded-xl p-2.5 ${badgeColor} shrink-0`}>
                    {TYPE_ICON[item?.type ?? ""] ?? <AlertTriangle className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-base text-foreground leading-snug pr-8">
                      {item?.title ?? "Задача"}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${badgeColor}`}>
                        {PRIORITY_RU[item?.priority ?? ""] ?? item?.priority}
                      </span>
                      <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                        {STATUS_RU[item?.status ?? ""] ?? item?.status}
                      </span>
                      {item?.city && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {item.city}
                        </span>
                      )}
                    </div>
                    {item?.shortDescription && item.shortDescription !== item.title && (
                      <div className="text-sm text-muted-foreground mt-1.5">{item.shortDescription}</div>
                    )}
                  </div>
                </div>
              </DialogTitle>
            </DialogHeader>

            {/* Полное описание */}
            {item?.fullDescription && item.fullDescription !== item.shortDescription && (
              <div className="text-sm text-foreground bg-slate-50 rounded-xl border p-3 leading-relaxed">
                {item.fullDescription}
              </div>
            )}

            {/* Тип-специфичный виджет */}
            {renderTypePanel()}

            {/* Комментарий */}
            <div>
              <div className="text-sm font-semibold mb-1.5">Комментарий</div>
              <Textarea
                value={comment}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setComment(e.target.value)}
                placeholder="Добавьте заметку..."
                className="min-h-[72px] bg-white"
              />
            </div>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`px-6 pb-2 text-sm font-medium ${toast.ok ? "text-green-700" : "text-red-600"}`}>
            {toast.msg}
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="gap-2 flex-wrap px-6 pb-5 pt-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4" /> Закрыть
          </Button>
          <Button variant="secondary" onClick={() => fire("dismiss")} disabled={busy === "dismiss"}>
            Отложить
          </Button>
          <Button onClick={() => fire("resolve")} disabled={busy === "resolve"} className="bg-violet-600 hover:bg-violet-700">
            <CheckCircle2 className="w-4 h-4" />
            {busy === "resolve" ? "Завершаем..." : "Выполнено"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
