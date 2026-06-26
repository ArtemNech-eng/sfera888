"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  cabinetPortfolio,
  CabinetApiError,
  type PortfolioItem,
  type PortfolioValidationError,
  type CabinetHousingType,
} from "../_lib/cabinetClient";
import { resolvePhotoUrl } from "../_lib/photo";

interface Props {
  /** Existing case for edit mode, or null for create mode. */
  existingItem: PortfolioItem | null;
  /** Optional master city, displayed below the form. */
  masterCity?: string | null;
}

/**
 * Full portfolio case editor (plan §18.3 W2).
 *
 * Ports the master-pwa `<PortfolioEditor>` (profile.tsx ~1140-1640) verbatim
 * but inline on a dedicated `/cabinet/portfolio/new` or
 * `/cabinet/portfolio/[id]/edit` page (no bottom-sheet overlay — desktop-first).
 *
 * The flow has three parts:
 *   1. **Description assistant** — 5 structured fields → server-side template
 *      assembles a paragraph (no AI). Optional `Sparkles` button calls the
 *      AI smoothing endpoint to polish grammar (never adds facts).
 *   2. **Form** — title, description, optional price/area/date, plus
 *      before/after photo grids. Photos auto-create a draft case on first
 *      upload (mirroring master-pwa's `ensureCaseId`).
 *   3. **Publish heuristic** — title ≥ 5 chars + description ≥ 50 chars + at
 *      least one photo means the case auto-publishes on next Save. Backend
 *      re-evaluates on every PATCH.
 */
