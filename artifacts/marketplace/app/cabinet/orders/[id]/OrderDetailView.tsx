"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  cabinetOrders,
  uploadPhoto,
  CabinetApiError,
  type CancelType,
  type OrderListItem,
  type OrderPhotoType,
  type WorkStatus,
} from "../../_lib/cabinetClient";
import { resolvePhotoUrl } from "../../_lib/photo";

interface Props {
  id: number | null;
}

type Source = "available" | "active" | "completed";

const WORK_STATUS_OPTIONS: { value: WorkStatus; label: string; emoji: string }[] = [
  { value: "on_the_way", label: "В пути", emoji: "🚗" },
  { value: "on_site", label: "На объекте", emoji: "📍" },
  { value: "estimating", label: "Делаю замер", emoji: "📐" },
  { value: "in_progress", label: "В работе", emoji: "🔧" },
  { value: "finishing", label: "Завершаю", emoji: "🏁" },
  { value: "completed", label: "Готов к сдаче", emoji: "✅" },
];

const CANCEL_OPTIONS: { value: CancelType; label: string; description: string }[] = [
  {
    value: "master_cancel",
    label: "Я не могу выполнить",
    description: "Личные обстоятельства, заболел, изменился график.",
  },
  {
    value: "client_cancel",
    label: "Клиент отказался",
    description: "Клиент передумал, нашёл другого мастера, заявка не актуальна.",
  },
  {
    value: "refund_request",
    label: "Возврат / спор",
    description: "Запрос возврата средств — пойдёт диспетчеру.",
  },
];

/**
 * Order detail with full workflow.
 *
 * The api-server has no `GET /orders/:id` — we fetch all three lists
 * (available / my-active / my-completed) on mount, find the matching record,
 * and render the right action set:
 *   • Available  → Accept, Respond (с заметкой), Reject (с причиной)
 *   • Active     → Update status, Cancel, Complete (с суммой)
 *   • Completed  → Read-only summary
 *
 * Fetches all three so the URL works even when the user lands here from
 * "Назад" or a bookmark. Lists are small (≤ 30-50 items) so the cost is
 * negligible.
 */
