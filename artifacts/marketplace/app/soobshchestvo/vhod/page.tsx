import type { Metadata } from "next";
import Link from "next/link";
import { publicUrl } from "../../../lib/env";
import { LoginForm } from "../../../components/community/LoginForm";
import { isInternalPath } from "../../../lib/communityAuthFlow";

/**
 * `/soobshchestvo/vhod` — вход Community_Account по телефону и паролю
 * (spec: community-phone-registration, Requirement 8.2).
 *
 * Серверный компонент читает публичный конфиг (`NEXT_PUBLIC_*`) и прокидывает
 * его в клиентскую `LoginForm` как props, чтобы клиент не обращался к
 * `process.env` напрямую:
 *   • `NEXT_PUBLIC_API_BASE_URL` — браузерная база api-server (например
 *     `https://sfera-master.ru/api`); вход шлётся туда напрямую с
 *     `credentials: "include"`, чтобы cookie сессии `connect.sid` выставилась
 *     на домене api-server (Requirement 8.5).
 *
 * У формы входа капчи НЕТ (Requirement 8.2), поэтому клиентский ключ
 * SmartCaptcha странице не нужен — в отличие от `/registraciya`.
 *
 * ВНИМАНИЕ: `NEXT_PUBLIC_*` вшивается в бандл на этапе СБОРКИ — при смене
 * значения marketplace нужно пересобрать.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Вход в сообщество — Соседи",
  description:
    "Войдите по номеру телефона и паролю, чтобы публиковать в соседских " +
    "сообществах: обсуждения по городам и жилым комплексам.",
  robots: { index: false, follow: false },
  alternates: { canonical: `${publicUrl()}/soobshchestvo/vhod` },
};

interface SearchParams {
  next?: string;
}

export default async function CommunityLoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://sfera-master.ru/api";
  const next =
    params.next && isInternalPath(params.next) ? params.next : undefined;

  return (
    <div className="zen">
      <div className="zen-shell" style={{ maxWidth: 520 }}>
        <nav className="zen-crumbs">
          <Link href="/">Главная</Link> · <Link href="/soobshchestvo">Соседи</Link> ·
          Вход
        </nav>

        <header>
          <span className="zen-eyebrow">Соседи</span>
          <h1 className="zen-title">Вход в сообщество</h1>
          <p className="zen-sub">
            Введите телефон и пароль, чтобы вернуться к публикациям в сообществах
            своего города и ЖК.
          </p>
        </header>

        <section className="zen-panel" style={{ marginTop: 24 }}>
          <LoginForm apiBaseUrl={apiBaseUrl} next={next} />
        </section>
      </div>
    </div>
  );
}
