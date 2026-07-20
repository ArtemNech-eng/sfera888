"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  cabinetObjects,
  cabinetOrders,
  uploadPhoto,
  CabinetApiError,
  type ObjectStage,
  type ObjectStageLine,
  type ObjectOrderContext,
  type WorkTypeOption,
} from "../../../_lib/cabinetClient";
import { resolvePhotoUrl } from "../../../_lib/photo";

interface Props {
  orderId: number | null;
}

type ObjectType = "project" | "task";

/** Подсказки названий этапов — типовой порядок ремонта. */
const STAGE_SUGGESTIONS = [
  "Демонтаж",
  "Черновые работы",
  "Электрика",
  "Сантехника",
  "Стены и потолки",
  "Полы",
  "Плитка",
  "Чистовая отделка",
  "Двери",
  "Финишная уборка",
];

let localKeySeq = 0;
const nextKey = () => `k${++localKeySeq}`;

/** Строка этапа + стабильный ключ для React (name/id могут повторяться). */
interface EditableLine extends ObjectStageLine {
  _key: string;
}
interface EditableStage {
  _key: string;
  title: string;
  lineItems: EditableLine[];
}

function toEditable(stages: ObjectStage[]): EditableStage[] {
  return (stages ?? []).map((s) => ({
    _key: nextKey(),
    title: s.title ?? "",
    lineItems: (s.lineItems ?? []).map((li) => ({ ...li, _key: nextKey() })),
  }));
}

function emptyStage(title = ""): EditableStage {
  return { _key: nextKey(), title, lineItems: [emptyLine()] };
}
function emptyLine(): EditableLine {
  return { _key: nextKey(), workTypeId: null, name: "", unit: "", quantity: undefined, unitPrice: 0 };
}

function lineSum(li: ObjectStageLine): number {
  const up = Number(li.unitPrice) || 0;
  const q = Number(li.quantity);
  return Number.isFinite(q) && q > 0 ? up * q : up;
}

function money(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}

/**
 * Флагманский редактор карточки Объекта.
 *
 * Загружает контекст заказа + существующий Объект (если есть) и словарь видов
 * работ. Мастер собирает смету по этапам (пикер видов работ из словаря → позиция
 * попадёт в аналитику цен), указывает тип/площадь/ЖК, грузит фото до/после и
 * публикует. Сохранение — upsert по заказу; публикация замыкает петлю Real Price.
 */
