"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DesignFullDTO, DesignFeedItemDTO, DesignStatus } from "../../lib/types";
import { SaveButton } from "./SaveButton";
import { DesignLeadForm } from "./DesignLeadForm";
import { ShareButton } from "./ShareButton";
import { BeforeAfterSlider } from "./BeforeAfterSlider";
import {
  viewsGridClass,
  row2TemplateClass,
  row3TemplateClass,
  shouldRenderRow3,
} from "./designBoardLayout";

/**
 * Подобранная под Layout_JSON позиция мебели — одна строка.
 */
export interface DesignPickedFurnitureDTO {
  layoutId: string;
  type: string;
  sku: string | null;
  name: string | null;
  pricePaidKopeks: number;
  partnerUrl: string | null;
  imageUrl: string | null;
}

const ROOM_LABELS_GENITIVE: Record<string, string> = {
  bathroom: "ванной",
  kitchen: "кухни",
  living_room: "гостиной",
  bedroom: "спальни",
  hallway: "прихожей",
  apartment: "квартиры",
  nursery: "детской",
};

const ROOM_LABELS_NOMINATIVE: Record<string, string> = {
  bathroom: "ванная",
  kitchen: "кухня",
  living_room: "гостиная",
  bedroom: "спальня",
  hallway: "прихожая",
  apartment: "квартира",
  nursery: "детская",
};

const STYLE_LABELS: Record<string, string> = {
  modern: "Современный",
  scandinavian: "Скандинавский",
  loft: "Лофт",
  minimalism: "Минимализм",
  neoclassic: "Неоклассика",
  japandi: "Японди",
  classic: "Классический",
};

interface SimilarBuckets {
  sameRoomStyle: DesignFeedItemDTO[];
  sameStyle: DesignFeedItemDTO[];
  similarBudget: DesignFeedItemDTO[];
}

interface Props {
  design: DesignFullDTO;
  similar?: SimilarBuckets;
  baseUrl: string;
  topDownPlanUrl?: string | null;
  pickedFurniture?: DesignPickedFurnitureDTO[] | null;
  currentStep?: string | null;
  designAnonId?: string | null;
}

const POLL_INTERVAL_MS = 3000;
const PIPELINE_STEP_LABELS: Record<string, string> = {
  layout_json: "Готовим план комнаты",
  hero_render: "Рисуем общий ракурс",
  angle_renders: "Дорисовываем ракурсы",
  top_down_plan: "Чертим вид сверху",
  isometric_render: "Собираем 3D-вид",
  detail_crops: "Вырезаем крупные планы",
  furniture_match: "Подбираем мебель",
  materials_estimate: "Считаем смету",
  color_palette: "Извлекаем палитру",
  ai_text: "Генерируем описание",
  infographic: "Собираем инфографику",
  pdf_render: "Готовим PDF",
};

