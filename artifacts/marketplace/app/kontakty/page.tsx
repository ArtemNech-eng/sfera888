import type { Metadata } from "next";
import Link from "next/link";
import { publicUrl } from "../../lib/env";

// Static page — no API, no DB.
export const dynamic = "force-static";

export function generateMetadata(): Metadata {
  return {
    title: { absolute: "Контакты — Честные мастера" },
    description:
      "Связаться с сервисом «Честные мастера»: оставить заявку, задать вопрос, оставить отзыв.",
    alternates: { canonical: `${publicUrl()}/kontakty` },
  };
}

export default function ContactsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-semibold text-[var(--color-text)] sm:text-4xl">
        Контакты
      </h1>
      <p className="mt-3 text-base text-[var(--color-muted)] sm:text-lg">
        Самый быстрый способ — оставить заявку: мы перезвоним в течение часа в
        рабочее время.
      </p>

      <div className="mt-8 grid gap-4">
        <Link
          href="/uslugi"
          className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition hover:border-[var(--color-primary)]"
        >
          <div className="text-base font-medium text-[var(--color-text)]">
            Оставить заявку
          </div>
          <div className="mt-1 text-sm text-[var(--color-muted)]">
            Выберите услугу и город — подберём мастера.
          </div>
        </Link>

        <a
          href="https://sfera-master.ru/masteram"
          rel="noopener noreferrer"
          className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition hover:border-[var(--color-primary)]"
        >
          <div className="text-base font-medium text-[var(--color-text)]">
            Стать мастером
          </div>
          <div className="mt-1 text-sm text-[var(--color-muted)]">
            Если вы мастер и хотите получать заявки через сервис — заполните форму
            на странице для мастеров.
          </div>
        </a>

        <a
          href="mailto:hi@chestnye-mastera.ru"
          className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition hover:border-[var(--color-primary)]"
        >
          <div className="text-base font-medium text-[var(--color-text)]">
            Написать на email
          </div>
          <div className="mt-1 text-sm text-[var(--color-muted)]">
            hi@chestnye-mastera.ru — для вопросов, отзывов и сотрудничества.
          </div>
        </a>
      </div>

      <h2 className="mt-12 text-2xl font-semibold text-[var(--color-text)]">
        Реквизиты
      </h2>
      <dl className="mt-4 grid gap-2 text-sm text-[var(--color-muted)] sm:grid-cols-[max-content,1fr] sm:gap-x-6">
        <dt className="font-medium text-[var(--color-text)]">Оператор</dt>
        <dd>ИП Коваленко И.Г.</dd>
        <dt className="font-medium text-[var(--color-text)]">ИНН</dt>
        <dd>262409599800</dd>
        <dt className="font-medium text-[var(--color-text)]">Сайт</dt>
        <dd>chestnye-mastera.ru</dd>
      </dl>

      <h2 className="mt-12 text-2xl font-semibold text-[var(--color-text)]">
        Время работы
      </h2>
      <p className="mt-3 text-base text-[var(--color-muted)]">
        Заявки принимаются круглосуточно. Операторы обрабатывают их с 9:00 до
        21:00 (МСК). За пределами этого времени мы перезваниваем утром следующего
        рабочего дня.
      </p>

      <div className="mt-12 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)] p-5 text-sm text-[var(--color-muted)]">
        Условия использования сервиса описаны в{" "}
        <Link href="/policy/privacy" className="text-[var(--color-primary)] hover:underline">
          Политике конфиденциальности
        </Link>{" "}
        и{" "}
        <Link href="/policy/terms" className="text-[var(--color-primary)] hover:underline">
          Пользовательском соглашении
        </Link>
        .
      </div>
    </article>
  );
}
