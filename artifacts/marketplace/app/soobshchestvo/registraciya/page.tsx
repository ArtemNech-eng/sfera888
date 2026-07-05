import type { Metadata } from "next";
import Link from "next/link";
import { publicUrl } from "../../../lib/env";
import { RegisterForm } from "../../../components/community/RegisterForm";
import { isInternalPath } from "../../../lib/communityAuthFlow";

/**
 * `/soobshchestvo/registraciya` — регистрация Community_Account по телефону и
 * паролю (spec: community-phone-registration, Requirement 8).
 *
 * Серверный компонент читает публичный конфиг (`NEXT_PUBLIC_*`) и прокидывает
 * его в клиентскую `RegisterForm` как props, чтобы клиент не обращался к
 * `process.env` напрямую:
 *   • `NEXT_PUBLIC_SMARTCAPTCHA_SITE_KEY` — клиентский ключ Yandex SmartCaptcha
 *     (та же переменная, что у формы `/dizajn`);
 *   • `NEXT_PUBLIC_API_BASE_URL` — браузерная база api-server (например
 *     `https://sfera-master.ru/api`); регистрация шлётся туда напрямую с
 *     `credentials: "include"`, чтобы cookie сессии `connect.sid` выставилась
 *     на домене api-server (Requirement 8.5).
 *
 * ВНИМАНИЕ: `NEXT_PUBLIC_*` вшивается в бандл на этапе СБОРКИ — при смене
 * значения marketplace нужно пересобрать.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Регистрация в сообществе — Соседи",
  description:
    "Зарегистрируйтесь по номеру телефона и паролю, чтобы публиковать в " +
    "соседских сообществах: обсуждения по городам и жилым комплексам.",
  robots: { index: false, follow: false },
  alternates: { canonical: `${publicUrl()}/soobshchestvo/registraciya` },
};

interface SearchParams {
  next?: string;
}

export default async function CommunityRegisterPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const captchaSiteKey = process.env.NEXT_PUBLIC_SMARTCAPTCHA_SITE_KEY ?? "";
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://sfera-master.ru/api";
  const next =
    params.next && isInternalPath(params.next) ? params.next : undefined;

  return (
    <div className="zen">
      <div className="zen-shell" style={{ maxWidth: 520 }}>
        <nav className="zen-crumbs">
          <Link href="/">Главная</Link> · <Link href="/soobshchestvo">Соседи</Link> ·
          Регистрация
        </nav>

        <header>
          <span className="zen-eyebrow">Соседи</span>
          <h1 className="zen-title">Регистрация в сообществе</h1>
          <p className="zen-sub">
            Телефон — ваш логин. Задайте пароль, пройдите проверку — и сможете
            публиковать в сообществах своего города и ЖК.
          </p>
        </header>

        <section className="zen-panel" style={{ marginTop: 24 }}>
          <RegisterForm
            captchaSiteKey={captchaSiteKey}
            apiBaseUrl={apiBaseUrl}
            next={next}
          />
        </section>
      </div>
    </div>
  );
}
