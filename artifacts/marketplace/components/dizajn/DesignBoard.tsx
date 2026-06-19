import Link from "next/link";
import type { DesignFullDTO } from "../../lib/types";
import { FloorPlanSVG } from "./FloorPlanSVG";
import { SaveButton } from "./SaveButton";
import { DesignLeadForm } from "./DesignLeadForm";

/**
 * Magazine-board layout для готового AI-дизайн-проекта (status='completed').
 * Воспроизводит структуру референса от ChatGPT, но в виде HTML-сборки —
 * текст индексируется поисковиками, цены/материалы/палитра живут как
 * structured data.
 *
 * Layout:
 *   1. Header (H1 + параметры)
 *   2. Hero — 4 рендера (entrance / main / storage / window) в grid'е
 *   3. Two-col: SVG floor plan | Параметры + Цветовая палитра
 *   4. Two-col: Материалы | Смета
 *   5. Основные решения (bullets)
 *   6. Master matching CTA
 */

const ROOM_LABELS_GENITIVE: Record<string, string> = {
  bathroom: "ванной",
  kitchen: "кухни",
  living_room: "гостиной",
  bedroom: "спальни",
  hallway: "прихожей",
  apartment: "квартиры",
};

const STYLE_LABELS: Record<string, string> = {
  modern: "Современный",
  scandinavian: "Скандинавский",
  loft: "Лофт",
  minimalism: "Минимализм",
  neoclassic: "Неоклассика",
  japandi: "Японди",
};

interface Props {
  design: DesignFullDTO;
}