export function OrderDetailView({ id }: Props) {
  const router = useRouter();
  const [pools, setPools] = useState<{
    available: OrderListItem[] | null;
    active: OrderListItem[] | null;
    completed: OrderListItem[] | null;
  }>({ available: null, active: null, completed: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Per-action UI state (collapsibles).
  const [respondNote, setRespondNote] = useState("");
  const [respondOpen, setRespondOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelType, setCancelType] = useState<CancelType>("master_cancel");
  const [cancelReason, setCancelReason] = useState("");
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeAmount, setCompleteAmount] = useState("");

  const refresh = async () => {
    const [available, active, completed] = await Promise.all([
      cabinetOrders.fetchAvailable().catch(() => [] as OrderListItem[]),
      cabinetOrders.fetchMy("active").catch(() => [] as OrderListItem[]),
      cabinetOrders.fetchMy("completed").catch(() => [] as OrderListItem[]),
    ]);
    setPools({ available, active, completed });
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        await refresh();
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Не удалось загрузить заказ";
        setError(msg);
        toast.error(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { item, source } = useMemo<{
    item: OrderListItem | null;
    source: Source | null;
  }>(() => {
    if (id == null) return { item: null, source: null };
    const a = pools.available?.find((o) => o.id === id);
    if (a) return { item: a, source: "available" };
    const b = pools.active?.find((o) => o.id === id);
    if (b) return { item: b, source: "active" };
    const c = pools.completed?.find((o) => o.id === id);
    if (c) return { item: c, source: "completed" };
    return { item: null, source: null };
  }, [pools, id]);

  // ── Action handlers ──────────────────────────────────────────────────────

  async function withBusy<T>(fn: () => Promise<T>, success?: string): Promise<T | null> {
    setBusy(true);
    try {
      const res = await fn();
      if (success) toast.success(success);
      await refresh();
      return res;
    } catch (err) {
      const msg = err instanceof CabinetApiError ? err.message : err instanceof Error ? err.message : "Ошибка";
      toast.error(msg);
      return null;
    } finally {
      setBusy(false);
    }
  }

  const handleAccept = () =>
    withBusy(() => cabinetOrders.accept(item!.id), "Заявка принята");

  const handleRespond = async () => {
    await withBusy(
      () => cabinetOrders.respond(item!.id, respondNote.trim() || undefined),
      "Отклик отправлен",
    );
    setRespondNote("");
    setRespondOpen(false);
  };

  const handleReject = async () => {
    await withBusy(
      () => cabinetOrders.reject(item!.id, rejectReason.trim() || undefined),
      "Заявка отклонена",
    );
    setRejectReason("");
    setRejectOpen(false);
    router.push("/cabinet/orders");
  };

  const handleStatusChange = async (status: WorkStatus) =>
    withBusy(() => cabinetOrders.updateStatus(item!.id, status), "Статус обновлён");

  const handleComplete = async () => {
    const n = parseInt(completeAmount.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Укажите сумму работ в рублях");
      return;
    }
    const ok = await withBusy(() => cabinetOrders.complete(item!.id, n), "Заказ завершён");
    if (ok) {
      setCompleteAmount("");
      setCompleteOpen(false);
      router.push("/cabinet/orders");
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      toast.error("Опишите причину отмены");
      return;
    }
    const ok = await withBusy(
      () => cabinetOrders.cancel(item!.id, cancelType, cancelReason.trim()),
      "Запрос на отмену отправлен",
    );
    if (ok) {
      setCancelReason("");
      setCancelOpen(false);
    }
  };

  const handleUploadPhoto = async (orderId: number, type: OrderPhotoType, file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Выберите изображение");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Файл больше 10 МБ");
      return;
    }
    setBusy(true);
    try {
      const url = await uploadPhoto(file);
      await cabinetOrders.addPhoto(orderId, type, url);
      toast.success("Фото загружено");
      await refresh();
    } catch (err) {
      const msg = err instanceof CabinetApiError ? err.message : err instanceof Error ? err.message : "Ошибка загрузки";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="inline-block h-9 w-9 animate-spin rounded-full border-4 border-[var(--color-primary-soft)] border-t-[var(--color-primary)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-8 text-center text-sm text-[var(--color-muted)]">
        {error}.{" "}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="font-semibold text-[var(--color-primary)] hover:underline"
        >
          Попробовать ещё раз
        </button>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-white p-10 text-center">
        <p className="text-base font-semibold text-[var(--color-text)]">Заказ не найден</p>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Возможно, его уже взял другой мастер или статус изменился.
        </p>
        <Link
          href="/cabinet/orders"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--color-cta)] px-4 py-2.5 text-sm font-semibold text-[var(--color-on-cta)] shadow-sm hover:bg-[var(--color-primary-strong)]"
        >
          К списку заказов
        </Link>
      </div>
    );
  }

  return (
    <article className="space-y-6">
      {/* Header */}
      <header className="space-y-3">
        <Link
          href="/cabinet/orders"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
          Все заказы
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
              Заказ №{item.id}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
              {item.serviceType}
            </h1>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              {item.city}
              {item.district ? ` · ${item.district}` : ""}
              {Number.isFinite(item.area) && item.area > 0 ? ` · ${item.area} м²` : ""}
            </p>
          </div>
          <SourceBadge source={source} item={item} />
        </div>
      </header>

      {/* Meta strip */}
      <MetaGrid item={item} />

      {/* Description / comment */}
      {item.comment ? (
        <section className="rounded-2xl border border-[var(--color-border)] bg-white p-5 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Комментарий клиента
          </h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[var(--color-text)]">
            {item.comment}
          </p>
        </section>
      ) : null}

      {/* Client contact — only for active orders */}
      {source === "active" && (item.clientName || item.clientPhone) ? (
        <ClientCard name={item.clientName ?? null} phone={item.clientPhone ?? null} />
      ) : null}

      {/* Photos */}
      {item.photos && item.photos.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Фото объекта
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            {item.photos.map((url, i) => (
              <a
                key={`${url}-${i}`}
                href={resolvePhotoUrl(url)}
                target="_blank"
                rel="noopener noreferrer"
                className="block aspect-square overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]"
              >
                <img
                  src={resolvePhotoUrl(url)}
                  alt={`Фото ${i + 1}`}
                  className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {/* Master photo galleries — only on active/completed orders */}
      {source !== "available" ? (
        <MasterPhotoSections
          item={item}
          busy={busy}
          onUpload={(type, file) => handleUploadPhoto(item.id, type, file)}
        />
      ) : null}

      {/* Object / case editor entry — active & completed orders */}
      {source !== "available" ? <ObjectEditorLink orderId={item.id} /> : null}

      {/* Actions */}
      {source === "available" ? (
        <AvailableActions
          busy={busy}
          onAccept={handleAccept}
          respondOpen={respondOpen}
          respondNote={respondNote}
          setRespondNote={setRespondNote}
          toggleRespond={() => setRespondOpen((v) => !v)}
          onRespond={handleRespond}
          rejectOpen={rejectOpen}
          rejectReason={rejectReason}
          setRejectReason={setRejectReason}
          toggleReject={() => setRejectOpen((v) => !v)}
          onReject={handleReject}
        />
      ) : null}

      {source === "active" ? (
        <ActiveActions
          item={item}
          busy={busy}
          onStatus={handleStatusChange}
          completeOpen={completeOpen}
          completeAmount={completeAmount}
          setCompleteAmount={setCompleteAmount}
          toggleComplete={() => setCompleteOpen((v) => !v)}
          onComplete={handleComplete}
          cancelOpen={cancelOpen}
          cancelType={cancelType}
          setCancelType={setCancelType}
          cancelReason={cancelReason}
          setCancelReason={setCancelReason}
          toggleCancel={() => setCancelOpen((v) => !v)}
          onCancel={handleCancel}
        />
      ) : null}

      {source === "completed" ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-800">
            Заказ закрыт
          </h2>
          <p className="mt-2 text-sm text-emerald-900">
            История доступна только для просмотра. Спасибо за работу!
          </p>
        </section>
      ) : null}
    </article>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function SourceBadge({
  source,
  item,
}: {
  source: Source | null;
  item: OrderListItem;
}) {
  if (source === "available") {
    return (
      <span className="inline-flex flex-shrink-0 items-center rounded-full bg-[var(--color-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--color-primary)]">
        Доступна для отклика
      </span>
    );
  }
  if (source === "active") {
    return (
      <span className="inline-flex flex-shrink-0 items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
        В работе
      </span>
    );
  }
  if (source === "completed") {
    return (
      <span className="inline-flex flex-shrink-0 items-center rounded-full bg-[var(--color-background)] px-3 py-1 text-xs font-semibold text-[var(--color-muted)]">
        {item.status === "cancelled" ? "Отменён" : "Завершён"}
      </span>
    );
  }
  return null;
}

function ObjectEditorLink({ orderId }: { orderId: number }) {
  return (
    <Link
      href={`/cabinet/orders/${orderId}/object`}
      className="group flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm transition hover:border-[var(--color-primary)] hover:shadow-md sm:p-6"
    >
      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-xl">
        📇
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-[var(--color-text)]">Карточка Объекта</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-[var(--color-muted)]">
          Смета по этапам, фото до/после и публикация кейса на сайте.
        </span>
      </span>
      <span className="flex-shrink-0 text-[var(--color-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--color-primary)]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m9 18 6-6-6-6" />
        </svg>
      </span>
    </Link>
  );
}

function MetaGrid({ item }: { item: OrderListItem }) {
  const cells: { label: string; value: string }[] = [];
  if (item.scheduledAt) cells.push({ label: "Запланирован", value: formatDateTime(item.scheduledAt) });
  if (item.assignedAt) cells.push({ label: "Назначен", value: formatDateTime(item.assignedAt) });
  if (item.proposedAmount && item.proposedAmount > 0) {
    cells.push({ label: "Сумма", value: `${formatRubles(item.proposedAmount)} ₽` });
  }
  if (item.services) cells.push({ label: "Услуги", value: item.services });
  if (cells.length === 0) return null;
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cells.map((c) => (
        <div key={c.label} className="rounded-2xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            {c.label}
          </dt>
          <dd className="mt-1 text-sm font-bold text-[var(--color-text)]">{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function AvailableActions(props: {
  busy: boolean;
  onAccept: () => void;
  respondOpen: boolean;
  respondNote: string;
  setRespondNote: (v: string) => void;
  toggleRespond: () => void;
  onRespond: () => void;
  rejectOpen: boolean;
  rejectReason: string;
  setRejectReason: (v: string) => void;
  toggleReject: () => void;
  onReject: () => void;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="text-base font-bold text-[var(--color-text)]">Действия</h2>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          Принять — заявка перейдёт в раздел «В работе» сразу. Откликнуться — даём знать клиенту, окончательное решение позже.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={props.onAccept}
          disabled={props.busy}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-cta)] px-5 py-2.5 text-sm font-semibold text-[var(--color-on-cta)] shadow-sm transition hover:bg-[var(--color-primary-strong)] disabled:opacity-60"
        >
          <CheckIcon />
          Принять заявку
        </button>
        <button
          type="button"
          onClick={props.toggleRespond}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--color-text)] transition hover:border-[var(--color-primary)]"
        >
          {props.respondOpen ? "Закрыть" : "Откликнуться с заметкой"}
        </button>
        <button
          type="button"
          onClick={props.toggleReject}
          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
        >
          {props.rejectOpen ? "Закрыть" : "Отклонить"}
        </button>
      </div>

      {props.respondOpen ? (
        <div className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
          <label className="block text-xs font-semibold text-[var(--color-text)]">
            Заметка для клиента (опционально)
          </label>
          <textarea
            value={props.respondNote}
            onChange={(e) => props.setRespondNote(e.target.value.slice(0, 600))}
            rows={3}
            placeholder="«Готов выехать сегодня вечером, привезу свои инструменты»"
            className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
          />
          <button
            type="button"
            onClick={props.onRespond}
            disabled={props.busy}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] shadow-sm hover:border-[var(--color-text)] disabled:opacity-60"
          >
            Отправить отклик
          </button>
        </div>
      ) : null}

      {props.rejectOpen ? (
        <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-4">
          <label className="block text-xs font-semibold text-red-900">
            Причина отказа (помогает диспетчеру понимать причины)
          </label>
          <textarea
            value={props.rejectReason}
            onChange={(e) => props.setRejectReason(e.target.value.slice(0, 600))}
            rows={3}
            placeholder="«Не работаю по этому району»"
            className="w-full resize-y rounded-lg border border-red-200 bg-white px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={props.onReject}
            disabled={props.busy}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60"
          >
            Подтвердить отказ
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ActiveActions(props: {
  item: OrderListItem;
  busy: boolean;
  onStatus: (s: WorkStatus) => void;
  completeOpen: boolean;
  completeAmount: string;
  setCompleteAmount: (v: string) => void;
  toggleComplete: () => void;
  onComplete: () => void;
  cancelOpen: boolean;
  cancelType: CancelType;
  setCancelType: (v: CancelType) => void;
  cancelReason: string;
  setCancelReason: (v: string) => void;
  toggleCancel: () => void;
  onCancel: () => void;
}) {
  const currentStatus = props.item.masterWorkStatus;
  return (
    <section className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="text-base font-bold text-[var(--color-text)]">Статус работы</h2>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          Обновляйте по ходу — клиент видит ваш статус в реальном времени.
        </p>
      </div>

      {/* Progressive stepper */}
      <div className="relative">
        {/* connector line */}
        <div className="absolute left-[15px] top-5 h-[calc(100%-28px)] w-0.5 bg-[var(--color-border)]" aria-hidden />
        <div className="space-y-2">
          {WORK_STATUS_OPTIONS.map((opt, i) => {
            const currentIdx = WORK_STATUS_OPTIONS.findIndex(o => o.value === currentStatus);
            const isDone = currentIdx > i;
            const isActive = currentStatus === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => props.onStatus(opt.value)}
                disabled={props.busy || isActive}
                className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                  isActive
                    ? "bg-[var(--color-cta)] text-[var(--color-on-cta)] shadow-sm"
                    : isDone
                    ? "text-[var(--color-muted)]"
                    : "border border-[var(--color-border)] bg-white text-[var(--color-text)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]/30"
                } disabled:cursor-default`}
              >
                <span className={`relative z-10 flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full text-xs ${
                  isActive ? "bg-white text-[var(--color-primary)] font-bold"
                  : isDone ? "bg-[var(--color-border)] text-[var(--color-muted)]"
                  : "bg-[var(--color-background)] text-[var(--color-muted)]"
                }`}>
                  {isDone ? "✓" : opt.emoji}
                </span>
                <span>{opt.label}</span>
                {isActive && (
                  <span className="ml-auto rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                    Текущий
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="my-2 border-t border-[var(--color-border)]" />

      <div>
        <h2 className="text-base font-bold text-[var(--color-text)]">Завершение / отмена</h2>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={props.toggleComplete}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          <CheckIcon />
          {props.completeOpen ? "Закрыть" : "Завершить заказ"}
        </button>
        <button
          type="button"
          onClick={props.toggleCancel}
          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
        >
          {props.cancelOpen ? "Закрыть" : "Отменить заказ"}
        </button>
      </div>

      {props.completeOpen ? (
        <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <label className="block text-xs font-semibold text-emerald-900">
            Итоговая сумма работ, ₽
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={props.completeAmount}
            onChange={(e) => props.setCompleteAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 8))}
            placeholder="35000"
            className="h-11 w-40 rounded-lg border border-emerald-200 bg-white px-3 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <p className="text-[11px] text-emerald-900">
            С этой суммы рассчитается комиссия. Дальше она появится в разделе «Баланс».
          </p>
          <button
            type="button"
            onClick={props.onComplete}
            disabled={props.busy}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            Подтвердить завершение
          </button>
        </div>
      ) : null}

      {props.cancelOpen ? (
        <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <div>
            <p className="text-xs font-semibold text-red-900">Тип отмены</p>
            <div className="mt-2 grid gap-2">
              {CANCEL_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border bg-white p-3 ${
                    props.cancelType === opt.value
                      ? "border-red-500 ring-2 ring-red-200"
                      : "border-red-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="cancelType"
                    value={opt.value}
                    checked={props.cancelType === opt.value}
                    onChange={() => props.setCancelType(opt.value)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-text)]">{opt.label}</p>
                    <p className="text-[11px] text-[var(--color-muted)]">{opt.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-red-900">
              Причина <span className="text-red-600">*</span>
            </label>
            <textarea
              value={props.cancelReason}
              onChange={(e) => props.setCancelReason(e.target.value.slice(0, 600))}
              rows={3}
              placeholder="Подробно — это поможет диспетчеру"
              className="w-full resize-y rounded-lg border border-red-200 bg-white px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={props.onCancel}
            disabled={props.busy}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60"
          >
            Подтвердить отмену
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ClientCard({ name, phone }: { name: string | null; phone: string | null }) {
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        Контакт клиента
      </h2>
      <div className="mt-3 flex items-center gap-4">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-lg font-bold text-[var(--color-primary)]">
          {name ? name.trim()[0]?.toUpperCase() : "К"}
        </div>
        <div className="min-w-0 flex-1">
          {name && (
            <p className="text-sm font-bold text-[var(--color-text)]">{name}</p>
          )}
          {phone && (
            <a
              href={`tel:${phone}`}
              className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-primary)] hover:underline"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.27 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.18 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16z"/>
              </svg>
              {phone}
            </a>
          )}
        </div>
        {phone && (
          <a
            href={`tel:${phone}`}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm transition hover:bg-emerald-600"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.27 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.18 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16z"/>
            </svg>
          </a>
        )}
      </div>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ── Master photo galleries (before / work / act) ───────────────────────────

function MasterPhotoSections({
  item,
  busy,
  onUpload,
}: {
  item: OrderListItem;
  busy: boolean;
  onUpload: (type: OrderPhotoType, file: File) => void;
}) {
  return (
    <section className="space-y-5 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="text-base font-bold text-[var(--color-text)]">Ваши фото по работе</h2>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          «До» и «после» нужны для подтверждения работы и идут в общую галерею кейсов.
          «Акт» — фото подписанного клиентом документа (если используется).
        </p>
      </div>
      <PhotoUploadGroup
        type="before"
        label="До работ"
        photos={item.photosBefore ?? []}
        busy={busy}
        onAdd={(file) => onUpload("before", file)}
      />
      <PhotoUploadGroup
        type="after"
        label="После работ"
        photos={item.photosAfter ?? []}
        busy={busy}
        onAdd={(file) => onUpload("after", file)}
      />
      <PhotoUploadGroup
        type="act"
        label="Акт работ"
        photos={item.photoAct ? [item.photoAct] : []}
        busy={busy}
        onAdd={(file) => onUpload("act", file)}
        single
      />
    </section>
  );
}

function PhotoUploadGroup({
  type,
  label,
  photos,
  busy,
  onAdd,
  single,
}: {
  type: OrderPhotoType;
  label: string;
  photos: string[];
  busy: boolean;
  onAdd: (file: File) => void;
  single?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const limit = single ? 1 : 8;
  const tone = type === "after" ? "primary" : type === "act" ? "amber" : "muted";
  const labelClass =
    tone === "primary"
      ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700"
        : "bg-[var(--color-background)] text-[var(--color-muted)]";
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className={`rounded-full px-3 py-0.5 text-xs font-semibold uppercase tracking-wider ${labelClass}`}>
          {label}
        </span>
        <span className="text-xs text-[var(--color-muted)]">
          {photos.length}{single ? "" : ` / ${limit}`}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5">
        {photos.map((url) => (
          <a
            key={url}
            href={resolvePhotoUrl(url)}
            target="_blank"
            rel="noopener noreferrer"
            className="block aspect-square overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]"
          >
            <img
              src={resolvePhotoUrl(url)}
              alt={label}
              className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
              loading="lazy"
            />
          </a>
        ))}
        {photos.length < limit ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-background)]/40 transition hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]/30 disabled:opacity-50"
          >
            {busy ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-muted)]" aria-hidden>
                <path d="M5 12h14" />
                <path d="M12 5v14" />
              </svg>
            )}
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onAdd(f);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatRubles(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
