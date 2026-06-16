import type { Metadata } from "next";
import Link from "next/link";
import { publicUrl } from "../../lib/env";

// Static page — no API, no DB. Safe to prerender.
export const dynamic = "force-static";

export function generateMetadata(): Metadata {
  return {
    title: { absolute: "О сервисе — Честные мастера" },
    description:
      "«Честные мастера» — сервис подбора проверенных мастеров для ремонта в России. Принимаем заявки и связываем клиентов с исполнителями.",
    alternates: { canonical: `${publicUrl()}/o-nas` },
  };
}

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-semibold text-[var(--color-text)] sm:text-4xl">
        О сервисе
      </h1>

      <div className="mt-6 grid gap-5 text-base text-[var(--color-text)]">
        <p>
          «Честные мастера» помогают жителям Краснодара, Ставрополя, Ростова-на-Дону
          и других городов России находить проверенных мастеров для ремонта
          квартир, домов и бытовых задач.
        </p>
        <p className="text-[var(--color-muted)]">
          Сервис принимает заявку через сайт, проверяет её на спам и недостоверные
          данные, и передаёт мастеру, который специализируется на нужной услуге
          в выбранном городе. Мастер связывается с клиентом по телефону, уточняет
          задачу, согласует время и стоимость работы.
        </p>
        <p className="text-[var(--color-muted)]">
          Мы не берём оплату с клиентов — стоимость согласуется напрямую с мастером.
          Сервис существует за счёт мастеров, которые получают заявки.
        </p>
      </div>

      <h2 className="mt-12 text-2xl font-semibold text-[var(--color-text)]">
        Почему «Честные»
      </h2>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {[
          {
            t: "Проверенные мастера",
            d: "Каждый мастер проходит проверку документов перед началом работы.",
          },
          {
            t: "Без рассылки в десять мест",
            d: "Заявка идёт мастеру, который специализируется на нужной услуге, а не куда попало.",
          },
          {
            t: "Телефон не публикуется",
            d: "Номер клиента видит только мастер, которому передана заявка, и оператор сервиса.",
          },
          {
            t: "Прозрачная цена",
            d: "Цена согласуется до начала работ и фиксируется в заказе. Без сюрпризов в смете.",
          },
        ].map((b) => (
          <li
            key={b.t}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
          >
            <div className="text-base font-medium text-[var(--color-text)]">{b.t}</div>
            <div className="mt-1 text-sm text-[var(--color-muted)]">{b.d}</div>
          </li>
        ))}
      </ul>

      <h2 className="mt-12 text-2xl font-semibold text-[var(--color-text)]">
        Что мы делаем
      </h2>
      <ol className="mt-6 grid gap-3 text-base text-[var(--color-muted)]">
        <li>1. Принимаем заявку клиента через форму на сайте.</li>
        <li>2. Подбираем мастера по услуге, городу и типу задачи.</li>
        <li>3. Передаём заявку мастеру в защищённом канале.</li>
        <li>4. Помогаем мастеру и клиенту согласовать детали и сроки.</li>
        <li>5. Не вмешиваемся в саму работу — её выполняет мастер.</li>
      </ol>

      <div className="mt-12 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)] p-5 text-sm text-[var(--color-muted)]">
        Хотите оставить заявку прямо сейчас?{" "}
        <Link href="/uslugi" className="text-[var(--color-primary)] hover:underline">
          Выбрать услугу
        </Link>{" "}
        или связаться с нами через{" "}
        <Link href="/kontakty" className="text-[var(--color-primary)] hover:underline">
          контакты
        </Link>
        .
      </div>
    </article>
  );
}
