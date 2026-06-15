import type { Metadata } from "next";
import { publicUrl } from "../../../lib/env";

// Static legal page — no API, no DB. Safe to prerender.
export const dynamic = "force-static";

const LAST_UPDATED = "16 июня 2026";

export function generateMetadata(): Metadata {
  return {
    title: "Политика конфиденциальности — Честные мастера",
    description:
      "Как сервис «Честные мастера» обрабатывает персональные данные пользователей.",
    alternates: { canonical: `${publicUrl()}/policy/privacy` },
  };
}

export default function PrivacyPolicyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold text-[var(--color-text)] sm:text-4xl">
        Политика конфиденциальности
      </h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Дата обновления: {LAST_UPDATED}
      </p>

      <div className="mt-8 grid gap-6 text-base text-[var(--color-text)]">
        <section>
          <h2 className="text-xl font-semibold">1. Оператор сервиса</h2>
          <p className="mt-2 text-[var(--color-muted)]">
            Сервис «Честные мастера» (далее — «Сервис») обрабатывает персональные данные
            пользователей, оставивших заявку на сайте. Контактные данные оператора могут
            быть запрошены через форму обратной связи.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">2. Какие данные мы собираем</h2>
          <ul className="mt-2 ml-5 list-disc space-y-1 text-[var(--color-muted)]">
            <li>имя, указанное в форме заявки;</li>
            <li>номер телефона;</li>
            <li>город и услугу, выбранные пользователем;</li>
            <li>текст комментария к заявке;</li>
            <li>IP-адрес и user-agent браузера в момент отправки заявки;</li>
            <li>служебные технические данные о заявке: время, страница-источник.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">3. Зачем мы используем данные</h2>
          <ul className="mt-2 ml-5 list-disc space-y-1 text-[var(--color-muted)]">
            <li>обработка заявки и подбор подходящего мастера;</li>
            <li>связь с пользователем по конкретной заявке;</li>
            <li>защита от спама и злоупотреблений (rate-limit, антибот);</li>
            <li>улучшение качества сервиса.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">4. Кому передаём данные</h2>
          <p className="mt-2 text-[var(--color-muted)]">
            Доступ к данным заявки получают операторы сервиса и мастер, которому передана
            конкретная заявка. Третьим лицам, не связанным с обработкой заявки, данные
            не передаются.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">5. Что мы не показываем публично</h2>
          <p className="mt-2 text-[var(--color-muted)]">
            Номер телефона пользователя не публикуется на сайте и не отображается
            в открытых объявлениях. Точный адрес проведения работ не публикуется.
            Текст комментария используется только для подбора мастера и согласования
            задачи.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">6. Удаление и изменение данных</h2>
          <p className="mt-2 text-[var(--color-muted)]">
            Пользователь может запросить удаление или изменение своих данных, написав
            в Сервис через форму обратной связи. Запрос обрабатывается в разумный срок,
            если это не противоречит требованиям применимого законодательства.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">7. Изменения политики</h2>
          <p className="mt-2 text-[var(--color-muted)]">
            Сервис может изменять текст этой политики. Актуальная версия всегда доступна
            по адресу /policy/privacy. Дата обновления указана в начале документа.
          </p>
        </section>
      </div>
    </article>
  );
}
