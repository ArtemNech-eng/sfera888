import Link from "next/link";
import type { Metadata } from "next";
import { fetchRecentDesigns } from "../../lib/api";
import { publicUrl } from "../../lib/env";
import { FlagshipForm } from "./_FlagshipForm";

/**
 * `/dizajn` — landing AI-дизайнера с upload-формой прямо в hero.
 *
 * После submit формы пользователь редиректится на `/dizajn/{slug}` где
 * polling и финальный design-board.
 *
 * Под формой — feed последних public успешных генераций (примеры стилей
 * в действии).
 */

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: { absolute: "AI-дизайн интерьера — Честные мастера" },
    description:
      "Загрузите фото комнаты и получите дизайн-проект в выбранном стиле: 4 ракурса, материалы, смета, мастера для реализации.",
    alternates: { canonical: `${publicUrl()}/dizajn` },
  };
}

export default async function DizajnLandingPage() {
  const recentDesigns = await fetchRecentDesigns({ limit: 8 }).catch(() => []);

  // `NEXT_PUBLIC_*` доступен и на сервере, и в клиентском бандле — пробрасываем
  // его в `Flagship_Form` как prop, чтобы клиентский компонент не обращался к
  // `process.env` напрямую (упрощает SSR-тесты и чтение конфига).
  // ВНИМАНИЕ: `NEXT_PUBLIC_*` вшивается в бандл на этапе СБОРКИ — при смене
  // ключа нужно пересобрать marketplace, иначе в клиенте останется старое значение.
  const captchaSiteKey = process.env.NEXT_PUBLIC_SMARTCAPTCHA_SITE_KEY ?? "";

  return (
    <>
      {/* ── Hero with form ─────────────────────────────── */}
      {/* Премиальный тёмный+золото акцент — ТОЧЕЧНО на hero AI-фичи.
          Остальная страница (форма, фид, «как работает») — светлая база. */}
      <section className="surface-premium">
        <div className="mx-auto max-w-6xl px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-16">
          <div className="max-w-3xl">
            <span className="badge-gold">AI-дизайн</span>
            <h1 className="font-display mt-5 text-4xl text-[var(--color-premium-text)] sm:text-5xl lg:text-[3.5rem]">
              Создайте дизайн-проект за минуту.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--color-premium-muted)] sm:text-lg">
              Загрузите фото комнаты, выберите стиль — AI нарисует 4 ракурса в
              новом дизайне, подберёт материалы и составит смету. Понравится —
              найдём мастера, который сделает похоже.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-cozy sm:p-8 lg:p-10">
            <FlagshipForm captchaSiteKey={captchaSiteKey} />
          </div>
        </div>
      </section>

      {/* ── Recent generations feed ──────────────────────── */}
      {recentDesigns.length > 0 ? (
        <section className="bg-[var(--color-cream-deep)]">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="max-w-2xl">
              <p className="font-eyebrow">Свежие проекты</p>
              <h2 className="font-display mt-2 text-3xl text-[var(--color-text)] sm:text-4xl">
                Что недавно создавали другие.
              </h2>
            </div>

            <ul className="mt-10 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {recentDesigns.map((d) => (
                <li key={d.id}>
                  <Link href={`/dizajn/${d.slug}`} className="group block focus:outline-none">
                    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-cozy transition group-hover:shadow-cozy-md">
                      {d.resultImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={d.resultImageUrl}
                          alt={d.h1 ?? `Дизайн ${d.roomType}`}
                          loading="lazy"
                          className="block h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                        />
                      ) : null}
                    </div>
                    <p className="mt-3 line-clamp-2 px-1 text-sm font-semibold text-[var(--color-text)] transition group-hover:text-[var(--color-primary)]">
                      {d.h1 ?? `Дизайн ${d.roomType} в стиле ${d.style}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ── How it works ─────────────────────────────────── */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl text-[var(--color-text)] sm:text-4xl">
              Как это работает.
            </h2>
          </div>
          <ol className="mt-10 grid gap-6 md:grid-cols-4">
            {[
              { n: "01", t: "Загружаете фото", d: "Снимок комнаты с телефона. Подойдёт обычное фото." },
              { n: "02", t: "Выбираете параметры", d: "Помещение, стиль, площадь, бюджет — что хотите учесть." },
              { n: "03", t: "AI готовит проект", d: "За 30-60 секунд: 4 ракурса, материалы, смета, цветовая палитра." },
              { n: "04", t: "Найдём мастера", d: "Понравился вариант — подберём мастера, который сделает похоже." },
            ].map((s) => (
              <li key={s.n}>
                <p className="font-display text-5xl text-[var(--color-primary)]">{s.n}</p>
                <h3 className="font-display mt-4 text-xl text-[var(--color-text)] sm:text-2xl">{s.t}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
