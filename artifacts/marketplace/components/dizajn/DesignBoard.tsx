"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DesignFullDTO, DesignFeedItemDTO, DesignStatus } from "../../lib/types";
import { SaveButton } from "./SaveButton";
import { DesignLeadForm } from "./DesignLeadForm";
import { ShareButton } from "./ShareButton";

/**
 * Подобранная под Layout_JSON позиция мебели — одна строка
 * `designs.picked_furniture[]`. Чистый DTO, повторяющий
 * `PickedFurnitureRow` из `lib/db/src/types/furniture.ts`
 * (Requirement 10.6, 10.7); marketplace-пакет не зависит от
 * `@workspace/db`, поэтому тип дублируется здесь для UI-слоя.
 */
export interface DesignPickedFurnitureDTO {
  layoutId: string;
  type: string;
  /** SKU из `furniture_products`; `null` — позиция «уточняется». */
  sku: string | null;
  name: string | null;
  /** Фактическая цена в копейках; `0`, если sku=null. */
  pricePaidKopeks: number;
  partnerUrl: string | null;
  imageUrl: string | null;
}

/**
 * AI-design page v2 (магазин-ная разворотка под seed-проекты).
 *
 * Layout (сверху вниз):
 *   1. Header — H1 (+ owner-badge) + breadcrumbs + параметры-chip + 2 CTAs (+ PDF)
 *   2. Прогресс генерации — шкала + текущий шаг (только при status=generating)
 *   3. Hero  — 4 ракурса (1 большой + 3 thumbnails)
 *   4. До / После — `inputImageUrl` рядом с views[0] (helper-toggle)
 *   5. План + параметры + палитра — three-column grid (top-down + 3D + params + palette)
 *   6. Детали проекта — 6 кропов через sharp
 *   7. Материалы + Смета — таблицы side-by-side
 *   8. Подобранная мебель — карточки SKU с partner-ссылками
 *   9. Решения — bullets с нумерацией
 *  10. Описание — narrative text
 *  11. Похожие проекты — 3×3 (room+style / style / budget)
 *  12. О стиле / о районе — extra SEO text sections
 *  13. CTA «Узнать стоимость» — secondary, scroll to lead-form
 *  14. Lead form — primary CTA «Хочу такой же»
 *  15. UGC place — «Сделали так же? Покажите свой результат»
 *
 * SEO: JSON-LD (Article + BreadcrumbList + ImageObject) выводится из
 * page.tsx (вне компонента — там есть доступ к metadata-helper).
 *
 * Client-only behaviour (Requirements 4.4, 5.4, 5.5, 5.6, 13.1, 13.6):
 *   • polling `GET /:slug/status` каждые 3 секунды, пока status=generating;
 *   • остановка polling при переходе в completed/failed;
 *   • кнопка «Скачать PDF» при completed; при 503 (`pdf_temporarily_unavailable`)
 *     прячется и заменяется пометкой;
 *   • бейдж «ваш проект» при совпадении `designAnonId` с cookie `kiro_anon_id`.
 */

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
  /** Та же комната + стиль (другие проекты этой комбинации). */
  sameRoomStyle: DesignFeedItemDTO[];
  /** Тот же стиль (любая комната). */
  sameStyle: DesignFeedItemDTO[];
  /** Близкий бюджет (любая комната, любой стиль). */
  similarBudget: DesignFeedItemDTO[];
}