export function ObjectEditor({ orderId }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [order, setOrder] = useState<ObjectOrderContext | null>(null);
  const [workTypes, setWorkTypes] = useState<WorkTypeOption[]>([]);

  const [objectId, setObjectId] = useState<number | null>(null);
  const [objectType, setObjectType] = useState<ObjectType>("project");
  const [area, setArea] = useState("");
  const [zhk, setZhk] = useState("");
  const [stages, setStages] = useState<EditableStage[]>([]);
  const [beforePhotos, setBeforePhotos] = useState<string[]>([]);
  const [afterPhotos, setAfterPhotos] = useState<string[]>([]);

  const [consent, setConsent] = useState(false);
  const [published, setPublished] = useState(false);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const beforeInputRef = useRef<HTMLInputElement | null>(null);
  const afterInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (orderId == null) {
      setLoadError("Некорректный заказ");
      setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const [ctx, wts] = await Promise.all([
          cabinetObjects.get(orderId),
          cabinetObjects.workTypes().catch(() => [] as WorkTypeOption[]),
        ]);
        if (!alive) return;
        setOrder(ctx.order);
        setWorkTypes(wts);
        setBeforePhotos(ctx.order.photosBefore ?? []);
        setAfterPhotos(ctx.order.photosAfter ?? []);
        if (ctx.object) {
          setObjectId(ctx.object.id);
          setObjectType((ctx.object.objectType as ObjectType) || "project");
          setArea(ctx.object.area != null ? String(ctx.object.area) : "");
          setZhk(ctx.object.zhk ?? "");
          const editable = toEditable(ctx.object.stages);
          setStages(editable.length > 0 ? editable : [emptyStage("Работы")]);
          setConsent(ctx.object.publishConsent);
          setPublished(ctx.object.isPublished);
          setPublicUrl(ctx.object.publicUrl);
        } else {
          setStages([emptyStage("Работы")]);
          if (ctx.order.area != null) setArea(String(ctx.order.area));
        }
      } catch (e) {
        if (!alive) return;
        setLoadError(e instanceof CabinetApiError ? e.message : "Не удалось загрузить Объект");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [orderId]);

  // ── Производные суммы ──────────────────────────────────────────────────────
  const grandTotal = useMemo(
    () => stages.reduce((sum, s) => sum + s.lineItems.reduce((a, li) => a + lineSum(li), 0), 0),
    [stages],
  );
  const pricedLines = useMemo(
    () => stages.reduce((n, s) => n + s.lineItems.filter((li) => li.workTypeId && Number(li.unitPrice) > 0).length, 0),
    [stages],
  );

  const markDirty = () => setDirty(true);

  // ── Мутации этапов/позиций ──────────────────────────────────────────────────
  function updateStage(key: string, patch: Partial<EditableStage>) {
    setStages((prev) => prev.map((s) => (s._key === key ? { ...s, ...patch } : s)));
    markDirty();
  }
  function addStage() {
    setStages((prev) => [...prev, emptyStage()]);
    markDirty();
  }
  function removeStage(key: string) {
    setStages((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s._key !== key)));
    markDirty();
  }
  function addLine(stageKey: string) {
    setStages((prev) =>
      prev.map((s) => (s._key === stageKey ? { ...s, lineItems: [...s.lineItems, emptyLine()] } : s)),
    );
    markDirty();
  }
  function removeLine(stageKey: string, lineKey: string) {
    setStages((prev) =>
      prev.map((s) =>
        s._key === stageKey
          ? { ...s, lineItems: s.lineItems.length <= 1 ? s.lineItems : s.lineItems.filter((li) => li._key !== lineKey) }
          : s,
      ),
    );
    markDirty();
  }
  function updateLine(stageKey: string, lineKey: string, patch: Partial<EditableLine>) {
    setStages((prev) =>
      prev.map((s) =>
        s._key === stageKey
          ? { ...s, lineItems: s.lineItems.map((li) => (li._key === lineKey ? { ...li, ...patch } : li)) }
          : s,
      ),
    );
    markDirty();
  }

  function pickWorkType(stageKey: string, lineKey: string, workTypeId: number | null) {
    if (workTypeId == null) {
      // Переход в «свой вариант» — оставляем name/unit, чтобы можно было доредактировать.
      updateLine(stageKey, lineKey, { workTypeId: null });
      return;
    }
    const wt = workTypes.find((w) => w.id === workTypeId);
    if (!wt) return;
    setStages((prev) =>
      prev.map((s) =>
        s._key === stageKey
          ? {
              ...s,
              lineItems: s.lineItems.map((li) =>
                li._key === lineKey
                  ? { ...li, workTypeId: wt.id, name: wt.name, unit: (li.unit ?? "").trim() || wt.defaultUnit || "" }
                  : li,
              ),
            }
          : s,
      ),
    );
    markDirty();
  }

  // ── Сериализация для API ────────────────────────────────────────────────────
  function serializeStages(): ObjectStage[] {
    return stages.map((s, idx) => ({
      title: s.title.trim() || `Этап ${idx + 1}`,
      order: idx,
      lineItems: s.lineItems
        .map((li) => {
          const name = (li.name ?? "").trim();
          const wt = li.workTypeId ? workTypes.find((w) => w.id === li.workTypeId) : null;
          const resolvedName = name || wt?.name || "";
          const out: ObjectStageLine = {
            workTypeId: li.workTypeId ?? null,
            name: resolvedName,
            unitPrice: Number(li.unitPrice) || 0,
          };
          const unit = (li.unit ?? "").trim() || wt?.defaultUnit || "";
          if (unit) out.unit = unit;
          const q = Number(li.quantity);
          if (Number.isFinite(q) && q > 0) out.quantity = q;
          return out;
        })
        .filter((li) => li.name && li.unitPrice > 0),
    }));
  }

  function validate(): string | null {
    const s = serializeStages();
    const total = s.reduce((n, st) => n + st.lineItems.length, 0);
    if (total === 0) return "Добавьте хотя бы одну позицию с ценой";
    return null;
  }

  async function persist(): Promise<number | null> {
    if (orderId == null) return null;
    const err = validate();
    if (err) {
      toast.error(err);
      return null;
    }
    const view = await cabinetObjects.save({
      orderId,
      stages: serializeStages(),
      area: area.trim() ? Number(area) : null,
      zhk: zhk.trim() || null,
      objectType,
      publishConsent: consent || undefined,
    });
    setObjectId(view.id);
    setDirty(false);
    return view.id;
  }

  async function handleSave() {
    if (busy) return;
    setBusy(true);
    try {
      const id = await persist();
      if (id != null) toast.success("Черновик сохранён");
    } catch (e) {
      toast.error(e instanceof CabinetApiError ? e.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish() {
    if (busy) return;
    if (!consent) {
      toast.error("Отметьте согласие клиента на публикацию");
      return;
    }
    setBusy(true);
    try {
      const id = await persist();
      if (id == null) return;
      const res = await cabinetObjects.publish(id, consent);
      setPublished(true);
      setPublicUrl(res.url);
      toast.success(
        res.pricePoints > 0
          ? `Опубликовано · ${res.pricePoints} позиций в аналитике цен`
          : "Объект опубликован",
      );
    } catch (e) {
      toast.error(e instanceof CabinetApiError ? e.message : "Не удалось опубликовать");
    } finally {
      setBusy(false);
    }
  }

  // ── Фото ─────────────────────────────────────────────────────────────────────
  async function handlePhoto(type: "before" | "after", file: File) {
    if (orderId == null || busy) return;
    setBusy(true);
    try {
      const url = await uploadPhoto(file);
      await cabinetOrders.addPhoto(orderId, type, url);
      if (type === "before") setBeforePhotos((p) => [...p, url]);
      else setAfterPhotos((p) => [...p, url]);
      toast.success("Фото добавлено");
    } catch (e) {
      toast.error(e instanceof CabinetApiError ? e.message : "Не удалось загрузить фото");
    } finally {
      setBusy(false);
    }
  }

  // ── Рендер ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner large />
      </div>
    );
  }
  if (loadError || !order) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm text-[var(--color-muted)]">{loadError ?? "Заказ не найден"}</p>
        <Link href="/cabinet/orders" className="mt-4 inline-block text-sm font-semibold text-[var(--color-primary)]">
          ← К заказам
        </Link>
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-3xl space-y-6 px-4 pb-40 pt-4 sm:px-6">
      <datalist id="stage-suggestions">
        {STAGE_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {/* Header */}
      <header className="space-y-3">
        <Link
          href={`/cabinet/orders/${order.orderId}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-muted)] transition hover:text-[var(--color-text)]"
        >
          <Icon name="back" /> Назад к заказу
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-black tracking-tight text-[var(--color-text)]">Карточка Объекта</h1>
          <StatusBadge published={published} />
        </div>
        <p className="text-sm text-[var(--color-muted)]">
          {order.serviceType} · {order.city}
          {order.district ? `, ${order.district}` : ""}
        </p>
      </header>

      {/* Тип Объекта */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm sm:p-6">
        <SectionTitle>Тип</SectionTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <TypeCard
            active={objectType === "project"}
            onClick={() => {
              setObjectType("project");
              markDirty();
            }}
            title="Проект"
            desc="Крупный ремонт под ключ. Получит страницу-кейс /raboty."
          />
          <TypeCard
            active={objectType === "task"}
            onClick={() => {
              setObjectType("task");
              markDirty();
            }}
            title="Задача"
            desc="Небольшая работа. Идёт в аналитику цен без отдельной страницы."
          />
        </div>
      </section>

      {/* Этапы */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <SectionTitle>Смета по этапам</SectionTitle>
          {pricedLines > 0 ? (
            <span className="text-xs font-medium text-[var(--color-muted)]">
              {pricedLines} поз. в аналитику цен
            </span>
          ) : null}
        </div>

        {stages.map((stage, idx) => (
          <StageCard
            key={stage._key}
            index={idx}
            stage={stage}
            workTypes={workTypes}
            canRemove={stages.length > 1}
            onTitle={(title) => updateStage(stage._key, { title })}
            onRemove={() => removeStage(stage._key)}
            onAddLine={() => addLine(stage._key)}
            onRemoveLine={(lk) => removeLine(stage._key, lk)}
            onLine={(lk, patch) => updateLine(stage._key, lk, patch)}
            onPickWorkType={(lk, id) => pickWorkType(stage._key, lk, id)}
          />
        ))}

        <button
          type="button"
          onClick={addStage}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--color-border)] bg-white/40 py-3.5 text-sm font-semibold text-[var(--color-muted)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <Icon name="plus" /> Добавить этап
        </button>

        <div className="flex items-center justify-between rounded-2xl bg-[var(--color-text)] px-5 py-4 text-white">
          <span className="text-sm font-semibold uppercase tracking-wider opacity-80">Итого по смете</span>
          <span className="text-xl font-black">{money(grandTotal)} ₽</span>
        </div>
      </section>

      {/* Параметры */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm sm:p-6">
        <SectionTitle>Параметры</SectionTitle>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Площадь, м²">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={area}
              onChange={(e) => {
                setArea(e.target.value);
                markDirty();
              }}
              placeholder="напр. 54"
              className={inputClass}
            />
          </Field>
          <Field label="ЖК / комплекс" hint="Показывается публично, без точного адреса">
            <input
              type="text"
              value={zhk}
              onChange={(e) => {
                setZhk(e.target.value);
                markDirty();
              }}
              placeholder="напр. ЖК Символ"
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      {/* Фото */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm sm:p-6">
        <SectionTitle>Фото до / после</SectionTitle>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Фото хранятся в заказе и показываются на странице-кейсе.
        </p>
        <div className="mt-4 space-y-4">
          <PhotoGrid
            label="До"
            tone="muted"
            photos={beforePhotos}
            busy={busy}
            inputRef={beforeInputRef}
            onAdd={(f) => handlePhoto("before", f)}
          />
          <PhotoGrid
            label="После"
            tone="primary"
            photos={afterPhotos}
            busy={busy}
            inputRef={afterInputRef}
            onAdd={(f) => handlePhoto("after", f)}
          />
        </div>
      </section>

      {/* Публикация */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm sm:p-6">
        <SectionTitle>Публикация</SectionTitle>
        <label className="mt-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              markDirty();
            }}
            className="mt-0.5 h-5 w-5 flex-shrink-0 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
          />
          <span className="text-sm text-[var(--color-text)]">
            Клиент разрешил опубликовать фото объекта и цены. Данные клиента и точный адрес не публикуются.
          </span>
        </label>

        {published && publicUrl ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <Icon name="check" />
            <span>Объект опубликован.</span>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-emerald-700 underline underline-offset-2"
            >
              Открыть кейс
            </a>
          </div>
        ) : null}
      </section>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-border)] bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="flex-1 rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)] disabled:opacity-50 sm:flex-none sm:px-6"
          >
            {busy ? <Spinner /> : "Сохранить черновик"}
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={busy || !consent}
            className="flex-1 rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Spinner /> : published ? "Обновить публикацию" : "Опубликовать кейс"}
          </button>
        </div>
        {dirty && !busy ? (
          <p className="mx-auto mt-1.5 max-w-3xl text-center text-[11px] text-[var(--color-muted)]">
            Есть несохранённые изменения
          </p>
        ) : null}
      </div>
    </article>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function StageCard({
  index,
  stage,
  workTypes,
  canRemove,
  onTitle,
  onRemove,
  onAddLine,
  onRemoveLine,
  onLine,
  onPickWorkType,
}: {
  index: number;
  stage: EditableStage;
  workTypes: WorkTypeOption[];
  canRemove: boolean;
  onTitle: (title: string) => void;
  onRemove: () => void;
  onAddLine: () => void;
  onRemoveLine: (lineKey: string) => void;
  onLine: (lineKey: string, patch: Partial<EditableLine>) => void;
  onPickWorkType: (lineKey: string, workTypeId: number | null) => void;
}) {
  const subtotal = stage.lineItems.reduce((a, li) => a + lineSum(li), 0);
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-background)]/50 px-4 py-3">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-xs font-bold text-[var(--color-primary)]">
          {index + 1}
        </span>
        <input
          type="text"
          value={stage.title}
          onChange={(e) => onTitle(e.target.value)}
          list="stage-suggestions"
          placeholder={`Этап ${index + 1}`}
          className="flex-1 bg-transparent text-sm font-bold text-[var(--color-text)] outline-none placeholder:font-medium placeholder:text-[var(--color-muted)]"
        />
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Удалить этап"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-muted)] transition hover:bg-red-50 hover:text-red-500"
          >
            <Icon name="trash" />
          </button>
        ) : null}
      </div>

      <div className="divide-y divide-[var(--color-border)]/60">
        {stage.lineItems.map((li) => (
          <LineRow
            key={li._key}
            line={li}
            workTypes={workTypes}
            canRemove={stage.lineItems.length > 1}
            onChange={(patch) => onLine(li._key, patch)}
            onPickWorkType={(id) => onPickWorkType(li._key, id)}
            onRemove={() => onRemoveLine(li._key)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={onAddLine}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-primary)] transition hover:opacity-80"
        >
          <Icon name="plus" /> Позиция
        </button>
        <span className="text-sm font-semibold text-[var(--color-muted)]">{money(subtotal)} ₽</span>
      </div>
    </div>
  );
}

function LineRow({
  line,
  workTypes,
  canRemove,
  onChange,
  onPickWorkType,
  onRemove,
}: {
  line: EditableLine;
  workTypes: WorkTypeOption[];
  canRemove: boolean;
  onChange: (patch: Partial<EditableLine>) => void;
  onPickWorkType: (workTypeId: number | null) => void;
  onRemove: () => void;
}) {
  // Отображаемое имя/ед.: если выбран вид работ и своё поле пусто — берём из словаря.
  const wt = line.workTypeId ? workTypes.find((w) => w.id === line.workTypeId) : null;
  const displayName = line.name ?? "";
  const displayUnit = line.unit ?? "";
  const isCustom = !line.workTypeId;
  const sum = lineSum(line);

  const grouped = useMemo(() => {
    const projects = workTypes.filter((w) => w.category === "project");
    const tasks = workTypes.filter((w) => w.category !== "project");
    return { projects, tasks };
  }, [workTypes]);

  return (
    <div className="grid grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-12 sm:items-center sm:gap-3">
      {/* Вид работ */}
      <div className="col-span-2 sm:col-span-5">
        <select
          value={line.workTypeId ?? ""}
          onChange={(e) => onPickWorkType(e.target.value ? Number(e.target.value) : null)}
          className={`${inputClass} appearance-none pr-8`}
        >
          <option value="">— свой вариант —</option>
          {grouped.projects.length > 0 ? (
            <optgroup label="Крупные работы">
              {grouped.projects.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          {grouped.tasks.length > 0 ? (
            <optgroup label="Задачи">
              {grouped.tasks.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        {isCustom ? (
          <input
            type="text"
            value={displayName}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Название работы"
            className={`${inputClass} mt-2`}
          />
        ) : (
          <p className="mt-1 truncate px-1 text-xs text-[var(--color-muted)]" title={wt?.name}>
            {wt?.name}
          </p>
        )}
      </div>

      {/* Ед. */}
      <div className="sm:col-span-2">
        <input
          type="text"
          value={displayUnit}
          onChange={(e) => onChange({ unit: e.target.value })}
          placeholder={wt?.defaultUnit ?? "ед."}
          className={`${inputClass} text-center`}
          aria-label="Единица"
        />
      </div>

      {/* Кол-во */}
      <div className="sm:col-span-2">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={line.quantity ?? ""}
          onChange={(e) => onChange({ quantity: e.target.value ? Number(e.target.value) : undefined })}
          placeholder="кол-во"
          className={`${inputClass} text-center`}
          aria-label="Количество"
        />
      </div>

      {/* Цена за ед. */}
      <div className="sm:col-span-2">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={line.unitPrice ? line.unitPrice : ""}
          onChange={(e) => onChange({ unitPrice: e.target.value ? Number(e.target.value) : 0 })}
          placeholder="цена"
          className={`${inputClass} text-right`}
          aria-label="Цена за единицу"
        />
      </div>

      {/* Сумма + удалить */}
      <div className="col-span-2 flex items-center justify-between sm:col-span-1 sm:justify-end">
        <span className="text-sm font-semibold text-[var(--color-text)] sm:hidden">{money(sum)} ₽</span>
        <span className="hidden text-xs font-semibold text-[var(--color-muted)] sm:inline">{money(sum)}</span>
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Удалить позицию"
            className="ml-2 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[var(--color-muted)] transition hover:bg-red-50 hover:text-red-500"
          >
            <Icon name="x" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TypeCard({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border-2 p-4 text-left transition ${
        active
          ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]/40"
          : "border-[var(--color-border)] bg-white hover:border-[var(--color-primary)]/40"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
            active ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"
          }`}
        >
          {active ? <span className="h-2 w-2 rounded-full bg-[var(--color-primary)]" /> : null}
        </span>
        <span className="text-sm font-bold text-[var(--color-text)]">{title}</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-muted)]">{desc}</p>
    </button>
  );
}

