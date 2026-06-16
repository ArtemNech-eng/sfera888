import Link from "next/link";
import type { Metadata } from "next";
import { publicUrl } from "../../lib/env";

// Static SEO landing — no API call, no DB.
export const dynamic = "force-static";

export function generateMetadata(): Metadata {
  return {
    // `absolute` — so the layout's "%s · Честные мастера" template doesn't
    // produce double-brand "AI-дизайнер · ... · Честные мастера".
    title: { absolute: "AI-дизайнер интерьера — Честные мастера" },
    description:
      "Загрузите фото комнаты и получите идеи дизайна интерьера с помощью AI.",
    alternates: { canonical: `${publicUrl()}/dizajn` },
  };
}

const ROOM_TYPES = [
  { name: "Дизайн ванной", hint: "Плитка, душевая, мебель, освещение" },
  { name: "Дизайн кухни", hint: "Гарнитур, фартук, освещение, бытовая техника" },
  { name: "Дизайн гостиной", hint: "Зонирование, отделка, мебель" },
  { name: "Дизайн спальни", hint: "Цвет стен, мебель, текстиль" },
  { name: "Дизайн прихожей", hint: "Шкаф, освещение, отделка" },
];

const STYLES = [
  "Современный",
  "Скандинавский",
  "Лофт",
  "Минимализм",
  "Неоклассика",
  "Светлый ремонт",
];

const STEPS: Array<{ n: string; t: string; d: string }> = [
  { n: "1", t: "Загружаете фото", d: "Снимок комнаты с телефона. Подойдёт обычное фото." },
  { n: "2", t: "Выбираете помещение и стиль", d: "Ванная, кухня, гостиная и так далее. Стиль на ваш выбор." },
  { n: "3", t: "Получаете варианты дизайна", d: "AI рисует, как может выглядеть та же комната после ремонта." },
  { n: "4", t: "Оставляете заявку мастеру", d: "Понравился вариант — мы подберём мастера, который сможет его повторить." },
];

const BENEFITS: Array<{ t: string; d: string }> = [
  { t: "Увидеть идею до ремонта", d: "Показывает, как может выглядеть результат — без походов в шоурум." },
  { t: "Выбрать стиль", d: "Сравните несколько направлений на одной и той же комнате." },
  { t: "Объяснить мастеру визуально", d: "Картинка понятнее тысячи слов в смете." },
  { t: "Быстрее получить смету", d: "Мастер сразу видит масштаб задачи и материалы." },
];