export function DesignBoard({ design }: Props) {
  const renderImages = design.images.filter((img) => img.type.startsWith("view_"));
  const inputImage = design.images.find((img) => img.type === "input");
  const styleLabel = STYLE_LABELS[design.style] ?? design.style;
  const roomGen = ROOM_LABELS_GENITIVE[design.roomType] ?? design.roomType;

  return (
    <article className="bg-[var(--color-background)]">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
          <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-muted)]">
            <Link href="/" className="hover:text-[var(--color-text)]">Главная</Link>
            <span aria-hidden>/</span>
            <Link href="/dizajn" className="hover:text-[var(--color-text)]">AI-дизайн</Link>
            <span aria-hidden>/</span>
            <span className="text-[var(--color-text)]">{design.h1 ?? `Дизайн ${roomGen}`}</span>
          </nav>

          <p className="font-eyebrow mt-7">AI-дизайн-проект</p>
          <h1 className="font-display mt-3 max-w-4xl text-3xl text-[var(--color-text)] sm:text-4xl lg:text-[2.75rem]">
            {design.h1 ?? `Дизайн ${roomGen} в стиле ${styleLabel}`}
          </h1>

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
          </div>
        </div>
      </header>

      {/* ── 4 view renders grid ─────────────────────────── */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 sm:pb-16">
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            {renderImages.map((img, idx) => (
              <figure key={img.url} className="group">
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[var(--color-cream-deep)] shadow-cozy">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={`${VIEW_LABELS[img.type] ?? "Ракурс"} — ${design.h1 ?? "AI-дизайн"}`}
                    loading={idx < 2 ? "eager" : "lazy"}
                    className="block h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
                  />
                </div>
                <figcaption className="mt-2 px-1 text-xs text-[var(--color-muted)]">
                  <span className="font-semibold text-[var(--color-text)]">
                    {idx + 1}.
                  </span>{" "}
                  {VIEW_LABELS[img.type] ?? "Ракурс"}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── Floor plan + Параметры + Палитра ────────────── */}
      <section className="bg-[var(--color-cream-deep)]">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid gap-8 lg:grid-cols-[1fr_1fr_1fr] lg:gap-10">
            {/* Floor plan */}
            <div>
              <p className="font-eyebrow">Вид сверху с расстановкой</p>
              <h2 className="font-display mt-2 text-xl text-[var(--color-text)] sm:text-2xl">
                Планировка.
              </h2>
              <div className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-cozy">
                <FloorPlanSVG roomType={design.roomType} area={design.area} />
              </div>
            </div>

            {/* Параметры проекта */}
            <div>
              <p className="font-eyebrow">Параметры проекта</p>
              <h2 className="font-display mt-2 text-xl text-[var(--color-text)] sm:text-2xl">
                Что входит.
              </h2>
              <dl className="mt-5 space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-cozy text-sm">
                <ParamRow label="Площадь" value={design.area ? `${design.area} м²` : "—"} />
                <ParamRow label="Стиль" value={styleLabel} />
                {design.budget ? (
                  <ParamRow label="Бюджет" value={`до ${formatRub(design.budget)} ₽`} />
                ) : null}
                {design.durationWeeks ? (
                  <ParamRow label="Сроки реализации" value={`${design.durationWeeks} ${pluralWeeks(design.durationWeeks)}`} />
                ) : null}
                {design.cityName ? <ParamRow label="Город" value={design.cityName} /> : null}
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
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ── Materials + Estimate ─────────────────────────── */}
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
                    <tr className="bg-[var(--color-cream-deep)]">
                      <th className="px-5 py-3 text-left font-bold text-[var(--color-text)]">Итого</th>
                      <td className="w-32 whitespace-nowrap px-5 py-3 text-right font-bold text-[var(--color-text)]">
                        {formatRub(Math.round(design.estimate.reduce((s, e) => s + e.amountKopeks, 0) / 100))} ₽
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── Solutions ─────────────────────────────────────── */}
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

      {/* ── Lead form: «Хочу такой же» ─────────────────── */}
      <section id="design-lead" className="scroll-mt-20 bg-[var(--color-text)]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
            {/* Left column: pitch */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary-ring)]">
                Хочу такой же
              </p>
              <h2 className="font-display mt-4 max-w-3xl text-3xl text-white sm:text-4xl lg:text-5xl">
                Подберём мастера, который сделает похоже.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
                Оставьте контакт — мы найдём проверенного мастера{design.cityName ? ` в ${design.cityName}` : ""},
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

            {/* Right column: form */}
            <div>
              <div className="rounded-2xl border border-white/15 bg-[var(--color-surface)] p-6 shadow-cozy-md sm:p-8">
                <DesignLeadForm slug={design.slug} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Description ──────────────────────────────────── */}
      {design.description ? (
        <section className="bg-[var(--color-background)]">
          <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6 sm:pb-20">
            <p className="font-eyebrow">Описание</p>
            <h2 className="font-display mt-2 text-2xl text-[var(--color-text)] sm:text-3xl">
              О проекте.
            </h2>
            <div className="mt-5 space-y-4 text-base leading-relaxed text-[var(--color-muted)] whitespace-pre-line sm:text-lg sm:leading-[1.7]">
              {design.description}
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Hidden input image (для контекста SEO, optional) ─ */}
      {inputImage ? (
        <section className="bg-[var(--color-cream-deep)]">
          <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6 sm:pb-20">
            <p className="font-eyebrow">Исходное фото</p>
            <h2 className="font-display mt-2 text-2xl text-[var(--color-text)] sm:text-3xl">
              Комната до.
            </h2>
            <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-cozy">
              <div className="relative aspect-[4/3] w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={inputImage.url}
                  alt="Фото комнаты до AI-преобразования"
                  loading="lazy"
                  className="block h-full w-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </article>
  );
}

const VIEW_LABELS: Record<string, string> = {
  view_1_entrance: "Общий вид от входа",
  view_2_main: "Главный фокус",
  view_3_storage: "Хранение",
  view_4_window: "Возле окна",
};

function ParamRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--color-muted)]">{label}</dt>
      <dd className="font-semibold text-[var(--color-text)] text-right">{value}</dd>
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
