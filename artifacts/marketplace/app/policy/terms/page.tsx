import type { Metadata } from "next";
import { publicUrl } from "../../../lib/env";

// Static legal page — no API, no DB. Safe to prerender.
export const dynamic = "force-static";

const LAST_UPDATED = "16 июня 2026";

export function generateMetadata(): Metadata {
  return {
    title: "Пользовательское соглашение — Честные мастера",
    description: "Правила использования сервиса «Честные мастера».",
    alternates: { canonical: `${publicUrl()}/policy/terms` },
  };
}

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold text-[var(--color-text)] sm:text-4xl">
        Пользовательское соглашение
      </h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Дата обновления: {LAST_UPDATED}
      </p>

      <div className="mt-8 grid gap-6 text-base text-[var(--color-text)]">
        <section>
          <h2 className="text-xl font-semibold">1. О сервисе</h2>
          <p className="mt-2 text-[var(--color-muted)]">
            Сервис «Честные мастера» (далее — «Сервис») помогает пользователю оставить
            заявку на бытовые и ремонтные работы и подобрать подходящего мастера для
            её выполнения.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">2. Заявка не является договором</h2>
          <p className="mt-2 text-[var(--color-muted)]">
            Отправка заявки не создаёт договор между пользователем и Сервисом и не
            обязывает мастера принять её к исполнению. Договор считается заключённым
            только после прямого согласования условий между пользователем и мастером.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">3. Стоимость работ</h2>
          <p className="mt-2 text-[var(--color-muted)]">
            Окончательная стоимость работ согласуется напрямую между пользователем
            и мастером с учётом объёма, сроков и характера задачи. Цены, указанные на
            сайте, носят ориентировочный характер.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">4. Корректные данные</h2>
          <p className="mt-2 text-[var(--color-muted)]">
            Пользователь обязуется указывать в заявке корректные сведения: действующий
            номер телефона и реальное описание задачи. Указание заведомо ложных
            данных делает заявку недействительной.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">5. Защита от спама</h2>
          <p className="mt-2 text-[var(--color-muted)]">
            Сервис вправе отклонять или удалять заявки, которые содержат
            рекламу, оскорбления, признаки автоматической рассылки или иные
            нарушения. Сервис применяет ограничение количества заявок с одного
            устройства и одного номера за единицу времени.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">6. Защита телефона</h2>
          <p className="mt-2 text-[var(--color-muted)]">
            Номер телефона пользователя не публикуется на сайте в открытом виде.
            Контакт получает только мастер, которому передана конкретная заявка,
            и операторы Сервиса.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">7. Изменения условий</h2>
          <p className="mt-2 text-[var(--color-muted)]">
            Сервис может изменять текст соглашения. Актуальная версия всегда доступна
            по адресу /policy/terms. Дата обновления указана в начале документа.
            Использование Сервиса после обновления означает согласие с новой редакцией.
          </p>
        </section>
      </div>
    </article>
  );
}