export default function DesignerLandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[1.1fr,1fr] lg:items-center">
            <div>
              <span className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
                Beta · Лид-магнит для ремонта
              </span>
              <h1 className="mt-4 text-4xl font-semibold leading-tight text-[var(--color-text)] sm:text-6xl">
                AI-дизайнер интерьера
              </h1>
              <p className="mt-4 max-w-xl text-base text-[var(--color-muted)] sm:text-lg">
                Загрузите фото комнаты и получите идеи ремонта в разных стилях.
                А если понравится результат — оставьте заявку, и мы подберём
                мастера.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/dizajn/new"
                  className="inline-flex items-center justify-center rounded-xl bg-[var(--color-primary)] px-6 py-3 text-base font-medium text-white transition hover:bg-[var(--color-primary-hover)]"
                >
                  Попробовать бесплатно
                </Link>
                <Link
                  href="/uslugi"
                  className="inline-flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-6 py-3 text-base font-medium text-[var(--color-text)] transition hover:border-[var(--color-primary)]"
                >
                  Подобрать мастера
                </Link>
              </div>
            </div>

            {/* Before / After mock — pure CSS/SVG, no external images. */}
            <BeforeAfterMock />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
          Как это работает
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
            >
              <div className="text-3xl font-semibold text-[var(--color-primary)]">{s.n}</div>
              <div className="mt-2 text-base font-medium text-[var(--color-text)]">{s.t}</div>
              <div className="mt-1 text-sm text-[var(--color-muted)]">{s.d}</div>
            </li>
          ))}
        </ol>
      </section>

      {/* What you can design */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
            Что можно сделать
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ROOM_TYPES.map((r) => (
              <li
                key={r.name}
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6"
              >
                <div className="text-lg font-medium text-[var(--color-text)]">{r.name}</div>
                <div className="mt-1 text-sm text-[var(--color-muted)]">{r.hint}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Styles */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">Стили</h2>
        <p className="mt-2 text-base text-[var(--color-muted)]">
          Можно посмотреть, как одна и та же комната выглядит в разных стилях, и выбрать тот,
          что нравится больше.
        </p>
        <ul className="mt-6 flex flex-wrap gap-2">
          {STYLES.map((style) => (
            <li
              key={style}
              className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-text)]"
            >
              {style}
            </li>
          ))}
        </ul>
      </section>

      {/* Why useful */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
            Почему это полезно
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {BENEFITS.map((b) => (
              <li
                key={b.t}
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5"
              >
                <div className="text-base font-medium text-[var(--color-text)]">{b.t}</div>
                <div className="mt-1 text-sm text-[var(--color-muted)]">{b.d}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <h2 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
          Готовы попробовать?
        </h2>
        <p className="mt-3 text-base text-[var(--color-muted)]">
          Загрузите фото комнаты и получите идеи. Это бесплатно и занимает пару минут.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/dizajn/new"
            className="inline-flex items-center justify-center rounded-xl bg-[var(--color-primary)] px-6 py-3 text-base font-medium text-white transition hover:bg-[var(--color-primary-hover)]"
          >
            Попробовать AI-дизайнер
          </Link>
          <Link
            href="/uslugi"
            className="inline-flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-6 py-3 text-base font-medium text-[var(--color-text)] transition hover:border-[var(--color-primary)]"
          >
            Смотреть услуги
          </Link>
        </div>
      </section>
    </>
  );
}

/**
 * Pure CSS/SVG mock of a "Before / After" interior comparison. No external
 * imagery — everything is drawn inline with primitives so the page works
 * fully offline and the bundle size stays at zero KB extra.
 */
function BeforeAfterMock() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <RoomCard variant="before" caption="До" />
      <RoomCard variant="after" caption="AI-вариант" />
    </div>
  );
}

function RoomCard({ variant, caption }: { variant: "before" | "after"; caption: string }) {
  const isAfter = variant === "after";
  return (
    <figure className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
      <div className="relative aspect-[4/3] w-full">
        <svg
          viewBox="0 0 200 150"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
          className="h-full w-full"
          preserveAspectRatio="none"
        >
          {/* Walls */}
          <rect x="0" y="0" width="200" height="115" fill={isAfter ? "#F8FAFC" : "#E2E8F0"} />
          {/* Floor */}
          <rect x="0" y="115" width="200" height="35" fill={isAfter ? "#E7DACB" : "#CBD5E1"} />
          {/* Window */}
          <rect
            x="30"
            y="20"
            width="60"
            height="55"
            fill={isAfter ? "#FFFFFF" : "#94A3B8"}
            stroke={isAfter ? "#94A3B8" : "#64748B"}
            strokeWidth="1"
          />
          <line
            x1="60"
            y1="20"
            x2="60"
            y2="75"
            stroke={isAfter ? "#94A3B8" : "#64748B"}
            strokeWidth="1"
          />
          {/* Furniture */}
          {isAfter ? (
            <>
              {/* Sofa */}
              <rect x="20" y="92" width="80" height="22" rx="4" fill="#0F766E" />
              <rect x="22" y="88" width="22" height="6" rx="2" fill="#0F766E" />
              <rect x="76" y="88" width="22" height="6" rx="2" fill="#0F766E" />
              {/* Plant */}
              <rect x="120" y="80" width="14" height="34" fill="#A07A55" />
              <circle cx="127" cy="76" r="14" fill="#0F766E" opacity="0.85" />
              {/* Pendant lamp */}
              <line x1="155" y1="0" x2="155" y2="40" stroke="#94A3B8" strokeWidth="1" />
              <circle cx="155" cy="44" r="6" fill="#FACC15" />
              {/* Picture */}
              <rect x="105" y="22" width="40" height="28" fill="#FFFFFF" stroke="#94A3B8" />
              <rect x="110" y="27" width="14" height="18" fill="#0F766E" opacity="0.6" />
              <rect x="126" y="32" width="14" height="13" fill="#FACC15" opacity="0.7" />
            </>
          ) : (
            <>
              {/* Old sofa block */}
              <rect x="20" y="95" width="80" height="20" fill="#94A3B8" />
              {/* Bare wall, no decor */}
              <line x1="0" y1="115" x2="200" y2="115" stroke="#64748B" strokeWidth="0.5" />
            </>
          )}
        </svg>
      </div>
      <figcaption className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-3 text-sm">
        <span className="font-medium text-[var(--color-text)]">{caption}</span>
        {isAfter ? (
          <span className="rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-xs font-medium text-white">
            AI
          </span>
        ) : (
          <span className="text-xs text-[var(--color-muted)]">оригинал</span>
        )}
      </figcaption>
    </figure>
  );
}