interface Props {
  design: DesignFullDTO;
  similar?: SimilarBuckets;
  /**
   * Base public URL (e.g. `https://chestnye-mastera.ru`) passed from the
   * server component. Avoids importing `lib/env` (server-only) in this
   * client component.
   */
  baseUrl: string;
  /**
   * Программно отрисованный 2D-план комнаты (Requirement 8). `null`, если
   * шаблонная отрисовка не выполнена для типа помещения; в этом случае
   * блок «Вид сверху» показывает placeholder вместо изображения
   * (Requirement 8.7).
   */
  topDownPlanUrl?: string | null;
  /**
   * Подобранные SKU мебели в порядке `Layout_JSON.furniture[]`
   * (Requirement 10.6). `null` — секция скрыта целиком; пустой массив
   * трактуется как «ничего не подобрано» и тоже скрывается.
   */
  pickedFurniture?: DesignPickedFurnitureDTO[] | null;
  /**
   * Имя текущего шага пайплайна (Requirement 5.2, 5.4) для подписи под
   * прогресс-шкалой. Если не передано — берётся initial-значение
   * `null`, на UI рисуется только числовой процент.
   */
  currentStep?: string | null;
  /**
   * `Anon_Id` владельца записи (`designs.anon_id`). Используется
   * только для бейджа «ваш проект» (Requirement 4.4): сравнивается на
   * клиенте с cookie `kiro_anon_id`. Не отображается пользователю.
   */
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
  topDownPlanUrl = null,
  pickedFurniture = null,
  currentStep: initialCurrentStep = null,
  designAnonId = null,
}: Props) {
  // ── Live status / polling state (Requirements 5.3, 5.4, 5.5, 5.6) ─────────
  // Polling запускается только когда status='generating'. На completed/failed
  // setInterval останавливается через cleanup в useEffect.
  const [status, setStatus] = useState<DesignStatus>(design.status);
  const [progress, setProgress] = useState<number>(design.progress);
  const [currentStep, setCurrentStep] = useState<string | null>(initialCurrentStep);
  const [errorMessage, setErrorMessage] = useState<string | null>(design.errorMessage);

  // ── PDF download state (Requirement 13.1, 13.6) ──────────────────────────
  // `pdfError=true` — последняя попытка получить PDF вернула 503
  // `pdf_temporarily_unavailable`; кнопка скрывается, на её месте — пометка.
  // `pdfBusy` — в процессе скачивания (Requirement 13.1: «скрыта во время
  // повторного рендера»).
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState(false);

  // ── Owner badge state (Requirement 4.4) ──────────────────────────────────
  // Cookie читается на клиенте после mount. На сервере значение всегда false,
  // чтобы не было SSR/CSR mismatch.
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
        // Сетевые/JSON ошибки игнорируем — следующий тик повторит запрос.
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
      if (res.status === 503) {
        setPdfError(true);
        return;
      }
      if (!res.ok) {
        setPdfError(true);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `design-${design.slug}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Освобождаем blob через event-loop, чтобы браузер успел инициировать
      // скачивание до revoke.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setPdfError(true);
    } finally {
      setPdfBusy(false);
    }
  };

  // Кнопка «Скачать PDF» показывается только при completed AND нет недавней
  // 503-ошибки рендера AND не идёт активная загрузка PDF (последнее = «во
  // время повторного рендера», Requirement 13.1).
  const showPdfButton = status === "completed" && !pdfError && !pdfBusy;

  // Используем новые `views`; fallback на legacy `images.type=view_*`.
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

  const heroView = views[0];
  // 5-й view (если есть) — 3D-isometric план. Показываем отдельно
  // в plan-секции рядом с SVG-планом, чтобы не дублировать в hero-сетке.
  const isometricView = views.find((v) => v.position === 5) ?? null;
  // Thumbs в hero — 3 ракурса (кровать-акцент, шкаф, окно), без isometric.
  const otherViews = views.slice(1).filter((v) => v.position !== 5);
  const beforeUrl = design.inputImageUrl ?? design.images.find((img) => img.type === "input")?.url ?? null;
  const detailCrops = design.detailCrops ?? [];

  // Нормализуем picked_furniture: пустой массив трактуется так же, как `null`,
  // т.е. секция скрывается целиком (Requirement 14.4 — пустые секции
  // не отображаются).
  const pickedFurnitureItems = pickedFurniture && pickedFurniture.length > 0 ? pickedFurniture : null;

  const styleLabel = STYLE_LABELS[design.style] ?? design.style;
  const roomGen = ROOM_LABELS_GENITIVE[design.roomType] ?? design.roomType;
  const roomNom = ROOM_LABELS_NOMINATIVE[design.roomType] ?? design.roomType;
  const cityIn = design.cityNameIn ?? (design.cityName ? `в ${design.cityName}` : null);
  const designUrl = `${baseUrl.replace(/\/+$/, "")}/dizajn/${design.slug}`;
  const shareTitle = design.h1 ?? `Дизайн ${roomGen} в стиле ${styleLabel}`;

  const totalEstimateRub = design.estimate
    ? Math.round(design.estimate.reduce((s, e) => s + e.amountKopeks, 0) / 100)
    : null;

  return (
    <article className="bg-[var(--color-background)]">
      {/* ── 1. Header ───────────────────────────────────── */}
      <header className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
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

          <p className="font-eyebrow mt-7">AI-концепт интерьера</p>
          <div className="mt-3 flex flex-wrap items-start gap-3">
            <h1 className="font-display max-w-4xl text-3xl text-[var(--color-text)] sm:text-4xl lg:text-[2.75rem]">
              {design.h1 ?? `Дизайн ${roomGen} в стиле ${styleLabel}`}
            </h1>
            {/* Owner-badge (Requirement 4.4): показывается только когда
                cookie `kiro_anon_id` совпала с `designAnonId` владельца. */}
            {isOwner ? (
              <span
                className="mt-1 inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-[var(--color-primary-ring)] bg-[var(--color-primary-soft)] px-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-primary-strong)]"
                aria-label="Это ваш проект"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                ваш проект
              </span>
            ) : null}
          </div>

          {/* Quick-params chip row */}
          <ul className="mt-5 flex flex-wrap gap-2 text-sm">
            {design.area ? <Chip>{design.area} м²</Chip> : null}
            <Chip>{styleLabel}</Chip>
            {design.budget ? <Chip>до {formatRub(design.budget)} ₽</Chip> : null}
            {design.cityName ? (
              <Chip>{design.cityName}{design.district ? `, ${design.district}` : ""}</Chip>
            ) : null}
            {design.durationWeeks ? (
              <Chip>{design.durationWeeks} {pluralWeeks(design.durationWeeks)}</Chip>
            ) : null}
          </ul>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a
              href="#design-lead"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--color-primary)] px-7 text-base font-semibold text-white shadow-cozy-md transition hover:bg-[var(--color-primary-hover)]"
            >
              Хочу такой же
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </a>
            <SaveButton
              slug={design.slug}
              initialSaved={design.isSavedByCurrentUser}
              initialCount={design.saveCount}
              variant="pill"
            />
            <ShareButton
              shareUrl={designUrl}
              shareTitle={shareTitle}
              shareText={`Создал AI-дизайн-проект: ${shareTitle}. Посмотри.`}
            />
            {/* PDF-download (Requirement 13.1, 13.6): показывается только при
                completed AND нет недавней 503-ошибки рендера AND не идёт
                активная загрузка. На 503 от `/:slug/pdf` button скрывается
                и заменяется пометкой «PDF временно недоступен». */}
            {showPdfButton ? (
              <button
                type="button"
                onClick={handlePdfDownload}
                disabled={pdfBusy}
                className="inline-flex h-12 items-center gap-2 rounded-full border border-[var(--color-text)] px-6 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-text)] hover:text-white disabled:opacity-60"
                aria-label="Скачать дизайн-проект в PDF"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 3v12" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M5 21h14" />
                </svg>
                Скачать PDF
              </button>
            ) : null}
            {pdfError ? (
              <span
                role="status"
                className="inline-flex h-12 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-cream-deep)] px-5 text-sm text-[var(--color-muted)]"
              >
                PDF временно недоступен, вся информация есть на странице
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {/* ── 1b. Прогресс генерации (Requirements 5.4–5.6) ─────────────────── */}
      {/* Шкала + подпись текущего шага рисуются только когда status='generating'.
          Polling каждые 3 секунды (см. useEffect выше) обновляет progress/step,
          по переходу в completed/failed setInterval останавливается. */}
      {status === "generating" ? (
        <section
          className="bg-[var(--color-cream-deep)]"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
            <p className="font-eyebrow">Готовим дизайн</p>
            <h2 className="font-display mt-2 text-xl text-[var(--color-text)] sm:text-2xl">
              {pipelineStepLabel(currentStep)}
            </h2>
            <div className="mt-5 flex items-center justify-between text-xs text-[var(--color-muted)]">
              <span>Прогресс</span>
              <span className="font-semibold text-[var(--color-text)]">
                {Math.min(100, Math.max(0, Math.round(progress)))}%
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
              <div
                className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-1000"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-[var(--color-faint)]">
              Страница обновится автоматически, как только проект будет готов.
            </p>
          </div>
        </section>
      ) : null}

      {/* ── 1c. Failed-banner (Requirement 5.6) ───────────────────────────── */}
      {status === "failed" ? (
        <section className="bg-[var(--color-cream-deep)]" role="alert">
          <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
            <p className="font-eyebrow">Ошибка генерации</p>
            <h2 className="font-display mt-2 text-xl text-[var(--color-text)] sm:text-2xl">
              {errorMessage ?? "Не удалось завершить генерацию проекта."}
            </h2>
            <p className="mt-3 text-sm text-[var(--color-muted)]">
              Попробуйте создать новый проект — обычно повторная попытка проходит без проблем.
            </p>
          </div>
        </section>
      ) : null}

      {/* ── 2. Hero (1 large + 3 thumbnails; isometric idёт в план-секцию) ── */}
      {heroView ? (
        <section className="bg-[var(--color-background)]">
          <div className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 sm:pb-16">
            <div className="grid gap-3 sm:gap-4 lg:grid-cols-[2fr_1fr]">
              <figure className="relative overflow-hidden rounded-2xl bg-[var(--color-cream-deep)] shadow-cozy">
                <div className="relative aspect-[4/3] w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={heroView.url}
                    alt={`${heroView.label} — ${shareTitle}`}
                    loading="eager"
                    className="block h-full w-full object-cover"
                  />
                </div>
                <figcaption className="absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                  1. {heroView.label}
                </figcaption>
              </figure>

              <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-1 lg:grid-rows-3">
                {otherViews.map((v, idx) => (
                  <figure key={v.url} className="group relative overflow-hidden rounded-2xl bg-[var(--color-cream-deep)] shadow-cozy">
                    <div className="relative aspect-[4/3] w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={v.url}
                        alt={`${v.label} — ${shareTitle}`}
                        loading="lazy"
                        className="block h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                      />
                    </div>
                    <figcaption className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      {idx + 2}. {v.label}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── 3. До / После (если есть «до») ───────────────── */}
      {beforeUrl && heroView ? (
        <section className="bg-[var(--color-cream-deep)]">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-14">
            <div className="max-w-2xl">
              <p className="font-eyebrow">До и после</p>
              <h2 className="font-display mt-2 text-2xl text-[var(--color-text)] sm:text-3xl">
                Как менялась комната.
              </h2>
              <p className="mt-3 text-sm text-[var(--color-muted)]">
                Слева — типовая {roomNom} в панельном доме. Справа — концепт после ремонта в стиле {styleLabel.toLowerCase()}.
                Все изображения сгенерированы AI и нужны для вдохновения.
              </p>
            </div>
            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              <BeforeAfterPair label="Было" labelTone="muted" url={beforeUrl} alt={`Типовая ${roomNom} до ремонта`} />
              <BeforeAfterPair label="Стало" labelTone="brand" url={heroView.url} alt={`${capitalize(roomNom)} после преображения, ${styleLabel.toLowerCase()}`} />
            </div>
          </div>
        </section>
      ) : null}

      {/* ── 4a. Вид сверху (программный 2D-план из Layout_JSON) ─────────────
           Requirement 8.7: блок отображает `topDownPlanUrl` напрямую и
           заменяет любой существующий placeholder из infographicComposer.
           IF поле `null` (тип помещения без шаблонной отрисовки или ошибка
           генерации) — показываем placeholder, секция остаётся видимой
           (но без визуала). */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 sm:pt-16">
          <div className="max-w-2xl">
            <p className="font-eyebrow">Вид сверху</p>
            <h2 className="font-display mt-2 text-2xl text-[var(--color-text)] sm:text-3xl">
              План помещения.
            </h2>
            <p className="mt-3 text-sm text-[var(--color-muted)]">
              Точные размеры стен, дверей, окон и габариты мебели — отрисовка
              без AI, прямо из планировочного JSON.
            </p>
          </div>
          <figure className="mt-7 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-cozy">
            <div className="relative aspect-[16/10] w-full bg-[var(--color-cream-deep)]">
              {topDownPlanUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={topDownPlanUrl}
                  alt={`Вид сверху — план ${roomGen}`}
                  loading="lazy"
                  className="block h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-[var(--color-faint)]">
                  План вида сверху для этого типа помещения скоро появится — пока показаны фотореалистичные ракурсы и аксонометрия.
                </div>
              )}
            </div>
          </figure>
        </div>
      </section>

      {/* ── 4. План + параметры + палитра ────────────────── */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid gap-8 lg:grid-cols-[1fr_1fr_1fr] lg:gap-10">
            {/* 3D-isometric ракурс (если есть) — отделён от «Вид сверху»,
                который теперь рендерит программный 2D-план (см. секцию 4a). */}
            {isometricView ? (
              <div>
                <p className="font-eyebrow">Аксонометрия</p>
                <h2 className="font-display mt-2 text-xl text-[var(--color-text)] sm:text-2xl">
                  Объёмная схема.
                </h2>
                <figure className="mt-5 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-cozy">
                  <div className="relative aspect-[4/3] w-full bg-[var(--color-cream-deep)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={isometricView.url}
                      alt={`${isometricView.label} — ${shareTitle}`}
                      loading="lazy"
                      className="block h-full w-full object-cover"
                    />
                  </div>
                  <figcaption className="px-4 py-3 text-sm text-[var(--color-text)]">
                    5. {isometricView.label}
                  </figcaption>
                </figure>
              </div>
            ) : (
              <div className="hidden lg:block" aria-hidden />
            )}

            {/* Параметры проекта */}
            <div>
              <p className="font-eyebrow">Параметры проекта</p>
              <h2 className="font-display mt-2 text-xl text-[var(--color-text)] sm:text-2xl">
                Что входит.
              </h2>
              <dl className="mt-5 space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-cozy text-sm">
                <ParamRow label="Помещение" value={capitalize(roomNom)} />
                <ParamRow label="Площадь" value={design.area ? `${design.area} м²` : "—"} />
                <ParamRow label="Стиль" value={styleLabel} />
                {design.budget ? (
                  <ParamRow label="Бюджет" value={`до ${formatRub(design.budget)} ₽`} />
                ) : null}
                {design.durationWeeks ? (
                  <ParamRow label="Срок реализации" value={`${design.durationWeeks} ${pluralWeeks(design.durationWeeks)}`} />
                ) : null}
                {design.cityName ? <ParamRow label="Город" value={design.cityName} /> : null}
                {design.district ? <ParamRow label="Район" value={design.district} /> : null}
              </dl>
            </div>

            {/* Цветовая палитра */}
            <div>
              <p className="font-eyebrow">Цветовая палитра</p>
              <h2 className="font-display mt-2 text-xl text-[var(--color-text)] sm:text-2xl">
                Тона проекта.
              </h2>
              {design.colorPalette && design.colorPalette.length > 0 ? (
                <div className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-cozy">
                  <ul className="grid grid-cols-5 gap-2">
                    {design.colorPalette.slice(0, 5).map((swatch, idx) => (
                      <li key={idx}>
                        <div
                          className="aspect-square w-full rounded-lg border border-[var(--color-border)]"
                          style={{ backgroundColor: swatch.hex }}
                          title={swatch.hex}
                        />
                        <p className="mt-2 text-center text-[10px] uppercase tracking-wide text-[var(--color-faint)]">
                          {swatch.hex}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-5 text-sm text-[var(--color-faint)]">Палитра подбирается из главного ракурса.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. Детали проекта (6 кропов) ─────────────────── */}
      {detailCrops.length > 0 ? (
        <section className="bg-[var(--color-cream-deep)]">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="max-w-2xl">
              <p className="font-eyebrow">Детали проекта</p>
              <h2 className="font-display mt-2 text-2xl text-[var(--color-text)] sm:text-3xl">
                На что обратить внимание.
              </h2>
              <p className="mt-3 text-sm text-[var(--color-muted)]">
                Крупные планы из ракурсов выше — мебель, освещение, фактуры стен.
              </p>
            </div>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {detailCrops.map((crop, idx) => (
                <li key={crop.url} className="group">
                  <figure className="overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-cozy">
                    <div className="relative aspect-square w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={crop.url}
                        alt={`${crop.label} — ${shareTitle}`}
                        loading={idx < 3 ? "eager" : "lazy"}
                        className="block h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                      />
                    </div>
                    <figcaption className="px-4 py-3 text-sm text-[var(--color-text)]">{crop.label}</figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ── 6. Материалы + Смета ────────────────────────── */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
            {/* Materials */}
            {design.materials && design.materials.length > 0 ? (
              <div>
                <p className="font-eyebrow">Рекомендуемые материалы</p>
                <h2 className="font-display mt-2 text-2xl text-[var(--color-text)] sm:text-3xl">
                  Материалы.
                </h2>
                <table className="mt-5 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-cozy text-sm overflow-hidden">
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {design.materials.map((m, idx) => (
                      <tr key={idx}>
                        <th className="w-1/3 px-5 py-3 text-left font-semibold text-[var(--color-text)] align-top">
                          {m.category}
                        </th>
                        <td className="px-5 py-3 text-[var(--color-muted)] align-top">{m.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {/* Estimate */}
            {design.estimate && design.estimate.length > 0 ? (
              <div>
                <p className="font-eyebrow">Смета реализации</p>
                <h2 className="font-display mt-2 text-2xl text-[var(--color-text)] sm:text-3xl">
                  Смета{design.budget ? ` (до ${formatRub(design.budget)} ₽)` : ""}.
                </h2>
                <table className="mt-5 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-cozy text-sm overflow-hidden">
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {design.estimate.map((e, idx) => (
                      <tr key={idx}>
                        <th className="px-5 py-3 text-left font-semibold text-[var(--color-text)] align-top">
                          {e.category}
                        </th>
                        <td className="w-32 whitespace-nowrap px-5 py-3 text-right font-semibold text-[var(--color-text)] align-top">
                          {formatRub(Math.round(e.amountKopeks / 100))} ₽
                        </td>
                      </tr>
                    ))}
                    {totalEstimateRub != null ? (
                      <tr className="bg-[var(--color-cream-deep)]">
                        <th className="px-5 py-3 text-left font-bold text-[var(--color-text)]">Итого ориентировочно</th>
                        <td className="w-32 whitespace-nowrap px-5 py-3 text-right font-bold text-[var(--color-text)]">
                          {formatRub(totalEstimateRub)} ₽
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── 6b. Подобранная мебель (Requirement 10.7) ─────────────────────
           Карточки SKU из `pickedFurniture[]`. Для позиций `sku=null`
           (не нашлось подходящего варианта в каталоге, Requirement 10.5)
           показываем заглушку «уточняется» вместо ссылки.
           Секция полностью скрыта при `null`/пустом массиве (Requirement 14.4). */}
      {pickedFurnitureItems ? (
        <section className="bg-[var(--color-background)]">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="max-w-2xl">
              <p className="font-eyebrow">Подобранная мебель</p>
              <h2 className="font-display mt-2 text-2xl text-[var(--color-text)] sm:text-3xl">
                Что купить под проект.
              </h2>
              <p className="mt-3 text-sm text-[var(--color-muted)]">
                SKU из каталога партнёра, подходящие по габаритам и стилю.
                Цены — на момент генерации проекта, могут отличаться в магазине.
              </p>
            </div>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {pickedFurnitureItems.map((item, idx) => (
                <li key={`${item.layoutId}-${idx}`}>
                  <PickedFurnitureCard item={item} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ── 7. Решения ──────────────────────────────────── */}
      {design.solutions && design.solutions.length > 0 ? (
        <section className="bg-[var(--color-cream-deep)]">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="max-w-3xl">
              <p className="font-eyebrow">Основные решения</p>
              <h2 className="font-display mt-2 text-2xl text-[var(--color-text)] sm:text-3xl">
                Что главное в проекте.
              </h2>
            </div>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 sm:gap-4">
              {design.solutions.map((s, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-cozy"
                >
                  <span className="mt-0.5 text-[var(--color-primary)] font-display text-base">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className="text-base text-[var(--color-text)]">{s.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ── 8. Описание ─────────────────────────────────── */}
      {design.description ? (
        <section className="bg-[var(--color-background)]">
          <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
            <p className="font-eyebrow">О проекте</p>
            <h2 className="font-display mt-2 text-2xl text-[var(--color-text)] sm:text-3xl">
              Идея и подача.
            </h2>
            <div className="mt-5 space-y-4 text-base leading-relaxed text-[var(--color-muted)] whitespace-pre-line sm:text-lg sm:leading-[1.7]">
              {design.description}
            </div>
          </div>
        </section>
      ) : null}

      {/* ── 9. Похожие проекты (3×3) ──────────────────── */}
      {similar ? (
        <section className="bg-[var(--color-cream-deep)]">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="max-w-3xl">
              <p className="font-eyebrow">Если понравилось</p>
              <h2 className="font-display mt-2 text-2xl text-[var(--color-text)] sm:text-3xl">
                Похожие проекты.
              </h2>
            </div>
            <div className="mt-8 space-y-10">
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
                  seeAllHref={`/dizajn`}
                  designs={similar.similarBudget}
                />
              ) : (
                <SimilarRow
                  title="Свежие AI-дизайны"
                  seeAllHref="/dizajn"
                  designs={similar.similarBudget}
                />
              )}
            </div>
          </div>
        </section>
      ) : null}

      {/* ── 10. Доп SEO-секция: о стиле ───────────────── */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="font-eyebrow">О стиле</p>
          <h2 className="font-display mt-2 text-2xl text-[var(--color-text)] sm:text-3xl">
            {styleLabel} — кратко о направлении.
          </h2>
          <div className="mt-5 space-y-3 text-base leading-relaxed text-[var(--color-muted)] sm:text-lg sm:leading-[1.7]">
            {STYLE_BRIEF[design.style] ?? `Стиль ${styleLabel.toLowerCase()} — самостоятельное направление в дизайне интерьеров. На странице показано как его базовые приёмы применяются к ${roomGen}.`}
          </div>
        </div>
      </section>

      {design.cityName ? (
        <section className="bg-[var(--color-cream-deep)]">
          <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
            <p className="font-eyebrow">О городе</p>
            <h2 className="font-display mt-2 text-2xl text-[var(--color-text)] sm:text-3xl">
              Реализация {cityIn ?? `в городе ${design.cityName}`}.
            </h2>
            <div className="mt-5 text-base leading-relaxed text-[var(--color-muted)] sm:text-lg sm:leading-[1.7]">
              В каталоге проверенных мастеров {cityIn ?? design.cityName} есть специалисты, которые работают
              со стилем {styleLabel.toLowerCase()} и могут повторить этот концепт{design.district ? ` в районе ${design.district}` : ""}.
              Бюджет и состав работ согласовываются после замера и уточнения списка материалов.
            </div>
          </div>
        </section>
      ) : null}

      {/* ── 11. Secondary CTA: «Узнать стоимость» ─────── */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-14">
          <div className="flex flex-col items-start gap-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-7 shadow-cozy sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-9">
            <div className="max-w-2xl">
              <p className="font-eyebrow">Реализация проекта</p>
              <h3 className="font-display mt-2 text-xl text-[var(--color-text)] sm:text-2xl">
                Узнайте стоимость точно под вашу комнату.
              </h3>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                Смета на странице — ориентир по средним ценам {cityIn ?? ""}.
                Под конкретный объект мастер пересчитает после замера.
              </p>
            </div>
            <a
              href="#design-lead"
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full border border-[var(--color-text)] px-7 text-base font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-text)] hover:text-white"
            >
              Узнать стоимость
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* ── 12. Lead form (primary CTA «Хочу такой же») ── */}
      <section id="design-lead" className="scroll-mt-20 bg-[var(--color-text)]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
            {/* Pitch */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary-ring)]">
                Хочу такой же
              </p>
              <h2 className="font-display mt-4 max-w-3xl text-3xl text-white sm:text-4xl lg:text-5xl">
                Подберём мастера, который сделает похоже.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
                Оставьте контакт — мы найдём проверенного мастера{cityIn ? ` ${cityIn}` : ""},
                который работает в стиле {styleLabel.toLowerCase()} и сможет повторить
                этот проект.
              </p>
              <ul className="mt-7 space-y-2 text-sm text-white/85">
                <li className="flex items-center gap-2"><Tick /> Без авансов и блокировок счёта</li>
                <li className="flex items-center gap-2"><Tick /> Договор на каждом заказе</li>
                <li className="flex items-center gap-2"><Tick /> Оплата после выполнения</li>
                {design.budget ? (
                  <li className="flex items-center gap-2"><Tick /> Учтём ваш бюджет до {formatRub(design.budget)} ₽</li>
                ) : null}
              </ul>
            </div>

            {/* Form */}
            <div>
              <div className="rounded-2xl border border-white/15 bg-[var(--color-surface)] p-6 shadow-cozy-md sm:p-8">
                <DesignLeadForm slug={design.slug} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 13. UGC place (placeholder) ─────────────────── */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-3xl px-4 py-12 text-center sm:px-6 sm:py-16">
          <p className="font-eyebrow">Реальные результаты</p>
          <h2 className="font-display mt-2 text-2xl text-[var(--color-text)] sm:text-3xl">
            Сделали так же? Покажите свой результат.
          </h2>
          <p className="mt-4 text-sm text-[var(--color-muted)]">
            Скоро мы добавим возможность присылать фото готовых ремонтов и публиковать их рядом с AI-концептом.
            Подпишитесь на рассылку, чтобы первым узнать.
          </p>
        </div>
      </section>
    </article>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <li className="inline-flex h-8 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[13px] text-[var(--color-text)] shadow-cozy/40">
      {children}
    </li>
  );
}

function ParamRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--color-muted)]">{label}</dt>
      <dd className="font-semibold text-[var(--color-text)] text-right">{value}</dd>
    </div>
  );
}

function BeforeAfterPair({
  label,
  labelTone,
  url,
  alt,
}: {
  label: string;
  labelTone: "muted" | "brand";
  url: string;
  alt: string;
}) {
  const labelClass = labelTone === "brand"
    ? "bg-[var(--color-primary)] text-white"
    : "bg-[var(--color-text)] text-white";
  return (
    <figure className="relative overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-cozy">
      <div className="relative aspect-[4/3] w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} loading="lazy" className="block h-full w-full object-cover" />
      </div>
      <figcaption className={`absolute top-3 left-3 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${labelClass}`}>
        {label}
      </figcaption>
    </figure>
  );
}

function SimilarRow({
  title,
  seeAllHref,
  designs,
}: {
  title: string;
  seeAllHref: string;
  designs: DesignFeedItemDTO[];
}) {
  if (!designs || designs.length === 0) return null;
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <h3 className="font-display text-lg text-[var(--color-text)] sm:text-xl">{title}</h3>
        <Link href={seeAllHref} className="shrink-0 text-sm font-semibold text-[var(--color-primary)] hover:underline">
          Смотреть все →
        </Link>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-3 sm:gap-4">
        {designs.slice(0, 3).map((d) => (
          <li key={d.id}>
            <Link href={`/dizajn/${d.slug}`} className="group block">
              <figure className="overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-cozy">
                <div className="relative aspect-[4/3] w-full bg-[var(--color-cream-deep)]">
                  {d.resultImageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={d.resultImageUrl}
                      alt={d.h1 ?? "AI-дизайн"}
                      loading="lazy"
                      className="block h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                    />
                  ) : null}
                </div>
                <figcaption className="px-4 py-3 text-sm text-[var(--color-text)] line-clamp-2">
                  {d.h1 ?? `Дизайн ${d.roomType} в стиле ${d.style}`}
                </figcaption>
              </figure>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tick() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-[var(--color-primary-ring)]"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
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
  modern:
    "Современный стиль про чистые линии, нейтральную палитру и приоритет функции. Здесь нет лишнего декора — каждая поверхность работает.",
  scandinavian:
    "Скандинавский стиль вырос из северного холода: побольше света, светлый дуб, шерсть и хлопок. В нём всегда тепло, даже когда за окном минус двадцать.",
  loft:
    "Лофт берёт корни из переоборудованных промышленных пространств. Кирпич, бетон, металл — материалы, которые не пытаются казаться чем-то другим.",
  minimalism:
    "Минимализм — отказ от всего, что не несёт смысла. Цветов мало, линий мало, акценты — только там, где это работает.",
  neoclassic:
    "Неоклассика смягчает строгую классику и добавляет современный комфорт. Лепнина, симметрия, бархат — но в дозированном, не парадном масштабе.",
  japandi:
    "Японди — встреча японского минимализма и скандинавской теплоты. Тихая палитра, природные материалы, ничего лишнего, но уютно.",
  classic:
    "Классика — это про устойчивые пропорции, симметрию и натуральные материалы. Спокойствие и узнаваемость, которая не выйдет из моды через сезон.",
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

/**
 * Безопасно читает значение cookie по имени. Возвращает `null`, если
 * cookie не найдена или код выполняется на сервере (нет `document`).
 */
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

/**
 * Подпись текущего шага пайплайна. Если шаг неизвестен или `null`,
 * возвращаем нейтральное «Собираем проект…», чтобы UI всегда имел
 * человеко-читаемую строку.
 */
function pipelineStepLabel(step: string | null): string {
  if (!step) return "Собираем проект…";
  return PIPELINE_STEP_LABELS[step] ?? "Собираем проект…";
}

/**
 * Локализованный человеко-читаемый ярлык для типа предмета мебели.
 * Используется как подпись для заглушки «уточняется» (Requirement 10.7).
 */
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

/**
 * Карточка одной позиции `picked_furniture[]`. Для `sku=null` рисует
 * заглушку «уточняется» с подписью типа мебели, без ссылки на партнёра
 * (Requirement 10.7).
 */
function PickedFurnitureCard({ item }: { item: DesignPickedFurnitureDTO }) {
  const typeLabel = furnitureTypeLabel(item.type);

  if (item.sku === null) {
    return (
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center shadow-cozy/40">
        <div className="flex flex-1 items-center justify-center rounded-xl bg-[var(--color-cream-deep)] py-8 text-xs uppercase tracking-wide text-[var(--color-faint)]">
          Изображение отсутствует
        </div>
        <p className="mt-4 text-sm font-semibold text-[var(--color-text)]">
          {typeLabel}
        </p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">уточняется</p>
      </div>
    );
  }

  const priceRub = Math.round(item.pricePaidKopeks / 100);
  const cardBody = (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-cozy">
      <div className="relative aspect-[4/3] w-full bg-[var(--color-cream-deep)]">
        {item.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={item.imageUrl}
            alt={item.name ?? typeLabel}
            loading="lazy"
            className="block h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
        ) : null}
      </div>
      <div className="flex flex-1 flex-col justify-between gap-2 p-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-faint)]">
            {typeLabel}
          </p>
          <p className="mt-1 line-clamp-2 text-sm font-semibold text-[var(--color-text)]">
            {item.name ?? typeLabel}
          </p>
        </div>
        <div className="flex items-end justify-between gap-2">
          <span className="text-base font-semibold text-[var(--color-text)]">
            {priceRub > 0 ? `${formatRub(priceRub)} ₽` : "—"}
          </span>
          {item.partnerUrl ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)]">
              В магазин
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (item.partnerUrl) {
    return (
      <a
        href={item.partnerUrl}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="group block h-full"
        aria-label={`${typeLabel}: ${item.name ?? "перейти в магазин"}`}
      >
        {cardBody}
      </a>
    );
  }

  return cardBody;
}
