"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  validateCommunityAuthForm,
  COMMUNITY_AUTH_FIELD_MESSAGES,
  type CommunityAuthFormErrors,
} from "../../lib/communityAuthForm";
import {
  friendlyLoginRejection,
  resolveSuccessTarget,
  type CommunityAuthApiBody,
} from "../../lib/communityAuthFlow";

/**
 * `LoginForm` — форма входа Community_Account в Web_Facade
 * (spec: community-phone-registration, Requirement 8.2).
 *
 * Поля: телефон (10–15 цифр) и пароль (8–72 символа). Капчи НЕТ — вход не
 * защищён капчей (Requirement 8.2, в отличие от регистрации). Клиентская
 * валидация выполняется ДО обращения к API (Requirement 8.3): при невалидных
 * полях форма не обращается к Community_Auth_Service.
 *
 * Отправка идёт НАПРЯМУЮ на api-server `POST /api/community/auth/login`
 * с `credentials: "include"`, чтобы сервер выставил сессионную cookie
 * `connect.sid` в браузере (Requirement 8.5) — сессия устанавливается тем же
 * механизмом `express-session`, что и у мастеров/операторов.
 *
 * При отказе API (Requirement 8.6) форма показывает причину, СОХРАНЯЕТ поле
 * телефона и ОЧИЩАЕТ поле пароля. Для 401 показывается единое сообщение,
 * не раскрывающее, какой из факторов не совпал (Requirement 3.7).
 *
 * При успехе (200) сервер уже установил Community_Session — устанавливаем
 * контекст аутентифицированного аккаунта через переход на целевую страницу и
 * `router.refresh()` (Requirement 8.5).
 */

interface LoginFormProps {
  /**
   * База api-server для клиентских (браузерных) запросов, например
   * `https://sfera-master.ru/api`. Вход шлётся на
   * `${apiBaseUrl}/community/auth/login` напрямую, чтобы `connect.sid`
   * выставился на домене api-server.
   */
  apiBaseUrl: string;
  /** Куда вести после успешного входа. По умолчанию — хаб «Соседи». */
  next?: string;
}

export function LoginForm({ apiBaseUrl, next }: LoginFormProps) {
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<CommunityAuthFormErrors>({});
  const [topError, setTopError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    setTopError(null);
    setFieldErrors({});

    // ── 1. Клиентская валидация полей ДО запроса (Requirement 8.3) ───────────
    const errors = validateCommunityAuthForm({ phone, password });
    if (errors.phone || errors.password) {
      setFieldErrors(errors);
      return; // API не вызываем (Requirement 8.3)
    }

    // ── 2. Прямой POST на api-server с credentials: "include" (Requirement 8.5)
    setSubmitting(true);
    const url = `${apiBaseUrl.replace(/\/+$/, "")}/community/auth/login`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ phone, password }),
        // Отправляем/принимаем cookie сессии (connect.sid) от api-server.
        credentials: "include",
      });
    } catch {
      setTopError("Сеть недоступна. Проверьте подключение и попробуйте ещё раз.");
      setSubmitting(false);
      setPassword(""); // одноразовый секрет не держим в состоянии
      return;
    }

    // ── 3. Успех: сервер установил Community_Session (Requirement 8.5) ───────
    if (res.status === 200) {
      const target = resolveSuccessTarget(next);
      router.push(target);
      router.refresh();
      return;
    }

    // ── 4. Отказ: показать причину, сохранить телефон, очистить пароль (R8.6)
    let body: CommunityAuthApiBody | null = null;
    try {
      body = (await res.json()) as CommunityAuthApiBody;
    } catch {
      body = null;
    }
    setTopError(friendlyLoginRejection(res.status, body));
    setPassword(""); // пароль очищаем; телефон сохраняем как есть (Requirement 8.6)
    setSubmitting(false);
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 16 }} noValidate>
      {/* ── Телефон (10–15 цифр) ─────────────────────────────────── */}
      <div>
        <label className="zen-label" htmlFor="login-phone">
          Телефон *
        </label>
        <input
          id="login-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+7 900 000-00-00"
          className="zen-input"
          aria-invalid={fieldErrors.phone ? true : undefined}
        />
        {fieldErrors.phone ? (
          <p role="alert" style={{ marginTop: 6, fontSize: 12, color: "var(--z-danger, #c0392b)" }}>
            {COMMUNITY_AUTH_FIELD_MESSAGES[fieldErrors.phone]}
          </p>
        ) : (
          <p style={{ marginTop: 6, fontSize: 12, color: "var(--z-muted)" }}>
            Телефон, указанный при регистрации. От 10 до 15 цифр.
          </p>
        )}
      </div>

      {/* ── Пароль (8–72 символа) ────────────────────────────────── */}
      <div>
        <label className="zen-label" htmlFor="login-password">
          Пароль *
        </label>
        <div style={{ position: "relative" }}>
          <input
            id="login-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="ваш пароль"
            className="zen-input"
            style={{ paddingRight: 84 }}
            aria-invalid={fieldErrors.password ? true : undefined}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              color: "var(--z-muted)",
            }}
          >
            {showPassword ? "Скрыть" : "Показать"}
          </button>
        </div>
        {fieldErrors.password ? (
          <p role="alert" style={{ marginTop: 6, fontSize: 12, color: "var(--z-danger, #c0392b)" }}>
            {COMMUNITY_AUTH_FIELD_MESSAGES[fieldErrors.password]}
          </p>
        ) : (
          <p style={{ marginTop: 6, fontSize: 12, color: "var(--z-muted)" }}>
            От 8 до 72 символов.
          </p>
        )}
      </div>

      {/* ── Общая ошибка (отказ API) ─────────────────────────────── */}
      {topError ? (
        <div role="alert" className="zen-alert zen-alert--err">
          {topError}
        </div>
      ) : null}

      <button type="submit" disabled={submitting} className="zen-btn zen-btn--block">
        {submitting ? "Входим…" : "Войти"}
      </button>

      <p style={{ margin: 0, fontSize: 13, color: "var(--z-muted)", textAlign: "center" }}>
        Ещё нет аккаунта?{" "}
        <Link href="/soobshchestvo/registraciya" style={{ fontWeight: 600, textDecoration: "underline" }}>
          Зарегистрироваться
        </Link>
      </p>
    </form>
  );
}
