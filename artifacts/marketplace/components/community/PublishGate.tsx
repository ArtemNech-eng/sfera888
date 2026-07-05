"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  withNext,
  COMMUNITY_REGISTER_PATH,
  COMMUNITY_LOGIN_PATH,
} from "../../lib/communityAuthFlow";

/**
 * `PublishGate` — гейт публикации в Web_Facade
 * (spec: community-phone-registration, Requirement 8.7).
 *
 * КОГДА участник инициирует публикацию, НЕ имея действительной
 * Community_Session, ТОГДА Web_Facade предлагает регистрацию или вход
 * (Requirement 8.7). Компонент проактивно проверяет наличие валидной сессии
 * ДО показа формы публикации, обращаясь к `GET ${apiBaseUrl}/community/auth/me`
 * напрямую на api-server с `credentials: "include"` — тем же механизмом
 * (`connect.sid`), которым RegisterForm/LoginForm устанавливают сессию.
 *
 * Три состояния:
 *   • checking  — идёт проверка сессии (лёгкий скелет, чтобы не мигать формой);
 *   • authed    — сессия валидна (200) → рендерим `children` (форму публикации);
 *   • anon      — сессии нет (401) ИЛИ проверка недоступна → показываем
 *                 предложение зарегистрироваться или войти с `?next=`, чтобы
 *                 вернуть участника к контексту публикации после аутентификации.
 *
 * Fail-closed: если `/me` недоступен (сеть/сервер), гейт трактует участника как
 * неаутентифицированного и предлагает регистрацию/вход — публикация без
 * подтверждённой сессии не открывается.
 */

interface PublishGateProps {
  /**
   * База api-server для браузерных запросов, например
   * `https://sfera-master.ru/api`. Проверка сессии идёт на
   * `${apiBaseUrl}/community/auth/me` напрямую, чтобы cookie `connect.sid`
   * читалась на домене api-server (как у RegisterForm/LoginForm).
   */
  apiBaseUrl: string;
  /**
   * Путь, к которому вернуть участника после регистрации/входа. По умолчанию —
   * текущий путь страницы (`usePathname`), чтобы он вернулся к публикации.
   */
  next?: string;
  /** Заголовок панели предложения. */
  title?: string;
  /** Пояснение под заголовком. */
  description?: string;
  /** Форма/кнопка публикации — рендерится только при валидной сессии. */
  children: ReactNode;
}

type SessionState = "checking" | "authed" | "anon";

export function PublishGate({
  apiBaseUrl,
  next,
  title = "Публикация — для участников сообщества",
  description = "Чтобы опубликовать, зарегистрируйтесь или войдите. Это займёт минуту, а телефон станет вашим логином.",
  children,
}: PublishGateProps) {
  const pathname = usePathname();
  const [state, setState] = useState<SessionState>("checking");

  const checkSession = useCallback(async () => {
    setState("checking");
    const url = `${apiBaseUrl.replace(/\/+$/, "")}/community/auth/me`;
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        // Передаём cookie сессии (connect.sid) от api-server.
        credentials: "include",
        cache: "no-store",
      });
      // 200 → валидная Community_Session; всё прочее (401 и т.п.) → аноним.
      setState(res.status === 200 ? "authed" : "anon");
    } catch {
      // Fail-closed: недоступность проверки трактуем как отсутствие сессии.
      setState("anon");
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  // Пока проверяем — лёгкий скелет, чтобы не мигать формой/гейтом.
  if (state === "checking") {
    return (
      <div
        aria-busy="true"
        aria-live="polite"
        style={{ fontSize: 14, color: "var(--z-muted)" }}
      >
        Проверяем сессию…
      </div>
    );
  }

  // Валидная сессия — открываем форму публикации.
  if (state === "authed") {
    return <>{children}</>;
  }

  // Нет сессии — предлагаем регистрацию или вход (Requirement 8.7).
  const target = next ?? pathname ?? undefined;
  return (
    <div className="zen-panel" role="region" aria-label="Требуется вход в сообщество">
      <div className="zen-panel-title">{title}</div>
      <p className="zen-panel-sub">{description}</p>
      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        <Link
          href={withNext(COMMUNITY_REGISTER_PATH, target)}
          className="zen-btn zen-btn--block"
        >
          Зарегистрироваться
        </Link>
        <Link
          href={withNext(COMMUNITY_LOGIN_PATH, target)}
          className="zen-btn zen-btn--ghost zen-btn--block"
        >
          Войти
        </Link>
      </div>
    </div>
  );
}