export function PortfolioEditor({ existingItem, masterCity }: Props) {
  const router = useRouter();

  const [currentId, setCurrentId] = useState<number | null>(existingItem?.id ?? null);
  const [title, setTitle] = useState(existingItem?.title ?? "");
  const [description, setDescription] = useState(existingItem?.description ?? "");
  const [priceFrom, setPriceFrom] = useState(existingItem?.priceFrom ?? "");
  const [priceTo, setPriceTo] = useState(existingItem?.priceTo ?? "");
  const [area, setArea] = useState(existingItem?.area ?? "");
  const [completedAt, setCompletedAt] = useState(
    existingItem?.completedAt ? new Date(existingItem.completedAt).toISOString().slice(0, 10) : "",
  );
  // ── Iteration 2 fields (plan §22) ────────────────────────────────────────
  const [durationDays, setDurationDays] = useState<string>(
    existingItem?.durationDays != null ? String(existingItem.durationDays) : "",
  );
  const [housingType, setHousingType] = useState<CabinetHousingType | "">(
    existingItem?.housingType ?? "",
  );
  const [estimateWorks, setEstimateWorks] = useState<string>(
    existingItem?.estimate?.works != null ? String(existingItem.estimate.works) : "",
  );
  const [estimateMaterials, setEstimateMaterials] = useState<string>(
    existingItem?.estimate?.materials != null ? String(existingItem.estimate.materials) : "",
  );
  const [beforePhotos, setBeforePhotos] = useState<string[]>(existingItem?.beforePhotos ?? []);
  const [afterPhotos, setAfterPhotos] = useState<string[]>(existingItem?.afterPhotos ?? []);
  const [errors, setErrors] = useState<PortfolioValidationError[]>([]);
  const [busy, setBusy] = useState(false);

  // Description assistant state (not persisted server-side)
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistBefore, setAssistBefore] = useState("");
  const [assistSteps, setAssistSteps] = useState("");
  const [assistMaterials, setAssistMaterials] = useState("");
  const [assistChallenges, setAssistChallenges] = useState("");
  const [assistOther, setAssistOther] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [smoothBusy, setSmoothBusy] = useState(false);
  // 503 from the smoothing endpoint disables the button — no point teasing
  // the master with a feature that isn't configured on this deployment.
  const [smoothDisabled, setSmoothDisabled] = useState(false);

  const beforeInputRef = useRef<HTMLInputElement>(null);
  const afterInputRef = useRef<HTMLInputElement>(null);

  const errorsByField = (field: string) =>
    errors.filter((e) => e.field === field);
  const titleLen = title.trim().length;
  const descLen = description.trim().length;
  const totalPhotos = beforePhotos.length + afterPhotos.length;
  const willPublish = titleLen >= 5 && descLen >= 50 && totalPhotos > 0;

  // ── Description assistant ────────────────────────────────────────────────

  const handleAssemble = async () => {
    setAssistantBusy(true);
    try {
      const res = await cabinetPortfolio.assembleDescription({
        before: assistBefore.trim() || undefined,
        steps: assistSteps.trim() || undefined,
        materials: assistMaterials.trim() || undefined,
        challenges: assistChallenges.trim() || undefined,
        otherDetails: assistOther.trim() || undefined,
      });
      const text = (res.description ?? "").trim();
      if (!text) {
        toast.error("Заполните хотя бы одно поле в помощнике.");
        return;
      }
      if (
        description.trim().length > 0
        && !window.confirm("Заменить текущее описание собранным текстом?")
      ) {
        return;
      }
      setDescription(text.slice(0, 2000));
      toast.success("Готово. Можно отредактировать вручную.");
      setAssistantOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Не удалось собрать абзац";
      toast.error(msg);
    } finally {
      setAssistantBusy(false);
    }
  };

  const handleSmooth = async () => {
    const text = description.trim();
    if (text.length < 20) {
      toast.error("Слишком короткий текст для AI-редактирования.");
      return;
    }
    setSmoothBusy(true);
    try {
      const res = await cabinetPortfolio.smoothDescription(text);
      if (!res.description) {
        toast.error(res.note ?? "Не удалось обработать текст.");
        return;
      }
      if (
        !window.confirm(
          "Заменить текущее описание AI-улучшенным вариантом?\n\nAI не добавляет фактов — только полирует грамматику и связки.",
        )
      ) {
        return;
      }
      setDescription(res.description.slice(0, 2000));
      toast.success("Готово.");
    } catch (err) {
      if (err instanceof CabinetApiError && err.status === 503) {
        setSmoothDisabled(true);
        toast.error("AI-помощник временно недоступен.");
        return;
      }
      const msg = err instanceof Error ? err.message : "Ошибка";
      toast.error(msg);
    } finally {
      setSmoothBusy(false);
    }
  };

  // ── Photo upload (auto-creates draft on first add) ───────────────────────

  /**
   * Build the Iteration-2 payload bits (durationDays / housingType / estimate)
   * from the form state. Returns an object with keys to spread into the
   * cabinet API call. Empty fields produce explicit `null` so the user can
   * clear them on save.
   */
  const buildIter2Payload = () => {
    const durationParsed = durationDays.trim().length > 0 ? parseInt(durationDays, 10) : null;
    const worksNum = estimateWorks.trim().length > 0 ? parseInt(estimateWorks, 10) : null;
    const materialsNum = estimateMaterials.trim().length > 0 ? parseInt(estimateMaterials, 10) : null;
    const estimate =
      worksNum != null && materialsNum != null && Number.isFinite(worksNum) && Number.isFinite(materialsNum)
        ? { works: worksNum, materials: materialsNum }
        : null;
    return {
      durationDays: durationParsed != null && Number.isFinite(durationParsed) ? durationParsed : null,
      housingType: (housingType === "" ? null : housingType) as CabinetHousingType | null,
      estimate,
    };
  };

  const ensureCaseId = async (): Promise<number> => {
    if (currentId) return currentId;
    const iter2 = buildIter2Payload();
    const res = await cabinetPortfolio.create({
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      priceFrom: priceFrom || undefined,
      priceTo: priceTo || undefined,
      area: area || undefined,
      completedAt: completedAt || undefined,
      durationDays: iter2.durationDays,
      housingType: iter2.housingType,
      estimate: iter2.estimate,
    });
    setCurrentId(res.item.id);
    // Replace URL so refresh keeps the draft id intact (without history spam).
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/cabinet/portfolio/${res.item.id}/edit`);
    }
    return res.item.id;
  };

  const handleAddPhoto = async (type: "before" | "after", file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Выберите изображение");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Файл больше 8 МБ — слишком большой");
      return;
    }
    setBusy(true);
    try {
      const id = await ensureCaseId();
      const res = await cabinetPortfolio.uploadPhoto(id, type, file);
      if (type === "before") setBeforePhotos((p) => [...p, res.url]);
      else setAfterPhotos((p) => [...p, res.url]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка загрузки фото";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleRemovePhoto = async (type: "before" | "after", url: string) => {
    if (!currentId) return;
    setBusy(true);
    try {
      await cabinetPortfolio.removePhoto(currentId, type, url);
      if (type === "before") setBeforePhotos((p) => p.filter((u) => u !== url));
      else setAfterPhotos((p) => p.filter((u) => u !== url));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  // ── Save / Delete ────────────────────────────────────────────────────────

  const handleSave = async () => {
    setBusy(true);
    setErrors([]);
    try {
      const id = await ensureCaseId();
      const iter2 = buildIter2Payload();
      const res = await cabinetPortfolio.update(id, {
        title: title.trim() || null,
        description: description.trim() || null,
        priceFrom: priceFrom || null,
        priceTo: priceTo || null,
        area: area || null,
        completedAt: completedAt || null,
        durationDays: iter2.durationDays,
        housingType: iter2.housingType,
        estimate: iter2.estimate,
      });
      toast.success(
        res.item.isPublished
          ? "Кейс сохранён и опубликован на сайте"
          : "Сохранено. Добавьте фото для публикации.",
      );
      router.push(`/cabinet/portfolio/${id}`);
    } catch (err) {
      const data = err instanceof CabinetApiError ? err.data : undefined;
      const validationErrors = (data as { errors?: PortfolioValidationError[] })?.errors;
      if (validationErrors && Array.isArray(validationErrors)) {
        setErrors(validationErrors);
        toast.error("Исправьте ошибки в полях.");
      } else {
        const msg = err instanceof Error ? err.message : "Ошибка сохранения";
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!currentId) {
      router.push("/cabinet/portfolio");
      return;
    }
    if (!window.confirm("Удалить кейс? Действие не отменить.")) return;
    setBusy(true);
    try {
      await cabinetPortfolio.remove(currentId);
      toast.success("Кейс удалён");
      router.push("/cabinet/portfolio");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={existingItem ? `/cabinet/portfolio/${existingItem.id}` : "/cabinet/portfolio"}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-text)]"
          >
            <Icon name="back" />
            {existingItem ? "К кейсу" : "Все кейсы"}
          </Link>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-primary)]">
            {existingItem ? `Кейс №${existingItem.id}` : "Новый кейс"}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
            {existingItem ? "Редактировать" : "Создать кейс"}
          </h1>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-cta)] px-5 py-2.5 text-sm font-semibold text-[var(--color-on-cta)] shadow-sm transition hover:bg-[var(--color-primary-strong)] disabled:opacity-60"
        >
          {busy ? <Spinner /> : <Icon name="check" />}
          Сохранить
        </button>
      </header>

      {/* Status banner */}
      <div
        className={`rounded-2xl border p-4 text-sm ${
          willPublish
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-muted)]"
        }`}
      >
        {willPublish ? (
          <>
            <span className="font-semibold">Готов к публикации.</span> При сохранении кейс появится
            на странице <span className="font-semibold">/raboty</span>.
          </>
        ) : (
          <>
            <span className="font-semibold text-[var(--color-text)]">Черновик.</span>
            {" "}
            Для публикации нужны: название от 5 символов, описание от 50 символов и хотя бы одно фото.
          </>
        )}
      </div>

      {/* Title */}
      <Field
        label="Название кейса"
        required
        right={
          <span className={titleLen < 5 || titleLen > 200 ? "text-red-600" : "text-[var(--color-muted)]"}>
            {titleLen}/200
            {titleLen < 5 ? " (мин. 5)" : ""}
          </span>
        }
        errors={errorsByField("title")}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 200))}
          placeholder="Например: «Ремонт ванной 4 м² за 7 дней»"
          className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
        />
      </Field>

      {/* Description assistant (collapsible) */}
      <div className="overflow-hidden rounded-2xl border border-[var(--color-primary-soft)] bg-[var(--color-primary-soft)]/30">
        <button
          type="button"
          onClick={() => setAssistantOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-[var(--color-primary-soft)]/50"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
            <Icon name="wand" className="text-[var(--color-primary)]" />
            Помощник: собрать описание из тезисов
          </span>
          <Icon name={assistantOpen ? "chevron-up" : "chevron-down"} className="text-[var(--color-muted)]" />
        </button>
        {assistantOpen ? (
          <div className="space-y-3 border-t border-[var(--color-primary-soft)] px-4 py-3">
            <p className="text-xs leading-relaxed text-[var(--color-muted)]">
              Заполните 1–3 поля своими словами. Из тезисов соберём связный абзац — без AI, без вымысла.
            </p>
            <AssistantField
              label="Что было ДО ремонта"
              value={assistBefore}
              onChange={(v) => setAssistBefore(v.slice(0, 500))}
              placeholder="старая плитка, плесень, проводка наружу"
            />
            <AssistantField
              label="Что вы сделали (по шагам, каждый шаг с новой строки)"
              value={assistSteps}
              onChange={(v) => setAssistSteps(v.slice(0, 1500))}
              placeholder={"снял старое покрытие\nпроложил новые трубы\nположил тёплый пол"}
              rows={4}
            />
            <AssistantField
              label="Использованные материалы"
              value={assistMaterials}
              onChange={(v) => setAssistMaterials(v.slice(0, 1000))}
              placeholder="плитка Cersanit 30×60, затирка Litokol, гидроизоляция"
              rows={2}
            />
            <AssistantField
              label="Что было сложно (если что-то)"
              value={assistChallenges}
              onChange={(v) => setAssistChallenges(v.slice(0, 600))}
              placeholder="трубы под полом нужно было перекладывать"
            />
            <AssistantField
              label="Что-то ещё (опционально)"
              value={assistOther}
              onChange={(v) => setAssistOther(v.slice(0, 600))}
              placeholder="клиент остался доволен, заехал через неделю"
            />
            <button
              type="button"
              onClick={handleAssemble}
              disabled={
                assistantBusy
                || (!assistBefore.trim()
                  && !assistSteps.trim()
                  && !assistMaterials.trim()
                  && !assistChallenges.trim()
                  && !assistOther.trim())
              }
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-cta)] text-sm font-semibold text-[var(--color-on-cta)] transition hover:bg-[var(--color-primary-strong)] disabled:opacity-50"
            >
              {assistantBusy ? <Spinner /> : <Icon name="wand" />}
              Собрать абзац
            </button>
          </div>
        ) : null}
      </div>

      {/* Description */}
      <Field
        label="Описание работы"
        required
        right={
          <span className={descLen < 50 ? "text-red-600" : "text-[var(--color-muted)]"}>
            {descLen}/2000
            {descLen < 50 ? " (мин. 50)" : ""}
          </span>
        }
        errors={errorsByField("description")}
      >
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
          rows={6}
          placeholder="Что делали, какие материалы, сложности, результат. Без телефонов и ссылок."
          className="w-full resize-y rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm leading-relaxed focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
        />
        {!smoothDisabled && description.trim().length >= 20 ? (
          <div className="mt-2 flex items-start justify-between gap-3">
            <p className="flex-1 text-[11px] leading-relaxed text-[var(--color-muted)]">
              AI не добавит фактов — только подправит грамматику и сделает связнее. Используйте после ручного редактирования.
            </p>
            <button
              type="button"
              onClick={handleSmooth}
              disabled={smoothBusy}
              className="inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-primary)] bg-white px-3 text-xs font-semibold text-[var(--color-primary)] transition hover:bg-[var(--color-primary-soft)] disabled:opacity-50"
            >
              {smoothBusy ? <Spinner small /> : <Icon name="sparkles" />}
              Сделать читаемым
            </button>
          </div>
        ) : null}
      </Field>

      {/* Price + Area + Date */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Цена от ₽">
          <input
            type="text"
            inputMode="numeric"
            value={priceFrom ?? ""}
            onChange={(e) => setPriceFrom(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="20000"
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
          />
        </Field>
        <Field label="Цена до ₽">
          <input
            type="text"
            inputMode="numeric"
            value={priceTo ?? ""}
            onChange={(e) => setPriceTo(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="35000"
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
          />
        </Field>
        <Field label="Площадь, м²">
          <input
            type="text"
            inputMode="decimal"
            value={area ?? ""}
            onChange={(e) => setArea(e.target.value.replace(/[^\d.,]/g, "").replace(",", "."))}
            placeholder="4.5"
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
          />
        </Field>
        <Field label="Дата завершения">
          <input
            type="date"
            value={completedAt}
            onChange={(e) => setCompletedAt(e.target.value)}
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
          />
        </Field>
      </div>
      {masterCity ? (
        <p className="text-xs text-[var(--color-muted)]">
          Город — <span className="font-semibold text-[var(--color-text)]">{masterCity}</span> (берётся из профиля).
        </p>
      ) : null}

      {/* ── Iteration 2: срок, тип жилья, смета (план §22) ──────────────── */}
      <section className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 sm:p-5">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            Детали объекта
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">
            Срок, тип жилья и смета — заполните чтобы кейс получал больше просмотров и заявок.
            Поля необязательные, но кейсы со сметой выдают +30% переходов на форму.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Срок выполнения, дней"
            errors={errorsByField("durationDays")}
          >
            <input
              type="text"
              inputMode="numeric"
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
              placeholder="14"
              className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
            />
          </Field>
          <Field
            label="Тип жилья"
            errors={errorsByField("housingType")}
          >
            <select
              value={housingType}
              onChange={(e) => setHousingType((e.target.value as CabinetHousingType | "") || "")}
              className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
            >
              <option value="">— не указано —</option>
              <option value="novostroyka">Новостройка</option>
              <option value="vtorichka">Вторичка</option>
              <option value="chastnyy_dom">Частный дом</option>
              <option value="kommerciya">Коммерческое помещение</option>
            </select>
          </Field>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Смета
          </h3>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <Field
              label="Стоимость работ, ₽"
              errors={errorsByField("estimate.works")}
            >
              <input
                type="text"
                inputMode="numeric"
                value={estimateWorks}
                onChange={(e) => setEstimateWorks(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="85000"
                className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
              />
            </Field>
            <Field
              label="Стоимость материалов, ₽"
              errors={errorsByField("estimate.materials")}
            >
              <input
                type="text"
                inputMode="numeric"
                value={estimateMaterials}
                onChange={(e) => setEstimateMaterials(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="52000"
                className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
              />
            </Field>
          </div>
          {estimateWorks && estimateMaterials ? (
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              Итого:{" "}
              <span className="font-semibold text-[var(--color-text)]">
                {(parseInt(estimateWorks, 10) + parseInt(estimateMaterials, 10)).toLocaleString("ru-RU")} ₽
              </span>
              {priceFrom && Math.abs(parseInt(estimateWorks, 10) + parseInt(estimateMaterials, 10) - parseInt(priceFrom, 10)) > parseInt(priceFrom, 10) * 0.1 ? (
                <span className="ml-2 text-amber-700">
                  ⚠️ Расходится с «Цена от» больше чем на 10%
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      </section>

      {/* Photos */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            Фото <span className="text-red-600">*</span>{" "}
            <span className="font-normal text-[var(--color-muted)]">— хотя бы одно</span>
          </h2>
          {errorsByField("photos").map((e, i) => (
            <p key={i} className="mt-1 text-xs text-red-600">{e.message}</p>
          ))}
        </div>
        <PhotoGrid
          label="До"
          tone="muted"
          photos={beforePhotos}
          busy={busy}
          inputRef={beforeInputRef}
          onAdd={(file) => handleAddPhoto("before", file)}
          onRemove={(url) => handleRemovePhoto("before", url)}
        />
        <PhotoGrid
          label="После"
          tone="primary"
          photos={afterPhotos}
          busy={busy}
          inputRef={afterInputRef}
          onAdd={(file) => handleAddPhoto("after", file)}
          onRemove={(url) => handleRemovePhoto("after", url)}
        />
      </section>

      {/* Bottom actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
        {currentId ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
          >
            <Icon name="trash" />
            Удалить кейс
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-cta)] px-5 py-2.5 text-sm font-semibold text-[var(--color-on-cta)] shadow-sm transition hover:bg-[var(--color-primary-strong)] disabled:opacity-60"
        >
          {busy ? <Spinner /> : <Icon name="check" />}
          {willPublish ? "Сохранить и опубликовать" : "Сохранить черновик"}
        </button>
      </div>
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function Field({
  label,
  required,
  right,
  errors,
  children,
}: {
  label: string;
  required?: boolean;
  right?: React.ReactNode;
  errors?: PortfolioValidationError[];
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-semibold text-[var(--color-text)]">
        <span>
          {label}
          {required ? <span className="ml-1 text-red-600">*</span> : null}
        </span>
        {right ? <span className="font-normal">{right}</span> : null}
      </div>
      {children}
      {errors?.map((e, i) => (
        <p key={i} className="text-xs text-red-600">{e.message}</p>
      ))}
    </div>
  );
}

function AssistantField({
  label,
  value,
  onChange,
  placeholder,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-medium text-[var(--color-text)]">{label}</label>
      {rows && rows > 1 ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs leading-relaxed focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 text-xs focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
        />
      )}
    </div>
  );
}

function PhotoGrid({
  label,
  tone,
  photos,
  busy,
  inputRef,
  onAdd,
  onRemove,
}: {
  label: string;
  tone: "muted" | "primary";
  photos: string[];
  busy: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onAdd: (file: File) => void;
  onRemove: (url: string) => void;
}) {
  const labelClass =
    tone === "primary"
      ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
      : "bg-[var(--color-background)] text-[var(--color-muted)]";
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span
          className={`rounded-full px-3 py-0.5 text-xs font-semibold uppercase tracking-wider ${labelClass}`}
        >
          {label}
        </span>
        <span className="text-xs text-[var(--color-muted)]">{photos.length} / 10</span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5">
        {photos.map((url) => (
          <div
            key={url}
            className="relative aspect-square overflow-hidden rounded-xl bg-[var(--color-background)]"
          >
            <img
              src={resolvePhotoUrl(url)}
              alt=""
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={() => onRemove(url)}
              disabled={busy}
              aria-label="Удалить фото"
              className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white shadow-sm transition hover:bg-black/80 disabled:opacity-50"
            >
              <Icon name="x" />
            </button>
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

// ── Icons (inline SVG, no lucide dep) ──────────────────────────────────────

function Icon({ name, className }: { name: IconName; className?: string }) {
  const cls = `inline-block ${className ?? ""}`.trim();
  switch (name) {
    case "back":
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden>
          <path d="m15 18-6-6 6-6" />
        </svg>
      );
    case "check":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case "wand":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden>
          <path d="M15 4V2" />
          <path d="M15 16v-2" />
          <path d="M8 9h2" />
          <path d="M20 9h2" />
          <path d="M17.8 11.8 19 13" />
          <path d="M15 9h.01" />
          <path d="M17.8 6.2 19 5" />
          <path d="m3 21 9-9" />
          <path d="M12.2 6.2 11 5" />
        </svg>
      );
    case "sparkles":
      return (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden>
          <path d="M12 3v3" />
          <path d="M12 18v3" />
          <path d="m5.6 5.6 2.1 2.1" />
          <path d="m16.3 16.3 2.1 2.1" />
          <path d="M3 12h3" />
          <path d="M18 12h3" />
          <path d="m5.6 18.4 2.1-2.1" />
          <path d="m16.3 7.7 2.1-2.1" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      );
    case "chevron-up":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden>
          <polyline points="18 15 12 9 6 15" />
        </svg>
      );
    case "plus":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden>
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </svg>
      );
    case "x":
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      );
    case "trash":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden>
          <path d="M3 6h18" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      );
  }
}

type IconName =
  | "back"
  | "check"
  | "wand"
  | "sparkles"
  | "chevron-down"
  | "chevron-up"
  | "plus"
  | "x"
  | "trash";

function Spinner({ small }: { small?: boolean }) {
  const size = small ? 11 : 14;
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
