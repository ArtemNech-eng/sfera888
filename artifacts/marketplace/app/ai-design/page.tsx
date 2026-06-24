import type { Metadata } from "next";
import { publicUrl } from "../../lib/env";
import { AiDesignForm } from "./_AiDesignForm";

/**
 * `/ai-design` — публичный лендинг + форма запуска AI-дизайн-проекта.
 *
 * Страница продуктовой линии AI_Design_Product (см. spec
 * `.kiro/specs/ai-design-product`). На MVP запускать генерацию можно только
 * для типа помещения `bedroom` — остальные типы показаны с пометкой
 * «скоро» и не отправляются.
 *
 * Pipeline после submit:
 *   1. Cloudflare Turnstile верифицирует пользователя на стороне браузера
 *      и подставляет `cf-turnstile-response` в форму.
 *   2. POST `/api/marketplace/dizajn/generate` (через прокси marketplace).
 *   3. При 202 — редирект на `/dizajn/{slug}` (там polling и финальный
 *      design-board).
 *   4. При 400/429 — пользователь видит человеко-читаемое сообщение и
 *      может исправить ввод и нажать снова.
 */

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: { absolute: "AI-дизайн интерьера — Честные мастера" },
    description:
      "Получите дизайн-проект интерьера за 3–5 минут: 6 ракурсов, план комнаты, материалы, смета и подбор мебели — без регистрации, по короткой форме.",
    alternates: { canonical: `${publicUrl()}/ai-design` },
  };
}

export default function AiDesignPage() {
  // `NEXT_PUBLIC_*` доступен и на сервере, и в клиентском бандле — пробрасываем
  // его в форму как prop, чтобы клиентский компонент не имел собственного
  // обращения к `process.env` (упрощает SSR-тесты и чтение конфига).
  const turnstileSiteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ??
    // Cloudflare Turnstile dev/test siteKey — всегда выдаёт valid токен,
    // используется только когда production env не задан (локальная разработка).
    "1x00000000000000000000AA";

  return (
    <>
      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-10 sm:px-6 sm:pb-12 sm:pt-14">
          <div className="max-w-3xl">
            <p className="font-eyebrow">AI-дизайн</p>
            <h1 className="font-display mt-3 text-4xl text-[var(--color-text)] sm:text-5xl lg:text-[3.5rem]">
              AI-дизайн интерьера за 3–5 минут.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
              Заполните короткую форму — нейросеть подготовит проект:
              6 фотореалистичных ракурсов, план комнаты вид сверху,
              изометрический ракурс с подписями, цветовая палитра, смета
              и подобранные материалы и мебель со ссылками. Без регистрации.
            </p>
            <ul className="mt-6 grid gap-2 text-sm text-[var(--color-muted)] sm:grid-cols-2">
              <li className="flex items-start gap-2">
                <Bullet />
                <span>6 ракурсов одной и той же комнаты в выбранном стиле</span>
              </li>
              <li className="flex items-start gap-2">
                <Bullet />
                <span>Точный 2D-план с размерами стен и мебели</span>
              </li>
              <li className="flex items-start gap-2">
                <Bullet />
                <span>Смета по реальным ценам и подбор мебели по бюджету</span>
              </li>
              <li className="flex items-start gap-2">
                <Bullet />
                <span>Скачиваемый PDF проекта на A4</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Form ──────────────────────────────────────────── */}
      <section className="bg-[var(--color-background)]">
        <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-20">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-cozy sm:p-8 lg:p-10">
            <AiDesignForm turnstileSiteKey={turnstileSiteKey} />
          </div>
        </div>
      </section>
    </>
  );
}

function Bullet() {
  return (
    <span
      aria-hidden
      className="mt-1.5 inline-block h-1.5 w-1.5 flex-none rounded-full bg-[var(--color-primary)]"
    />
  );
}