function PhotoGrid({
  label,
  tone,
  photos,
  busy,
  inputRef,
  onAdd,
}: {
  label: string;
  tone: "muted" | "primary";
  photos: string[];
  busy: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onAdd: (file: File) => void;
}) {
  const labelClass =
    tone === "primary"
      ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
      : "bg-[var(--color-background)] text-[var(--color-muted)]";
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className={`rounded-full px-3 py-0.5 text-xs font-semibold uppercase tracking-wider ${labelClass}`}>
          {label}
        </span>
        <span className="text-xs text-[var(--color-muted)]">{photos.length} / 10</span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5">
        {photos.map((url) => (
          <div key={url} className="relative aspect-square overflow-hidden rounded-xl bg-[var(--color-background)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resolvePhotoUrl(url)} alt="" className="h-full w-full object-cover" loading="lazy" />
          </div>
        ))}
        {photos.length < 10 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-background)]/40 transition hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]/30 disabled:opacity-50"
          >
            {busy ? <Spinner /> : <Icon name="plus" className="text-[var(--color-muted)]" />}
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

function StatusBadge({ published }: { published: boolean }) {
  return published ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Опубликован
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-background)] px-3 py-1 text-xs font-semibold text-[var(--color-muted)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-muted)]" /> Черновик
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text)]">{children}</h2>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-[var(--color-text)]">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-[var(--color-muted)]">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)] placeholder:text-[var(--color-muted)]";

function Spinner({ large }: { large?: boolean }) {
  const size = large ? "h-8 w-8" : "h-4 w-4";
  return (
    <span
      className={`inline-block ${size} animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]`}
      aria-label="Загрузка"
    />
  );
}

type IconName = "back" | "plus" | "x" | "trash" | "check";
function Icon({ name, className }: { name: IconName; className?: string }) {
  const cls = `inline-block ${className ?? ""}`.trim();
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: cls,
    "aria-hidden": true,
  };
  switch (name) {
    case "back":
      return (
        <svg {...common}>
          <path d="m15 18-6-6 6-6" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
  }
}
