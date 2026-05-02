import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { BellRing } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
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

function fmtAge(hours: number): string {
  if (hours >= 48) return `${Math.round(hours / 24)} дней`;
  return `${Math.round(hours)} ч`;
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
    <div className="rounded-2xl bg-white p-5 space-y-3" style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.07)" }}>
      <div className="text-xs font-bold uppercase tracking-widest text-[#8E8E93]">{title}</div>
      {children}
    </div>
  );
}

function PaymentProgress({ total, paid }: { total?: number | null; paid?: number | null }) {
  const totalNum = Number(total ?? 0);
  const paidNum = Number(paid ?? 0);
  if (!Number.isFinite(totalNum) || totalNum <= 0) return null;
  const clampedPaid = Math.max(0, Math.min(paidNum, totalNum));
  const percent = Math.round((clampedPaid / totalNum) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Частичная оплата</span>
        <span className="font-semibold">{clampedPaid.toLocaleString("ru-RU")} ₽ / {totalNum.toLocaleString("ru-RU")} ₽ ({percent}%)</span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-200 overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

const MESSAGE_TEMPLATES: Record<string, { label: string; text: (orderId?: number | string) => string }[]> = {
  no_estimate: [
    { label: "Пришлите смету", text: (id) => `Добрый день! По заказу${id ? ` #${id}` : ""} — пришлите смету клиенту до конца дня. Спасибо!` },
    { label: "Срочно", text: (id) => `По заказу${id ? ` #${id}` : ""} смета нужна срочно! Пришлите в течение 2 часов.` },
    { label: "Риск передачи", text: (id) => `Заказ${id ? ` #${id}` : ""}: если смета не будет отправлена сегодня, заказ перейдёт другому мастеру.` },
  ],
  no_payment: [
    { label: "Уточните статус", text: (id) => `Добрый день! Клиент ещё не оплатил предоплату по заказу${id ? ` #${id}` : ""}. Уточните статус у клиента.` },
    { label: "Подтвердите в приложении", text: (id) => `По заказу${id ? ` #${id}` : ""}: клиент должен подтвердить оплату через приложение. Напомните ему.` },
    { label: "Риск отмены", text: (id) => `Заказ${id ? ` #${id}` : ""}: без оплаты до конца дня будем вынуждены его отменить.` },
  ],
  no_master_response: [
    { label: "Подтвердите заказ", text: (id) => `Добрый день! Подтвердите принятие заказа${id ? ` #${id}` : ""} через приложение.` },
    { label: "Срок истекает", text: (id) => `Заказ${id ? ` #${id}` : ""} ожидает вашего отклика. Через 2 часа передадим другому мастеру.` },
    { label: "Нет ответа", text: () => "Добрый день! Вы не отвечаете на звонки. Свяжитесь с нами срочно." },
  ],
  blocked_master: [
    { label: "О блокировке", text: () => "Добрый день! Ваш аккаунт временно заблокирован. Свяжитесь с нами для уточнения причин." },
    { label: "Нужны документы", text: () => "Для снятия блокировки пришлите фото паспорта в ответ на это сообщение." },
    { label: "Разблокирован", text: () => "Ваш аккаунт разблокирован! Можете снова принимать заказы." },
  ],
  possible_bypass: [
    { label: "Предупреждение", text: (id) => `По заказу${id ? ` #${id}` : ""}: работайте только через нашу платформу. Обход системы ведёт к немедленной блокировке.` },
    { label: "Объяснитесь", text: (id) => `Заказ${id ? ` #${id}` : ""}: зафиксированы признаки работы вне платформы. Объясните ситуацию.` },
    { label: "Подтвердите работу", text: (id) => `Заказ${id ? ` #${id}` : ""}: подтвердите, что общение с клиентом и закрытие заказа идут только через платформу.` },
    { label: "Устраните нарушение", text: (id) => `По заказу${id ? ` #${id}` : ""}: прекратите любые действия вне платформы и отчитайтесь по заказу.` },
    { label: "Финальное предупреждение", text: (id) => `Заказ${id ? ` #${id}` : ""}: повторный обход платформы приведёт к блокировке аккаунта.` },
  ],
  conflict: [
    { label: "Разберём вместе", text: (id) => `По заказу${id ? ` #${id}` : ""} есть разногласия с клиентом. Свяжитесь с нами для урегулирования.` },
    { label: "Возврат средств", text: (id) => `Заказ${id ? ` #${id}` : ""}: клиент требует возврат. Срочно свяжитесь с нами.` },
  ],
};

function NextActionBanner({ text, phone, phoneLabel, callLabel }: {
  text: string;
  phone?: string | null;
  phoneLabel?: string;
  callLabel?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl p-4" style={{ background: "rgba(52,199,89,0.07)", border: "1.5px solid rgba(52,199,89,0.25)" }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(52,199,89,0.15)" }}>
        <AlertTriangle className="w-4 h-4" style={{ color: "#34C759" }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-[#1A1A1A] mb-0.5">Что делать прямо сейчас</div>
        <div className="text-sm text-[#3A3A3A]">{text}</div>
      </div>
      {phone && (
        <a
          href={`tel:${phone}`}
          className="shrink-0 flex items-center gap-1.5 text-white text-sm font-bold px-4 py-2 rounded-[14px] transition whitespace-nowrap"
          style={{ background: "#34C759" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#2daf4e")}
          onMouseLeave={e => (e.currentTarget.style.background = "#34C759")}
        >
          <Phone className="w-4 h-4" />
          {callLabel ?? phoneLabel ?? "Позвонить"}
        </a>
      )}
    </div>
  );
}

function OrderInfoBlock({ ctx, ageLabel }: { ctx: any; ageLabel?: string }) {
  const clientName = ctx.order?.clientName ?? ctx.client?.clientName;
  const clientPhone = ctx.order?.clientPhone ?? ctx.client?.clientPhone;
  const city = ctx.order?.city ?? ctx.master?.city;
  const district = ctx.order?.district ?? null;
  return (
    <div className="space-y-2">
      {ctx.order?.id != null && (
        <InfoRow icon={<Package className="w-4 h-4" />} label="Заказ" value={`#${ctx.order.id}`} />
      )}
      {ctx.order?.hoursOld != null && (
        <InfoRow icon={<Clock className="w-4 h-4" />} label={ageLabel ?? "Возраст заказа"} value={fmtAge(ctx.order.hoursOld)} />
      )}
      {city && <InfoRow icon={<MapPin className="w-4 h-4" />} label="Город" value={city} />}
      {district && <InfoRow icon={<MapPin className="w-4 h-4" />} label="Адрес" value={district} />}
      {clientName && <InfoRow icon={<UserRoundPen className="w-4 h-4" />} label="Клиент" value={clientName} />}
      {clientPhone && (
        <InfoRow icon={<Phone className="w-4 h-4" />} label="Телефон клиента" value={
          <a href={`tel:${clientPhone}`} className="text-blue-600 underline font-semibold">{clientPhone}</a>
        } />
      )}
      {ctx.master && (
        <InfoRow icon={<UserRoundPen className="w-4 h-4" />} label="Мастер" value={`${ctx.master.name} (#${ctx.master.id})`} />
      )}
      {ctx.master?.phone && (
        <InfoRow icon={<Phone className="w-4 h-4" />} label="Телефон мастера" value={
          <a href={`tel:${ctx.master.phone}`} className="text-blue-600 underline">{ctx.master.phone}</a>
        } />
      )}
    </div>
  );
}

function TemplateChips({ type, orderId, onSelect }: { type: string; orderId?: number | string; onSelect: (text: string) => void }) {
  const templates = MESSAGE_TEMPLATES[type] ?? [];
  if (templates.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="text-xs text-[#8E8E93] self-center font-medium">Шаблоны:</span>
      {templates.map((t) => (
        <button
          key={t.label}
          type="button"
          onClick={() => onSelect(t.text(orderId))}
          className="text-xs px-3 py-1.5 rounded-full border border-[#E5E5EA] bg-white text-[#1A1A1A] font-medium transition"
          style={{ transition: "all 0.15s ease" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(52,199,89,0.08)"; e.currentTarget.style.borderColor = "rgba(52,199,89,0.5)"; e.currentTarget.style.color = "#2daf4e"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = "#E5E5EA"; e.currentTarget.style.color = "#1A1A1A"; }}
        >
          {t.label}
        </button>
      ))}
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
  const [assignedMasterConfirm, setAssignedMasterConfirm] = useState<{ id: number; name: string; city: string | null } | null>(null);
  const [cancelAsMasterPending, setCancelAsMasterPending] = useState(false);
  const [cancelReason, setCancelReason] = useState<"bypass" | "no_contact" | "no_estimate" | "other">("bypass");
  const [completeAsMasterPending, setCompleteAsMasterPending] = useState(false);
  const [completeAmount, setCompleteAmount] = useState<string>("");
  const [commissionMode, setCommissionMode] = useState<"no_debt" | "as_debt" | "as_paid">("as_paid");
  const [partialOrderAmount, setPartialOrderAmount] = useState<string>("");
  const [partialPaidAmount, setPartialPaidAmount] = useState<string>("");
  const [snoozeDays, setSnoozeDays] = useState<number>(1);
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role === "admin";

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["action-item", id],
    queryFn: () => fetchDetail(id!),
    enabled: !!id && open,
  });

  useEffect(() => {
    if (!open) {
      setMessageText(""); setSelectedMasterId(null); setMasterSearch("");
      setBalanceInput(""); setConfirmInput(""); setToast(null); setAssignedMasterConfirm(null); setCancelAsMasterPending(false); setCancelReason("bypass"); setCompleteAsMasterPending(false); setCompleteAmount(""); setCommissionMode("as_paid");
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
    setTimeout(() => setToast(null), ok ? 2500 : 5000);
  };

  const fire = async (action: string, payload: Record<string, unknown> = {}) => {
    console.log(`[ActionItemModal.fire] called action=${action} id=${id}`);
    if (!id) {
      console.warn("[ActionItemModal.fire] aborted: id is null");
      showToast("Не выбрана задача", false);
      return;
    }
    setBusy(action);
    try {
      console.log(`[ActionItemModal.fire] sending POST /api/dashboard/action-items/${id}/action`);
      const r = await fetch(`/api/dashboard/action-items/${id}/action`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload: { comment, ...payload } }),
      });
      console.log(`[ActionItemModal.fire] response status=${r.status}`);
      if (!r.ok) {
        const errBody = await r.json().catch(() => null);
        const errMsg = errBody?.error ?? `Ошибка ${r.status}`;
        throw new Error(errMsg);
      }
      const resultJson = await r.json().catch(() => null);
      const assignedMaster = resultJson?.context?.assignedMaster;
      const confirmedOrderMasterId = resultJson?.context?.order?.masterId;
      const isReassignConfirmed = assignedMaster && confirmedOrderMasterId === assignedMaster.id;
      if (isReassignConfirmed) setAssignedMasterConfirm(assignedMaster);
      const successMsg = isReassignConfirmed
        ? `Назначен: ${assignedMaster.name}${assignedMaster.city ? ` (${assignedMaster.city})` : ""}`
        : "Действие выполнено";
      window.dispatchEvent(new CustomEvent("dashboard-action-items:changed"));
      if (action === "partial_payment") {
        const n = Number((payload as any).orderAmount ?? 0);
        const p = Number((payload as any).paidAmount ?? 0);
        // paidAmount is direct commission payment, totalComm is calculated from orderAmount
        const totalComm = n <= 50000 ? 5000 : Math.round(n * 0.15);
        const paidComm = Math.min(p, totalComm);
        const remaining = Math.max(0, totalComm - paidComm);
        const msg = remaining > 0
          ? `✅ Принято ${paidComm.toLocaleString("ru-RU")} ₽. Остаток: ${remaining.toLocaleString("ru-RU")} ₽. Мастеру отправлено уведомление.`
          : `✅ Комиссия полностью оплачена: ${paidComm.toLocaleString("ru-RU")} ₽. Мастеру отправлено уведомление.`;
        showToast(msg);
        // Refetch to update ctx.transaction with new payment data
        try { await refetch(); } catch { /* ok */ }
        return;
      }
        if (action === "complete_as_master") {
        const mode = (payload as { commissionMode?: string }).commissionMode;
        const msg = mode === "as_debt"
          ? "✅ Заказ завершён. Комиссия добавлена к долгу мастера, уведомление отправлено."
          : mode === "no_debt"
          ? "✅ Заказ завершён без начисления комиссии. Уведомление мастеру отправлено."
          : "✅ Заказ завершён. Комиссия засчитана как оплаченная, мастеру отправлено уведомление.";
        showToast(msg);
        onOpenChange(false);
        return;
      }
      if (action === "cancel_as_master") {
        const reason = (payload as { cancelReason?: string }).cancelReason;
        const msg = reason === "no_contact"
          ? "⚠️ Заказ отменён (мастер не выходит на связь). Рейтинг мастера обновлён, уведомление отправлено."
          : reason === "no_estimate"
          ? "⚠️ Заказ отменён (мастер не отправил смету). Рейтинг мастера обновлён, уведомление отправлено."
          : reason === "other"
          ? "⚠️ Заказ отменён (другая причина мастера). Рейтинг мастера обновлён, уведомление отправлено."
          : "⚠️ Заказ отменён (обход платформы). Рейтинг мастера обновлён, уведомление отправлено.";
        showToast(msg);
        onOpenChange(false);
        return;
      }
      try { await refetch(); } catch { /* item may be gone after status change, that's ok */ }
      showToast(successMsg);
    } catch (e: any) {
      console.error("[ActionItemModal.fire] error:", e);
      showToast(e?.message ?? "Ошибка при выполнении", false);
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
            <NextActionBanner
              text={`Мастер не отправил смету уже ${ctx.order?.hoursOld != null ? fmtAge(ctx.order.hoursOld) : "долго"}. Позвоните мастеру и выясните причину.`}
              phone={ctx.master?.phone}
              callLabel="Позвонить мастеру"
            />
            <OrderInfoBlock ctx={ctx} ageLabel="Без сметы" />

            <div className="border-t pt-3 space-y-3">
              <div className="text-sm font-semibold">Написать мастеру</div>
              <TemplateChips type="no_estimate" orderId={ctx.order?.id} onSelect={setMessageText} />
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
              {assignedMasterConfirm && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600" />
                  <span>Назначен: <strong>{assignedMasterConfirm.name}</strong>{assignedMasterConfirm.city ? ` · ${assignedMasterConfirm.city}` : ""}</span>
                </div>
              )}
            </div>
          </SectionBox>
        );

      // ─── Нет оплаты ──────────────────────────────────────────────
      case "no_payment":
        return (
          <SectionBox title="Ситуация: предоплата не получена">
            <NextActionBanner
              text={`Клиент не оплатил смету${ctx.order?.hoursOld != null ? ` уже ${fmtAge(ctx.order.hoursOld)}` : ""}. Позвоните клиенту и напомните об оплате.`}
              phone={ctx.order?.clientPhone ?? ctx.client?.clientPhone}
              callLabel={`Позвонить${(ctx.order?.clientName ?? ctx.client?.clientName) ? ` ${ctx.order?.clientName ?? ctx.client?.clientName}` : " клиенту"}`}
            />
            <OrderInfoBlock ctx={ctx} ageLabel="Ожидаем оплату" />
            {ctx.order?.proposedAmount != null && (
              <InfoRow icon={<Banknote className="w-4 h-4" />} label="Сумма сметы" value={`${Number(ctx.order.proposedAmount).toLocaleString("ru-RU")} ₽`} />
            )}
            <PaymentProgress total={ctx.order?.proposedAmount} paid={ctx.receipt?.prepaymentSeenAt ? ctx.receipt?.prepaymentAmount : 0} />
            {ctx.receipt && (
              <div className="space-y-2">
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
                      <img
                        src={ctx.receipt.prepaymentScreenshotUrl}
                        alt="Скриншот"
                        className="max-h-32 rounded-lg border object-contain bg-slate-100"
                        onError={(e) => {
                          console.warn("[screenshot] failed to load:", ctx.receipt.prepaymentScreenshotUrl);
                          (e.target as HTMLImageElement).style.display = "none";
                          (e.target as HTMLImageElement).nextElementSibling?.removeAttribute("hidden");
                        }}
                      />
                      <span hidden className="text-xs text-blue-600 underline">Открыть скриншот ↗</span>
                    </a>
                  </div>
                )}
              </div>
            )}
            <div className="border-t pt-3 space-y-3">
              <div className="text-sm font-semibold text-muted-foreground">Написать мастеру (если клиент не отвечает)</div>
              <TemplateChips type="no_payment" orderId={ctx.order?.id} onSelect={setMessageText} />
              <Textarea
                value={messageText}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMessageText(e.target.value)}
                placeholder="Привет! Клиент пока не оплатил смету. Свяжитесь с ним и напомните."
                className="min-h-[80px] bg-white"
              />
              <Button
                onClick={() => fire("message_master", { message: messageText })}
                disabled={busy === "message_master" || !messageText.trim()}
                size="sm"
                variant="outline"
              >
                <MessageSquare className="w-4 h-4" /> Написать мастеру
              </Button>
            </div>
              {ctx.transaction && (ctx.transaction.paidCommission > 0 || ctx.transaction.prepaymentDeducted > 0) && (
                <div className="space-y-2">
                  <PaymentProgress total={ctx.transaction.commission} paid={ctx.transaction.paidCommission} />
                  {ctx.transaction.prepaymentDeducted > 0 && (
                    <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2 border border-blue-200">
                      <Banknote className="w-3.5 h-3.5 shrink-0" />
                      <span>Бронь по смете: <strong>{Number(ctx.transaction.prepaymentDeducted).toLocaleString("ru-RU")} ₽</strong> уже зачтена в счёт комиссии</span>
                    </div>
                  )}
                  {ctx.transaction.payments?.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground">История платежей:</div>
                      {ctx.transaction.payments.map((p: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-1.5 border">
                          <span className="text-muted-foreground">
                            {new Date(p.paidAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            {p.note && <span className="ml-1 text-slate-400">· {p.note}</span>}
                          </span>
                          <span className="font-semibold text-emerald-700">+{Number(p.amount).toLocaleString("ru-RU")} ₽</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="border-t pt-3 space-y-3">
              <div className="text-sm font-semibold">Внести частичную оплату комиссии</div>
              <div className="text-xs text-muted-foreground">Заказ не закрывается — только фиксируется оплата части комиссии. Мастеру придёт уведомление.</div>
              <div className="flex gap-2 flex-wrap items-end">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Полная сумма сметы, ₽</label>
                  <Input type="number" inputMode="decimal" min={0} step={100} value={partialOrderAmount} onChange={(e: ChangeEvent<HTMLInputElement>) => setPartialOrderAmount(e.target.value)} placeholder="Например: 150000" className="bg-white w-40" disabled={busy === "partial_payment"} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Оплачено комиссии, ₽</label>
                  <Input type="number" inputMode="decimal" min={0} step={100} value={partialPaidAmount} onChange={(e: ChangeEvent<HTMLInputElement>) => setPartialPaidAmount(e.target.value)} placeholder="Например: 20000" className="bg-white w-40" disabled={busy === "partial_payment"} />
                </div>
                <Button size="sm" variant="outline" className="border-emerald-400 text-emerald-700 hover:bg-emerald-50" disabled={busy === "partial_payment" || !partialOrderAmount || !partialPaidAmount} onClick={async () => { const n = Number(partialOrderAmount); const p = Number(partialPaidAmount); if (!Number.isFinite(n) || n <= 0) { showToast("Укажите полную сумму сметы", false); return; } if (!Number.isFinite(p) || p <= 0) { showToast("Укажите оплаченную сумму комиссии", false); return; } await fire("partial_payment", { orderAmount: n, paidAmount: p }); setPartialOrderAmount(""); setPartialPaidAmount(""); }}>
                  <Banknote className="w-4 h-4" /> Зафиксировать оплату
                </Button>
              </div>
              {(() => { const n = Number(partialOrderAmount); const p = Number(partialPaidAmount); if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(p) || p <= 0) return null; const totalComm = n <= 50000 ? 5000 : Math.round(n * 0.15); const remaining = Math.max(0, totalComm - p); return (<div className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-200">Комиссия с {n.toLocaleString("ru-RU")} ₽ ≈ {totalComm.toLocaleString("ru-RU")} ₽ · Оплачено {p.toLocaleString("ru-RU")} ₽{remaining > 0 ? ` · Остаток ${remaining.toLocaleString("ru-RU")} ₽` : " · Полностью оплачено ✅"}</div>); })()}
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
            <NextActionBanner
              text={`Мастер не откликается${ctx.order?.hoursOld != null ? ` уже ${fmtAge(ctx.order.hoursOld)}` : ""}. Назначьте другого мастера или позвоните текущему.`}
              phone={ctx.master?.phone}
              callLabel="Позвонить мастеру"
            />
            <OrderInfoBlock ctx={ctx} ageLabel="Ждём мастера" />

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
              {assignedMasterConfirm && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600" />
                  <span>Назначен: <strong>{assignedMasterConfirm.name}</strong>{assignedMasterConfirm.city ? ` · ${assignedMasterConfirm.city}` : ""}</span>
                </div>
              )}
            </div>
          </SectionBox>
        );

      // ─── Заблокированный мастер ──────────────────────────────────
      case "blocked_master":
        return (
          <SectionBox title="Ситуация: мастер заблокирован">
            <NextActionBanner
              text={ctx.master?.blockedReason ? `Причина блокировки: ${ctx.master.blockedReason}. Свяжитесь с мастером и решите вопрос.` : "Мастер заблокирован. Свяжитесь с ним, выясните причину и разблокируйте вручную если всё в порядке."}
              phone={ctx.master?.phone}
              callLabel="Позвонить мастеру"
            />
            <OrderInfoBlock ctx={ctx} />
            {ctx.master?.blockedReason && (
              <InfoRow icon={<CircleAlert className="w-4 h-4" />} label="Причина блокировки" value={ctx.master.blockedReason} />
            )}
            {ctx.master?.blockedAt && (
              <InfoRow icon={<Clock className="w-4 h-4" />} label="Заблокирован" value={new Date(ctx.master.blockedAt).toLocaleString("ru-RU")} />
            )}
            <div className="border-t pt-3 space-y-3">
              <div className="text-sm font-semibold">Написать мастеру</div>
              <TemplateChips type="blocked_master" orderId={undefined} onSelect={setMessageText} />
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
            <NextActionBanner
              text={item.type === "possible_bypass"
                ? "Мастер, возможно, работает в обход платформы. Позвоните ему и предупредите — следующий раз будет блокировка."
                : "Конфликтная ситуация по заказу. Позвоните мастеру, выясните детали и урегулируйте."}
              phone={ctx.master?.phone}
              callLabel="Позвонить мастеру"
            />
            <OrderInfoBlock ctx={ctx} />
            <div className="border-t pt-3 space-y-3">
              <div className="text-sm font-semibold">Написать мастеру</div>
              <TemplateChips type={data?.type ?? "possible_bypass"} orderId={ctx.order?.id} onSelect={setMessageText} />
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
            {isAdmin && ctx.order?.id && ctx.master?.id && (
              <div className="border-t pt-3 space-y-2">
                {!completeAsMasterPending ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full border-green-400 text-green-700 hover:bg-green-50"
                    onClick={() => {
                      const initial = ctx.order?.proposedAmount ?? ctx.order?.orderAmount ?? "";
                      setCompleteAmount(initial ? String(initial) : "");
                      setCompleteAsMasterPending(true);
                    }}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Завершить как выполненный
                  </Button>
                ) : (
                  <div className="rounded-xl border-2 border-green-300 bg-green-50 p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-700 shrink-0 mt-0.5" />
                      <div className="text-sm text-green-900">
                        <div className="font-bold mb-1">Подтвердите завершение заказа</div>
                        <div>Заказ <strong>#{ctx.order?.id}</strong> будет отмечен как выполненный для мастера {ctx.master?.name ? <strong>{ctx.master.name}</strong> : null}. В чат мастера придёт уведомление.</div>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-green-900 font-semibold block mb-1">Итоговая сумма заказа, ₽</label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={100}
                        value={completeAmount}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setCompleteAmount(e.target.value)}
                        placeholder="Например: 5000"
                        className="bg-white"
                        disabled={busy === "complete_as_master"}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-green-900 font-semibold block mb-1">Что делать с комиссией?</label>
                      <div className="grid gap-1.5">
                        <label className={`flex items-start gap-2 rounded-lg border p-2 cursor-pointer ${commissionMode === "as_paid" ? "border-green-500 bg-green-100" : "border-green-200 bg-white"}`}>
                          <input
                            type="radio"
                            name="commissionMode"
                            value="as_paid"
                            checked={commissionMode === "as_paid"}
                            onChange={() => setCommissionMode("as_paid")}
                            disabled={busy === "complete_as_master"}
                            className="mt-0.5"
                          />
                          <div className="text-xs">
                            <div className="font-semibold text-green-900">Засчитать как оплаченную</div>
                            <div className="text-green-800">Мастер уже передал комиссию (наличными/переводом). В аналитике появится доход, долг мастера уменьшится.</div>
                          </div>
                        </label>
                        <label className={`flex items-start gap-2 rounded-lg border p-2 cursor-pointer ${commissionMode === "as_debt" ? "border-orange-500 bg-orange-100" : "border-green-200 bg-white"}`}>
                          <input
                            type="radio"
                            name="commissionMode"
                            value="as_debt"
                            checked={commissionMode === "as_debt"}
                            onChange={() => setCommissionMode("as_debt")}
                            disabled={busy === "complete_as_master"}
                            className="mt-0.5"
                          />
                          <div className="text-xs">
                            <div className="font-semibold text-orange-900">Начислить как долг мастера</div>
                            <div className="text-orange-800">Мастер ещё не платил — комиссия добавится к его долгу, статус «ожидает оплаты». Мастер получит уведомление о задолженности.</div>
                          </div>
                        </label>
                        <label className={`flex items-start gap-2 rounded-lg border p-2 cursor-pointer ${commissionMode === "no_debt" ? "border-slate-500 bg-slate-100" : "border-green-200 bg-white"}`}>
                          <input
                            type="radio"
                            name="commissionMode"
                            value="no_debt"
                            checked={commissionMode === "no_debt"}
                            onChange={() => setCommissionMode("no_debt")}
                            disabled={busy === "complete_as_master"}
                            className="mt-0.5"
                          />
                          <div className="text-xs">
                            <div className="font-semibold text-slate-900">Закрыть без комиссии</div>
                            <div className="text-slate-700">Спорная ситуация / мастер не делал смету. Комиссия = 0, долг мастера не меняется, в аналитике 0 ₽.</div>
                          </div>
                        </label>
                      </div>
                    </div>
                    {(() => {
                      const n = Number(completeAmount);
                      const validAmount = Number.isFinite(n) && n > 0;
                      let preview = "";
                      if (!validAmount) {
                        preview = "Сумма не указана — заказ закроется с комиссией 0 ₽.";
                      } else {
                        const calc = n <= 50000 ? 5000 : Math.round(n * 0.15);
                        if (commissionMode === "no_debt") preview = `Сумма заказа: ${Math.round(n).toLocaleString("ru-RU")} ₽. Комиссия не начисляется.`;
                        else if (commissionMode === "as_debt") preview = `Сумма ${Math.round(n).toLocaleString("ru-RU")} ₽ → комиссия ≈ ${calc.toLocaleString("ru-RU")} ₽ будет добавлена к долгу мастера.`;
                        else preview = `Сумма ${Math.round(n).toLocaleString("ru-RU")} ₽ → комиссия ≈ ${calc.toLocaleString("ru-RU")} ₽ засчитается как оплаченная.`;
                      }
                      return <div className="text-xs text-green-700">{preview}</div>;
                    })()}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        disabled={busy === "complete_as_master"}
                        onClick={async () => {
                          console.log("[btn:complete_as_master] clicked, id=", id, "amount=", completeAmount, "mode=", commissionMode);
                          const payload: Record<string, unknown> = { commissionMode, orderId: ctx.order?.id, masterId: ctx.master?.id };
                          const n = Number(completeAmount);
                          if (Number.isFinite(n) && n > 0) payload.orderAmount = n;
                          await fire("complete_as_master", payload);
                          setCompleteAsMasterPending(false);
                        }}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" /> {busy === "complete_as_master" ? "Завершаем..." : "Да, завершить заказ"}
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy === "complete_as_master"} onClick={() => setCompleteAsMasterPending(false)}>
                        Отмена
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {!!(ctx.order?.id && ctx.master?.id) && (
              <div className="border-t pt-3 space-y-2">
                {!cancelAsMasterPending ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="w-full"
                    onClick={() => setCancelAsMasterPending(true)}
                  >
                    Отменить заказ (вина мастера)
                  </Button>
                ) : (
                  <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                      <div className="text-sm text-red-800">
                        <div className="font-bold mb-1">Подтвердите отмену заказа</div>
                        <div>Заказ <strong>#{ctx.order?.id}</strong> будет отменён с причиной <strong>«вина мастера»</strong>. Это влияет на рейтинг мастера {ctx.master?.name ? <strong>{ctx.master.name}</strong> : null} и видно в чате CRM. Действие необратимо.</div>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-red-900 font-semibold block mb-1">Причина отмены</label>
                      <div className="grid gap-1.5">
                        <label className={`flex items-start gap-2 rounded-lg border p-2 cursor-pointer ${cancelReason === "bypass" ? "border-red-500 bg-red-100" : "border-red-200 bg-white"}`}>
                          <input type="radio" name="cancelReason" value="bypass" checked={cancelReason === "bypass"} onChange={() => setCancelReason("bypass")} disabled={busy === "cancel_as_master"} className="mt-0.5" />
                          <div className="text-xs"><div className="font-semibold text-red-900">Обход платформы</div><div className="text-red-800">Мастер закрывает заказ вне CRM / платформы.</div></div>
                        </label>
                        <label className={`flex items-start gap-2 rounded-lg border p-2 cursor-pointer ${cancelReason === "no_contact" ? "border-orange-500 bg-orange-100" : "border-red-200 bg-white"}`}>
                          <input type="radio" name="cancelReason" value="no_contact" checked={cancelReason === "no_contact"} onChange={() => setCancelReason("no_contact")} disabled={busy === "cancel_as_master"} className="mt-0.5" />
                          <div className="text-xs"><div className="font-semibold text-orange-900">Нет связи с мастером</div><div className="text-orange-800">Мастер не отвечает, не выходит на связь и игнорирует оператора.</div></div>
                        </label>
                        <label className={`flex items-start gap-2 rounded-lg border p-2 cursor-pointer ${cancelReason === "no_estimate" ? "border-slate-500 bg-slate-100" : "border-red-200 bg-white"}`}>
                          <input type="radio" name="cancelReason" value="no_estimate" checked={cancelReason === "no_estimate"} onChange={() => setCancelReason("no_estimate")} disabled={busy === "cancel_as_master"} className="mt-0.5" />
                          <div className="text-xs"><div className="font-semibold text-slate-900">Смета не отправлена</div><div className="text-slate-700">Заказ долго висит без сметы и мастер не исправляет ситуацию.</div></div>
                        </label>
                        <label className={`flex items-start gap-2 rounded-lg border p-2 cursor-pointer ${cancelReason === "other" ? "border-slate-400 bg-slate-100" : "border-red-200 bg-white"}`}>
                          <input type="radio" name="cancelReason" value="other" checked={cancelReason === "other"} onChange={() => setCancelReason("other")} disabled={busy === "cancel_as_master"} className="mt-0.5" />
                          <div className="text-xs"><div className="font-semibold text-slate-900">Другая причина</div><div className="text-slate-700">Использовать, если причина не подходит под стандартные сценарии.</div></div>
                        </label>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy === "cancel_as_master"}
                        onClick={async () => {
                          await fire("cancel_as_master", { cancelReason, orderId: ctx.order?.id, masterId: ctx.master?.id });
                          setCancelAsMasterPending(false);
                        }}
                      >
                        {busy === "cancel_as_master" ? "Отменяем..." : "Да, отменить"}
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy === "cancel_as_master"} onClick={() => setCancelAsMasterPending(false)}>
                        Отмена
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
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
      <DialogContent className="sm:max-w-[860px] w-[95vw] min-h-[420px] max-h-[85vh] rounded-[18px] bg-white shadow-2xl p-0 overflow-hidden flex flex-col">
        {/* Цветная полоса приоритета */}
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-[18px] ${leftColor}`} />

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="pl-7 pr-6 pt-6 pb-4 space-y-4">

            {/* Скелетон загрузки — показываем пока данные не пришли */}
            {isLoading && !item ? (
              <div className="space-y-4 min-h-[260px] flex flex-col justify-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-200 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-slate-200 rounded animate-pulse w-3/4" />
                    <div className="h-3 bg-slate-100 rounded animate-pulse w-1/2" />
                  </div>
                </div>
                <div className="h-20 bg-slate-100 rounded-xl animate-pulse" />
                <div className="h-12 bg-slate-100 rounded-xl animate-pulse" />
              </div>
            ) : item ? (
            <>

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

            {/* Частичная оплата — универсальный блок для всех типов задач */}
            {item?.type !== "no_payment" && !!ctx.order?.id && (
              <SectionBox title="Частичная оплата комиссии">
                <>
                  <div className="text-xs text-muted-foreground">Заказ не закрывается — только фиксируется оплата части комиссии. Мастеру придёт уведомление.</div>
                  {/* Прогресс-бар: если транзакция есть — берём реальные данные, иначе считаем комиссию из сметы */}
                  {(() => {
                    const totalComm = ctx.transaction?.commission != null
                      ? ctx.transaction.commission
                      : ctx.order?.proposedAmount != null
                        ? (Number(ctx.order.proposedAmount) <= 50000 ? 5000 : Math.round(Number(ctx.order.proposedAmount) * 0.15))
                        : null;
                    const prepaymentDeducted = ctx.transaction?.prepaymentDeducted ?? 0;
                    const paidComm = (ctx.transaction?.paidCommission ?? 0) + prepaymentDeducted;
                    return (
                      <>
                        <PaymentProgress total={totalComm} paid={paidComm} />
                        {prepaymentDeducted > 0 && (
                          <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2 border border-blue-200">
                            <Banknote className="w-3.5 h-3.5 shrink-0" />
                            <span>Бронь по смете: <strong>{Number(prepaymentDeducted).toLocaleString("ru-RU")} ₽</strong> уже зачтена в счёт комиссии</span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                  {ctx.transaction?.payments?.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground">История платежей:</div>
                      {ctx.transaction.payments.map((p: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-emerald-50 rounded-lg px-3 py-1.5 border border-emerald-100">
                          <span className="text-emerald-800 font-medium">+{Number(p.amount).toLocaleString("ru-RU")} ₽</span>
                          <span className="text-muted-foreground">{p.paidAt ? new Date(p.paidAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap items-end">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Полная сумма сметы, ₽</label>
                      <Input type="number" inputMode="decimal" min={0} step={100} value={partialOrderAmount} onChange={(e: ChangeEvent<HTMLInputElement>) => setPartialOrderAmount(e.target.value)} placeholder="Например: 10000" className="bg-white w-40" disabled={busy === "partial_payment"} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Оплачено комиссии, ₽</label>
                      <Input type="number" inputMode="decimal" min={0} step={100} value={partialPaidAmount} onChange={(e: ChangeEvent<HTMLInputElement>) => setPartialPaidAmount(e.target.value)} placeholder="Например: 20000" className="bg-white w-40" disabled={busy === "partial_payment"} />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-emerald-400 text-emerald-700 hover:bg-emerald-50"
                      disabled={busy === "partial_payment" || !partialOrderAmount || !partialPaidAmount}
                      onClick={async () => {
                        const n = Number(partialOrderAmount);
                        const p = Number(partialPaidAmount);
                        if (!Number.isFinite(n) || n <= 0) { showToast("Укажите полную сумму сметы", false); return; }
                        if (!Number.isFinite(p) || p <= 0) { showToast("Укажите оплаченную сумму", false); return; }
                        await fire("partial_payment", { orderAmount: n, paidAmount: p });
                        setPartialOrderAmount("");
                        setPartialPaidAmount("");
                      }}
                    >
                      <Banknote className="w-4 h-4" /> Зафиксировать оплату
                    </Button>
                  </div>
                  {(() => {
                    const n = Number(partialOrderAmount);
                    const p = Number(partialPaidAmount);
                    if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(p) || p <= 0) return null;
                    const totalComm = n <= 50000 ? 5000 : Math.round(n * 0.15);
                    const remaining = Math.max(0, totalComm - p);
                    return (
                      <div className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-200">
                        Комиссия с {n.toLocaleString("ru-RU")} ₽ ≈ {totalComm.toLocaleString("ru-RU")} ₽ · Оплачено {p.toLocaleString("ru-RU")} ₽{remaining > 0 ? ` · Остаток ${remaining.toLocaleString("ru-RU")} ₽` : " · Полностью оплачено ✅"}
                      </div>
                    );
                  })()}
                </>
              </SectionBox>
            )}

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
            </> ) : null}
          </div>
        </div>

        {/* Toast */}
        {/* Toast */}
        {toast && (
          <div className={`px-6 pb-2 text-sm font-medium ${toast.ok ? "text-green-700" : "text-red-600"}`}>
            {toast.msg}
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="gap-2 flex-wrap px-6 pb-5 pt-2 border-t border-[#F2F2F7]">
          <button
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[14px] border border-[#E5E5EA] bg-white text-[#1A1A1A] text-sm font-semibold transition hover:bg-[#F5F5F5]"
          >
            <X className="w-4 h-4" /> Закрыть
          </button>
          {/* Snooze */}
          <div className="inline-flex items-center gap-1.5 rounded-[14px] border border-[#E5E5EA] bg-white overflow-hidden">
            <select
              value={snoozeDays}
              onChange={e => setSnoozeDays(Number(e.target.value))}
              className="pl-3 pr-1 py-2 text-sm text-[#1A1A1A] bg-transparent outline-none cursor-pointer"
            >
              <option value={1}>1 день</option>
              <option value={2}>2 дня</option>
              <option value={3}>3 дня</option>
              <option value={7}>7 дней</option>
            </select>
            <button
              onClick={() => fire("snooze", { days: snoozeDays })}
              disabled={busy === "snooze"}
              className="inline-flex items-center gap-1 pr-3 py-2 text-sm font-semibold text-[#FF9500] disabled:opacity-50 transition hover:text-[#e08600]"
            >
              <BellRing className="w-4 h-4" /> Напомнить
            </button>
          </div>
          <button
            onClick={() => fire("resolve")}
            disabled={busy === "resolve"}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-[14px] text-white text-sm font-bold transition disabled:opacity-50"
            style={{ background: "#34C759" }}
            onMouseEnter={e => { if (!busy) e.currentTarget.style.background = "#2daf4e"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#34C759"; }}
          >
            <CheckCircle2 className="w-4 h-4" />
            {busy === "resolve" ? "Завершаем..." : "Выполнено ✓"}
          </button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