export function DesignBoard({
  design,
  similar,
  baseUrl,
  pickedFurniture = null,
  currentStep: initialCurrentStep = null,
  designAnonId = null,
}: Props) {
  // ── Live status / polling state ────────────────────────────────────────────
  const [status, setStatus] = useState<DesignStatus>(design.status);
  const [progress, setProgress] = useState<number>(design.progress);
  const [currentStep, setCurrentStep] = useState<string | null>(initialCurrentStep);
  const [errorMessage, setErrorMessage] = useState<string | null>(design.errorMessage);

  // ── PDF download state ─────────────────────────────────────────────────────
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState(false);

  // ── Owner badge state ──────────────────────────────────────────────────────
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    if (!designAnonId) return;
    const cookieAnonId = readCookie("kiro_anon_id");
    if (cookieAnonId && cookieAnonId === designAnonId) {
      setIsOwner(true);
    }
  }, [designAnonId]);

  useEffect(() => {
    if (status !== "generating") return;
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch(
          `/api/dizajn/${encodeURIComponent(design.slug)}/status`,
          { cache: "no-store", credentials: "include" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok?: boolean;
          status?: DesignStatus;
          progress?: number;
          currentStep?: string | null;
          errorMessage?: string | null;
        };
        if (cancelled || !data.ok) return;
        if (typeof data.status === "string") setStatus(data.status);
        if (typeof data.progress === "number") {
          setProgress((prev) => Math.max(prev, data.progress!));
        }
        if (data.currentStep !== undefined) setCurrentStep(data.currentStep ?? null);
        if (data.errorMessage !== undefined) setErrorMessage(data.errorMessage ?? null);
      } catch {
        // Network errors silently ignored — next tick retries.
      }
    };

    const intervalId = window.setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [status, design.slug]);

  const handlePdfDownload = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const res = await fetch(
        `/api/dizajn/${encodeURIComponent(design.slug)}/pdf`,
        { credentials: "include" },
      );
      if (res.status === 503) { setPdfError(true); return; }
      if (!res.ok) { setPdfError(true); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `design-${design.slug}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setPdfError(true);
    } finally {
      setPdfBusy(false);
    }
  };

  const showPdfButton = status === "completed" && !pdfError && !pdfBusy;

  // ── Derived data ───────────────────────────────────────────────────────────
  const views = (design.views && design.views.length > 0)
    ? design.views.slice().sort((a, b) => a.position - b.position)
    : design.images
        .filter((img) => img.type.startsWith("view_"))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((img, idx) => ({
          url: img.url,
          label: LEGACY_VIEW_LABELS[img.type] ?? `Ракурс ${idx + 1}`,
          position: idx + 1,
        }));

  // Isometric — последний view (position >= 5) с лейблом "3D-планировка"
  const isometricView = views.find(
    (v) => v.label === "3D-планировка" || v.position >= 5,
  ) ?? null;

  // 4 основных ракурса (positions 1-4, без isometric)
  const mainViews = views.filter((v) => v !== isometricView).slice(0, 4);

  const detailCrops = design.detailCrops ?? [];

  // ── Адаптивная раскладка инфографики (чистые хелперы §A) ────────────────────
  const hasLeftColumn = Boolean(isometricView);
  const hasPalette = Boolean(design.colorPalette && design.colorPalette.length > 0);
  const hasSolutions = Boolean(design.solutions && design.solutions.length > 0);
  const hasCrops = detailCrops.length > 0;
  const row1Class = viewsGridClass(mainViews.length);
  const row2Class = row2TemplateClass({ hasLeft: hasLeftColumn, hasPalette });
  const row3Class = row3TemplateClass({ hasSolutions, hasCrops });
  const renderRow3 = shouldRenderRow3({ hasSolutions, hasCrops });

  const pickedFurnitureItems =
    pickedFurniture && pickedFurniture.length > 0 ? pickedFurniture : null;

  const styleLabel = STYLE_LABELS[design.style] ?? design.style;
  const roomGen = ROOM_LABELS_GENITIVE[design.roomType] ?? design.roomType;
  const roomNom = ROOM_LABELS_NOMINATIVE[design.roomType] ?? design.roomType;
  const cityIn = design.cityNameIn ?? (design.cityName ? `в ${design.cityName}` : null);
  const designUrl = `${baseUrl.replace(/\/+$/, "")}/dizajn/${design.slug}`;
  const shareTitle = design.h1 ?? `Дизайн ${roomGen} в стиле ${styleLabel}`;

  // Верхний блок: если есть фото «до» и hero «после» — рендерим пару «Было →
  // Стало» рядом с ракурсами 2×2 (заполняет ширину, без пустот). Иначе —
  // обычная адаптивная сетка ракурсов во всю ширину.
  const heroAfterUrl = mainViews[0]?.url ?? design.resultImageUrl ?? null;
  const showBeforeAfter = Boolean(design.inputImageUrl && heroAfterUrl);
  const renderViewFigure = (v: { url: string; label: string }, i: number) => (
    <figure key={v.url} className="relative overflow-hidden rounded-xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={v.url}
        alt={`${v.label} — ${shareTitle}`}
        className="aspect-[4/3] w-full object-cover"
        loading={i === 0 ? "eager" : "lazy"}
      />
      <figcaption className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
        {i + 1}. {v.label}
      </figcaption>
    </figure>
  );

  const totalEstimateRub = design.estimate
    ? Math.round(design.estimate.reduce((s, e) => s + e.amountKopeks, 0) / 100)
    : null;

  // Итемизированная смета «по позициям»: конкретная подобранная мебель
  // (из pickedFurniture) + оставшиеся категориальные строки сметы (отделка,
  // освещение, текстиль, прочее), исключая общий бакет «Мебель» — его
  // заменяют детальные позиции. Если мебель не подобрана, рендерим обычную
  // категориальную смету (fallback ниже в JSX).
  const itemizedEstimate = buildItemizedEstimate(pickedFurnitureItems, design.estimate);

  return (
    <article className="bg-[var(--color-background)]">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-7xl px-4 pb-6 pt-8 sm:px-6 sm:pt-10">
          <nav aria-label="Хлебные крошки" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-muted)]">
            <Link href="/" className="hover:text-[var(--color-text)]">Главная</Link>
            <span aria-hidden>/</span>
            <Link href="/dizajn" className="hover:text-[var(--color-text)]">AI-дизайн</Link>
            <span aria-hidden>/</span>
            <Link
              href={`/dizajn/${design.roomType.replace(/_/g, "-")}-${design.style}`}
              className="hover:text-[var(--color-text)]"
            >
              {capitalize(roomGen)} в стиле {styleLabel.toLowerCase()}
            </Link>
            <span aria-hidden>/</span>
            <span className="text-[var(--color-text)]">№{design.id}</span>
          </nav>

          <div className="mt-4 flex flex-wrap items-start gap-3">
            <h1 className="font-display max-w-4xl text-2xl text-[var(--color-text)] sm:text-3xl">
              {design.h1 ?? `Дизайн ${roomGen} в стиле ${styleLabel}`}
            </h1>
            {isOwner && (
              <span className="mt-1 inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-[var(--color-primary-ring)] bg-[var(--color-primary-soft)] px-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-primary-strong)]" aria-label="Это ваш проект">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
                ваш проект
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a
              href="#design-lead"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--color-cta)] px-5 text-sm font-semibold text-[var(--color-on-cta)] shadow-cozy-md transition hover:bg-[var(--color-cta-hover)]"
            >
              Хочу такой же
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
            </a>
            <SaveButton slug={design.slug} initialSaved={design.isSavedByCurrentUser} initialCount={design.saveCount} variant="pill" resolveSavedOnMount />
            <ShareButton shareUrl={designUrl} shareTitle={shareTitle} shareText={`Создал AI-дизайн-проект: ${shareTitle}. Посмотри.`} />
            {showPdfButton && (
              <button type="button" onClick={handlePdfDownload} disabled={pdfBusy} className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--color-text)] px-5 text-xs font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-text)] hover:text-white disabled:opacity-60" aria-label="Скачать дизайн-проект в PDF">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
                PDF
              </button>
            )}
            {pdfError && (
              <span role="status" className="inline-flex h-10 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-cream-deep)] px-4 text-xs text-[var(--color-muted)]">
                PDF временно недоступен
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ── Progress bar (generating) ─────────────────────── */}
      {status === "generating" && (
        <section className="bg-[var(--color-cream-deep)]" aria-live="polite" aria-busy="true">
          <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
            <p className="font-eyebrow">Готовим дизайн</p>
            <h2 className="font-display mt-1 text-lg text-[var(--color-text)] sm:text-xl">
              {pipelineStepLabel(currentStep)}
            </h2>
            <div className="mt-3 flex items-center justify-between text-xs text-[var(--color-muted)]">
              <span>Прогресс</span>
              <span className="font-semibold text-[var(--color-text)]">{Math.min(100, Math.max(0, Math.round(progress)))}%</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
              <div className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-1000" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-[var(--color-faint)]">Страница обновится автоматически.</p>
          </div>
        </section>
      )}

      {/* ── Failed banner ──────────────────────────────────── */}
      {status === "failed" && (
        <section className="bg-[var(--color-cream-deep)]" role="alert">
          <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
            <p className="font-eyebrow">Ошибка генерации</p>
            <h2 className="font-display mt-1 text-lg text-[var(--color-text)]">
              {errorMessage ?? "Не удалось завершить генерацию проекта."}
            </h2>
            <p className="mt-2 text-sm text-[var(--color-muted)]">Попробуйте создать новый проект.</p>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ИНФОГРАФИКА — compact one-screen layout (референс)
          ══════════════════════════════════════════════════════════════════════ */}
      {status === "completed" && (
        <section className="bg-[var(--color-background)]">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">

            {/* ВЕРХНИЙ БЛОК ракурсов. С фото «до» — пара «Было → Стало» слева
                и 4 ракурса сеткой 2×2 справа (заполняет всю ширину). Без фото —
                обычная адаптивная сетка ракурсов. */}
            {showBeforeAfter ? (
              <div className="grid gap-3 sm:gap-4 lg:grid-cols-2 lg:items-stretch">
                <div className="flex flex-col">
                  <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
                    Было → Стало
                  </h3>
                  <BeforeAfterSlider
                    beforeUrl={design.inputImageUrl as string}
                    afterUrl={heroAfterUrl as string}
                    alt={shareTitle}
                  />
                  <p className="mt-1.5 text-[11px] text-[var(--color-faint)]">
                    Перетащите разделитель, чтобы сравнить вашу комнату с дизайном.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  {mainViews.map(renderViewFigure)}
                </div>
              </div>
            ) : (
              <div className={row1Class}>
                {mainViews.map(renderViewFigure)}
              </div>
            )}

            {/* ROW 2: Изометрия + Параметры/Материалы/Смета + Палитра */}
            <div className={row2Class}>

              {/* LEFT: Isometric + Top-down plan — только при наличии */}
              {hasLeftColumn && (
                <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-cozy sm:p-4">
                  {isometricView && (
                    <figure className="overflow-hidden rounded-xl">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={isometricView.url} alt="3D-планировка" className="w-full rounded-xl" loading="lazy" />
                      <figcaption className="mt-1 text-[10px] text-center text-[var(--color-muted)]">3D-планировка</figcaption>
                    </figure>
                  )}
                </div>
              )}

              {/* CENTER: params + materials + estimate */}
              <div className="space-y-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-cozy sm:p-5">
                {/* Параметры проекта */}
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Параметры проекта</h3>
                  <dl className="mt-2 space-y-1 text-sm">
                    {design.area != null && (
                      <div className="flex justify-between"><dt className="text-[var(--color-muted)]">Площадь</dt><dd className="font-semibold">{design.area} м²</dd></div>
                    )}
                    <div className="flex justify-between"><dt className="text-[var(--color-muted)]">Стиль</dt><dd className="font-semibold">{styleLabel}</dd></div>
                    {design.budget != null && (
                      <div className="flex justify-between"><dt className="text-[var(--color-muted)]">Бюджет</dt><dd className="font-semibold">до {formatRub(design.budget)} ₽</dd></div>
                    )}
                    {design.durationWeeks != null && (
                      <div className="flex justify-between"><dt className="text-[var(--color-muted)]">Срок</dt><dd className="font-semibold">{design.durationWeeks} {pluralWeeks(design.durationWeeks)}</dd></div>
                    )}
                    {design.cityName && (
                      <div className="flex justify-between"><dt className="text-[var(--color-muted)]">Город</dt><dd className="font-semibold">{design.cityName}</dd></div>
                    )}
                  </dl>
                </div>

                {/* Рекомендуемые материалы */}
                {design.materials && design.materials.length > 0 && (
                  <div>
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Рекомендуемые материалы</h3>
                    <table className="mt-2 w-full text-xs">
                      <tbody>
                        {design.materials.map((m, i) => (
                          <tr key={i} className="border-b border-[var(--color-border)]">
                            <td className="py-1 pr-2 font-semibold text-[var(--color-text)]">{m.category}</td>
                            <td className="py-1 text-[var(--color-muted)]">{m.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Смета реализации */}
                {itemizedEstimate ? (
                  <div>
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
                      Смета {design.budget != null ? `(до ${formatRub(design.budget)} ₽)` : "реализации"}
                    </h3>
                    <table className="mt-2 w-full text-xs">
                      <tbody>
                        {itemizedEstimate.lines.map((line, i) => (
                          <tr key={i} className="border-b border-[var(--color-border)]">
                            <td className="py-1 pr-2 text-[var(--color-text)]">
                              {line.label}
                              {line.kind === "furniture" && (
                                <span className="ml-1 text-[9px] uppercase tracking-wide text-[var(--color-faint)]">мебель</span>
                              )}
                            </td>
                            <td className="py-1 text-right font-semibold whitespace-nowrap">{formatRub(line.rub)} ₽</td>
                          </tr>
                        ))}
                        <tr className="bg-[var(--color-cream-deep)]">
                          <td className="py-1.5 font-bold text-[var(--color-text)]">Итого</td>
                          <td className="py-1.5 text-right font-bold text-[var(--color-text)] whitespace-nowrap">{formatRub(itemizedEstimate.total)} ₽</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : design.estimate && design.estimate.length > 0 ? (
                  <div>
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Смета реализации</h3>
                    <table className="mt-2 w-full text-xs">
                      <tbody>
                        {design.estimate.map((e, i) => (
                          <tr key={i} className="border-b border-[var(--color-border)]">
                            <td className="py-1 text-[var(--color-text)]">{e.category}</td>
                            <td className="py-1 text-right font-semibold">{formatRub(Math.round(e.amountKopeks / 100))} ₽</td>
                          </tr>
                        ))}
                        {totalEstimateRub != null && (
                          <tr className="bg-[var(--color-cream-deep)]">
                            <td className="py-1.5 font-bold text-[var(--color-text)]">Итого</td>
                            <td className="py-1.5 text-right font-bold text-[var(--color-text)]">{formatRub(totalEstimateRub)} ₽</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>

              {/* RIGHT: palette — только при наличии данных (без плейсхолдера) */}
              {hasPalette && (
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-cozy sm:p-5 lg:min-w-[180px]">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Цветовая палитра</h3>
                  <ul className="mt-3 space-y-2.5">
                    {design.colorPalette!.slice(0, 5).map((swatch) => (
                      <li key={swatch.hex} className="flex items-center gap-2.5">
                        <span
                          className="h-7 w-7 shrink-0 rounded-full border border-[var(--color-border)] shadow-cozy"
                          style={{ backgroundColor: swatch.hex }}
                          title={swatch.name ?? swatch.hex}
                        />
                        <span className="min-w-0 leading-tight">
                          {swatch.name && (
                            <span className="block truncate text-xs font-medium text-[var(--color-text)]">{swatch.name}</span>
                          )}
                          <span className="block text-[10px] uppercase tracking-wide text-[var(--color-faint)]">{swatch.hex}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            </div>{/* end ROW 2 */}

            {/* ROW 3: Solutions + detail crops — адаптивно, не рендерим пустую */}
            {renderRow3 && (
              <div className={row3Class}>
                {/* Основные решения */}
                {hasSolutions && (
                  <div>
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)]">Основные решения</h3>
                    <ul className="mt-2 space-y-1 text-sm">
                      {design.solutions!.map((s, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-[var(--color-primary)]">•</span>
                          <span className="text-[var(--color-text)]">{s.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* detail crops in a row */}
                {hasCrops && (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {detailCrops.slice(0, 6).map((crop) => (
                      <figure key={crop.url} className="text-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={crop.url} alt={crop.label} className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
                        <figcaption className="mt-1 text-[10px] leading-tight text-[var(--color-muted)]">{crop.label}</figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </div>
            )}{/* end ROW 3 */}

          </div>
        </section>
      )}

      {/* ── Подобранная мебель (под инфографикой) ──────────── */}
      {pickedFurnitureItems && (
        <section className="bg-[var(--color-background)]">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
            <p className="font-eyebrow">Подобранная мебель</p>
            <h2 className="font-display mt-1 text-xl text-[var(--color-text)] sm:text-2xl">
              Что купить под проект.
            </h2>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pickedFurnitureItems.map((item, idx) => (
                <li key={`${item.layoutId}-${idx}`}>
                  <PickedFurnitureCard item={item} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── Похожие проекты ──────────────────────────────── */}
      {similar && (
        <section className="bg-[var(--color-cream-deep)]">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
            <p className="font-eyebrow">Похожие проекты</p>
            <div className="mt-5 space-y-8">
              <SimilarRow
                title={`Ещё ${roomGen} в стиле ${styleLabel.toLowerCase()}`}
                seeAllHref={`/dizajn/${design.roomType.replace(/_/g, "-")}-${design.style}`}
                designs={similar.sameRoomStyle}
              />
              <SimilarRow
                title={`Другие комнаты в стиле ${styleLabel.toLowerCase()}`}
                seeAllHref={`/dizajn/${design.style}`}
                designs={similar.sameStyle}
              />
              {design.budget ? (
                <SimilarRow
                  title={`Проекты с похожим бюджетом — около ${formatRub(design.budget)} ₽`}
                  seeAllHref="/dizajn"
                  designs={similar.similarBudget}
                />
              ) : (
                <SimilarRow title="Свежие AI-дизайны" seeAllHref="/dizajn" designs={similar.similarBudget} />
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── CTA: «Узнать стоимость» ──────────────────────── */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="flex flex-col items-start gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-cozy sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="max-w-xl">
              <h3 className="font-display text-lg text-[var(--color-text)] sm:text-xl">Узнайте стоимость под вашу комнату.</h3>
              <p className="mt-1 text-sm text-[var(--color-muted)]">Смета на странице — ориентир. Под конкретный объект мастер пересчитает после замера.</p>
            </div>
            <a href="#design-lead" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-[var(--color-text)] px-6 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-text)] hover:text-white">
              Узнать стоимость
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
            </a>
          </div>
        </div>
      </section>

      {/* ── Lead form (primary CTA «Хочу такой же») ──────── */}
      <section id="design-lead" className="scroll-mt-20 bg-[var(--color-text)]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary-ring)]">Хочу такой же</p>
              <h2 className="font-display mt-3 max-w-3xl text-2xl text-white sm:text-3xl lg:text-4xl">
                Подберём мастера, который сделает похоже.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
                Оставьте контакт — мы найдём проверенного мастера{cityIn ? ` ${cityIn}` : ""}, который работает в стиле {styleLabel.toLowerCase()}.
              </p>
              <ul className="mt-5 space-y-1.5 text-sm text-white/85">
                <li className="flex items-center gap-2"><Tick /> Без авансов и блокировок</li>
                <li className="flex items-center gap-2"><Tick /> Договор на каждом заказе</li>
                <li className="flex items-center gap-2"><Tick /> Оплата после выполнения</li>
                {design.budget && <li className="flex items-center gap-2"><Tick /> Бюджет до {formatRub(design.budget)} ₽</li>}
              </ul>
            </div>
            <div>
              <div className="rounded-2xl border border-white/15 bg-[var(--color-surface)] p-6 shadow-cozy-md sm:p-8">
                <DesignLeadForm slug={design.slug} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SEO: О стиле ──────────────────────────────────── */}
      {design.description && (
        <section className="bg-[var(--color-background)]">
          <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
            <p className="font-eyebrow">О проекте</p>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-[var(--color-muted)] whitespace-pre-line sm:text-base">
              {design.description}
            </div>
          </div>
        </section>
      )}

      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <p className="font-eyebrow">О стиле</p>
          <h2 className="font-display mt-2 text-xl text-[var(--color-text)] sm:text-2xl">
            {styleLabel} — кратко о направлении.
          </h2>
          <div className="mt-3 text-sm leading-relaxed text-[var(--color-muted)] sm:text-base">
            {STYLE_BRIEF[design.style] ?? `Стиль ${styleLabel.toLowerCase()} — самостоятельное направление в дизайне интерьеров.`}
          </div>
        </div>
      </section>

      {design.cityName && (
        <section className="bg-[var(--color-cream-deep)]">
          <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
            <p className="font-eyebrow">О городе</p>
            <h2 className="font-display mt-2 text-xl text-[var(--color-text)] sm:text-2xl">
              Реализация {cityIn ?? `в городе ${design.cityName}`}.
            </h2>
            <div className="mt-3 text-sm leading-relaxed text-[var(--color-muted)] sm:text-base">
              В каталоге проверенных мастеров {cityIn ?? design.cityName} есть специалисты, которые работают
              со стилем {styleLabel.toLowerCase()} и могут повторить этот концепт{design.district ? ` в районе ${design.district}` : ""}.
            </div>
          </div>
        </section>
      )}
    </article>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Tick() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-primary-ring)]" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SimilarRow({ title, seeAllHref, designs }: { title: string; seeAllHref: string; designs: DesignFeedItemDTO[] }) {
  if (!designs || designs.length === 0) return null;
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <h3 className="font-display text-base text-[var(--color-text)] sm:text-lg">{title}</h3>
        <Link href={seeAllHref} className="shrink-0 text-xs font-semibold text-[var(--color-primary)] hover:underline">Смотреть все →</Link>
      </div>
      <ul className="mt-3 grid gap-3 sm:grid-cols-3">
        {designs.slice(0, 3).map((d) => (
          <li key={d.id}>
            <Link href={`/dizajn/${d.slug}`} className="group block">
              <figure className="overflow-hidden rounded-xl bg-[var(--color-surface)] shadow-cozy">
                <div className="relative aspect-[4/3] w-full bg-[var(--color-cream-deep)]">
                  {d.resultImageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={d.resultImageUrl} alt={d.h1 ?? "AI-дизайн"} loading="lazy" className="block h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                  )}
                </div>
                <figcaption className="px-3 py-2 text-xs text-[var(--color-text)] line-clamp-2">{d.h1 ?? `Дизайн ${d.roomType} в стиле ${d.style}`}</figcaption>
              </figure>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BeforeAfterPair({ label, labelTone, url, alt }: { label: string; labelTone: "muted" | "brand"; url: string; alt: string }) {
  const labelClass = labelTone === "brand" ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-text)] text-white";
  return (
    <figure className="relative overflow-hidden rounded-xl bg-[var(--color-surface)] shadow-cozy">
      <div className="relative aspect-[4/3] w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} loading="lazy" className="block h-full w-full object-cover" />
      </div>
      <figcaption className={`absolute top-2 left-2 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${labelClass}`}>{label}</figcaption>
    </figure>
  );
}

// Keep BeforeAfterPair exported for potential reuse
export { BeforeAfterPair };

const FURNITURE_TYPE_LABELS: Record<string, string> = {
  bed: "Кровать",
  wardrobe: "Шкаф",
  desk: "Рабочий стол",
  chair: "Кресло",
  nightstand: "Прикроватная тумба",
  rug: "Ковёр",
  sofa: "Диван",
  dining_table: "Обеденный стол",
  bookshelf: "Стеллаж",
  tv_unit: "ТВ-тумба",
};

function furnitureTypeLabel(type: string): string {
  return FURNITURE_TYPE_LABELS[type] ?? capitalize(type.replace(/_/g, " "));
}

/** Строка итемизированной сметы. */
interface ItemizedEstimateLine {
  label: string;
  rub: number;
  kind: "furniture" | "category";
}

/**
 * Собирает смету «по позициям» в стиле референса: конкретная подобранная
 * мебель (из `pickedFurniture`, с реальными ценами и названиями) + оставшиеся
 * категориальные строки сметы (отделка, освещение, текстиль, прочее), кроме
 * общего бакета «Мебель» — его заменяют детальные позиции.
 *
 * Возвращает `null`, если нет ни одной подобранной мебельной позиции с ценой —
 * тогда UI рендерит обычную категориальную смету.
 */
function buildItemizedEstimate(
  picked: DesignPickedFurnitureDTO[] | null,
  estimate: { category: string; amountKopeks: number }[] | null,
): { lines: ItemizedEstimateLine[]; total: number } | null {
  const furnitureLines: ItemizedEstimateLine[] = (picked ?? [])
    .filter((p) => p.sku !== null && p.pricePaidKopeks > 0)
    .map((p) => ({
      label: p.name ?? furnitureTypeLabel(p.type),
      rub: Math.round(p.pricePaidKopeks / 100),
      kind: "furniture" as const,
    }));

  if (furnitureLines.length === 0) return null;

  // Категориальные строки, кроме «Мебель» (её заменяют детальные позиции).
  const categoryLines: ItemizedEstimateLine[] = (estimate ?? [])
    .filter((e) => !/мебел/i.test(e.category) && e.amountKopeks > 0)
    .map((e) => ({
      label: e.category,
      rub: Math.round(e.amountKopeks / 100),
      kind: "category" as const,
    }));

  const lines = [...furnitureLines, ...categoryLines];
  const total = lines.reduce((sum, l) => sum + l.rub, 0);
  return { lines, total };
}

function PickedFurnitureCard({ item }: { item: DesignPickedFurnitureDTO }) {
  const typeLabel = furnitureTypeLabel(item.type);

  if (item.sku === null) {
    return (
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center shadow-cozy/40">
        <div className="flex flex-1 items-center justify-center rounded-lg bg-[var(--color-cream-deep)] py-6 text-[10px] uppercase tracking-wide text-[var(--color-faint)]">
          Нет фото
        </div>
        <p className="mt-3 text-sm font-semibold text-[var(--color-text)]">{typeLabel}</p>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">уточняется</p>
      </div>
    );
  }

  const priceRub = Math.round(item.pricePaidKopeks / 100);
  const cardBody = (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-cozy">
      <div className="relative aspect-[4/3] w-full bg-[var(--color-cream-deep)]">
        {item.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={item.imageUrl} alt={item.name ?? typeLabel} loading="lazy" className="block h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
        )}
      </div>
      <div className="flex flex-1 flex-col justify-between gap-2 p-3">
        <div>
          <p className="text-[9px] uppercase tracking-wide text-[var(--color-faint)]">{typeLabel}</p>
          <p className="mt-0.5 line-clamp-2 text-xs font-semibold text-[var(--color-text)]">{item.name ?? typeLabel}</p>
        </div>
        <div className="flex items-end justify-between gap-2">
          <span className="text-sm font-semibold text-[var(--color-text)]">{priceRub > 0 ? `${formatRub(priceRub)} ₽` : "—"}</span>
          {item.partnerUrl && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[var(--color-primary)]">
              В магазин
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (item.partnerUrl) {
    return (
      <a href={item.partnerUrl} target="_blank" rel="noopener noreferrer nofollow" className="group block h-full" aria-label={`${typeLabel}: ${item.name ?? "перейти в магазин"}`}>
        {cardBody}
      </a>
    );
  }
  return cardBody;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LEGACY_VIEW_LABELS: Record<string, string> = {
  view_1_entrance: "Общий вид",
  view_2_main: "Акцентная стена",
  view_3_storage: "Зона хранения",
  view_4_window: "У окна",
  view_1: "Общий вид",
  view_2: "Акцентная стена",
  view_3: "Зона хранения",
  view_4: "У окна",
};

const STYLE_BRIEF: Record<string, string> = {
  modern: "Современный стиль про чистые линии, нейтральную палитру и приоритет функции. Здесь нет лишнего декора — каждая поверхность работает.",
  scandinavian: "Скандинавский стиль вырос из северного холода: побольше света, светлый дуб, шерсть и хлопок. В нём всегда тепло, даже когда за окном минус двадцать.",
  loft: "Лофт берёт корни из переоборудованных промышленных пространств. Кирпич, бетон, металл — материалы, которые не пытаются казаться чем-то другим.",
  minimalism: "Минимализм — отказ от всего, что не несёт смысла. Цветов мало, линий мало, акценты — только там, где это работает.",
  neoclassic: "Неоклассика смягчает строгую классику и добавляет современный комфорт. Лепнина, симметрия, бархат — но в дозированном, не парадном масштабе.",
  japandi: "Японди — встреча японского минимализма и скандинавской теплоты. Тихая палитра, природные материалы, ничего лишнего, но уютно.",
  classic: "Классика — это про устойчивые пропорции, симметрию и натуральные материалы. Спокойствие и узнаваемость, которая не выйдет из моды через сезон.",
};

function formatRub(rub: number): string {
  return Math.round(rub).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}

function pluralWeeks(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "недель";
  if (mod10 === 1) return "неделя";
  if (mod10 >= 2 && mod10 <= 4) return "недели";
  return "недель";
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const target = name + "=";
  const parts = document.cookie.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(target)) {
      return decodeURIComponent(trimmed.substring(target.length));
    }
  }
  return null;
}

function pipelineStepLabel(step: string | null): string {
  if (!step) return "Собираем проект…";
  return PIPELINE_STEP_LABELS[step] ?? "Собираем проект…";
}
