"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import Link from "next/link";
import {
  validateCommunityAuthForm,
  COMMUNITY_AUTH_FIELD_MESSAGES,
  type CommunityAuthFormErrors,
} from "../../lib/communityAuthForm";
import {
  friendlyRegisterRejection,
  resolveSuccessTarget,
  type CommunityAuthApiBody,
} from "../../lib/communityAuthFlow";

/**
 * `RegisterForm` — форма регистрации Community_Account в Web_Facade
 * (spec: community-phone-registration, Requirement 8).
 *
 * Поля: телефон (10–15 цифр), пароль (8–72 символа) и виджет Yandex
 * SmartCaptcha. Клиентская валидация выполняется ДО обращения к API
 * (Requirement 8.1, 8.3): при невалидных полях или непройденной капче форма не
 * обращается к Community_Auth_Service (Requirement 8.4).
 *
 * Отправка идёт НАПРЯМУЮ на api-server `POST /api/community/auth/register`
 * с `credentials: "include"`, чтобы сервер выставил сессионную cookie
 * `connect.sid` в браузере (Requirement 8.5) — сессия устанавливается тем же
 * механизмом `express-session`, что и у мастеров/операторов.
 *
 * При отказе API (Requirement 8.6) форма показывает причину, СОХРАНЯЕТ все
 * введённые значения, КРОМЕ поля пароля, которое очищается; одноразовый токен
 * капчи сбрасывается для повторной попытки.
 *
 * При успехе (201) сервер уже установил Community_Session — устанавливаем
 * контекст аутентифицированного аккаунта через переход на целевую страницу и
 * `router.refresh()` (Requirement 8.5).
 */

interface RegisterFormProps {
  /** Yandex SmartCaptcha client (site) key — прокидывается серверным компонентом. */
  captchaSiteKey: string;
  /**
   * База api-server для клиентских (браузерных) запросов, например
   * `https://sfera-master.ru/api`. Регистрация шлётся на
   * `${apiBaseUrl}/community/auth/register` напрямую, чтобы `connect.sid`
   * выставился на домене api-server.
   */
  apiBaseUrl: string;
  /** Куда вести после успешной регистрации. По умолчанию — хаб «Соседи». */
  next?: string;
}

export function RegisterForm({ captchaSiteKey, apiBaseUrl, next }: RegisterFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<CommunityAuthFormErrors>({});
  const [topError, setTopError] = useState<string | null>(null);

  function resetCaptcha() {
    try {
      // SmartCaptcha: reset без widgetId сбрасывает первый отрисованный виджет.
      (
        window as unknown as { smartCaptcha?: { reset?: (id?: unknown) => void } }
      ).smartCaptcha?.reset?.();
    } catch {
      /* ignore — сброс капчи не должен ломать UI */
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    setTopError(null);
    setFieldErrors({});

    // ── 1. Клиентская валидация полей ДО запроса (Requirement 8.1, 8.3) ──────
    const errors = validateCommunityAuthForm({ phone, password });
    if (errors.phone || errors.password) {
      setFieldErrors(errors);
      return; // API не вызываем
    }

    // ── 2. Капча: токен обязателен (Requirement 8.4) ─────────────────────────
    const formEl = formRef.current ?? (e.currentTarget as HTMLFormElement);
    const captchaToken = String(
      new FormData(formEl).get("smart-token") ?? "",
    ).trim();
    if (!captchaToken) {
      setTopError("Пройдите проверку «Я не робот» — обычно это пара секунд.");
      return; // API не вызываем
    }

    // ── 3. Прямой POST на api-server с credentials: "include" (Requirement 8.5)
    setSubmitting(true);
    const url = `${apiBaseUrl.replace(/\/+$/, "")}/community/auth/register`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ phone, password, captchaToken }),
        // Отправляем/принимаем cookie сессии (connect.sid) от api-server.
        credentials: "include",
      });
    } catch {
      setTopError("Сеть недоступна. Проверьте подключение и попробуйте ещё раз.");
      setSubmitting(false);
      setPassword(""); // одноразовый секрет не держим в состоянии
      resetCaptcha();
      return;
    }

    // ── 4. Успех: сервер установил Community_Session (Requirement 8.5) ───────
    if (res.status === 201 || res.status === 200) {
      const target = resolveSuccessTarget(next);
      router.push(target);
      router.refresh();
      return;
    }

    // ── 5. Отказ: показать причину, сохранить поля, очистить пароль (R8.6) ───
    let body: CommunityAuthApiBody | null = null;
    try {
      body = (await res.json()) as CommunityAuthApiBody;
    } catch {
      body = null;
    }
    setTopError(friendlyRegisterRejection(res.status, body));
    setPassword(""); // пароль очищаем; телефон сохраняем как есть
    setSubmitting(false);
    resetCaptcha(); // одноразовый токен сгорел
  }

  return (
    <>
      <Script
        src="https://smartcaptcha.yandexcloud.net/captcha.js"
        strategy="afterInteractive"
        defer
      />

      <form
        ref={formRef}
        onSubmit={onSubmit}
        style={{ display: "grid", gap: 16 }}
        noValidate
      >
        {/* ── Телефон (10–15 цифр) ─────────────────────────────────── */}
        <div>
          <label className="zen-label" htmlFor="register-phone">
            Телефон *
          </label>
          <input
            id="register-phone"
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
              Телефон будет вашим логином. От 10 до 15 цифр.
            </p>
          )}
        </div>

        {/* ── Пароль (8–72 символа) ────────────────────────────────── */}
        <div>
          <label className="zen-label" htmlFor="register-password">
            Пароль *
          </label>
          <div style={{ position: "relative" }}>
            <input
              id="register-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="от 8 до 72 символов"
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

        {/* ── Yandex SmartCaptcha ──────────────────────────────────── */}
        <div>
          <span className="zen-label">Подтверждение</span>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--z-muted)" }}>
            Капча убеждается, что вы человек — обычно проходит автоматически за пару секунд.
          </p>
          {/* captcha.js автоматически рендерит виджет в .smart-captcha и кладёт
              одноразовый токен в hidden input `smart-token` внутри формы. */}
          <div className="smart-captcha" data-sitekey={captchaSiteKey} data-hl="ru" />
        </div>

        {/* ── Общая ошибка (капча / отказ API) ─────────────────────── */}
        {topError ? (
          <div role="alert" className="zen-alert zen-alert--err">
            {topError}
          </div>
        ) : null}

        <button type="submit" disabled={submitting} className="zen-btn zen-btn--block">
          {submitting ? "Регистрируем…" : "Зарегистрироваться"}
        </button>

        <p style={{ margin: 0, fontSize: 13, color: "var(--z-muted)", textAlign: "center" }}>
          Уже есть аккаунт?{" "}
          <Link href="/soobshchestvo/vhod" style={{ fontWeight: 600, textDecoration: "underline" }}>
            Войти
          </Link>
        </p>
      </form>
    </>
  );
}
