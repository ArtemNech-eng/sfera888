"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  next?: string;
  registered?: boolean;
}

const inputCls =
  "w-full h-12 px-4 rounded-xl border border-[var(--color-border)] bg-white text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] text-base";

/**
 * Cabinet login form.
 *
 * Posts to `/api/cabinet/auth/login` (proxy → master-pwa). On success the
 * api-server sets the `connect.sid` cookie via the proxy response, so the
 * router push to `/cabinet` immediately resolves with an authenticated SSR.
 *
 * Kept minimal for V1.5 Week 1: phone-or-login + password. Registration and
 * "forgot password" flows live on the master-pwa today and will be ported in
 * Week 2 of the migration.
 */
export function LoginForm({ next, registered }: Props) {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!login || !password) {
      setError("Введите логин и пароль");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cabinet/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? data.message ?? "Не удалось войти");
        return;
      }
      const target = next && next.startsWith("/cabinet") ? next : "/cabinet";
      router.replace(target);
      router.refresh();
    } catch (err) {
      setError("Сервер недоступен. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
      {registered ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Аккаунт создан. Войдите, используя номер телефона как логин.
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="cabinet-login" className="block text-sm font-medium text-[var(--color-text)]">
          Номер телефона или логин
        </label>
        <input
          id="cabinet-login"
          name="login"
          type="text"
          autoComplete="username"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="+7 или логин"
          className={inputCls}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="cabinet-password" className="block text-sm font-medium text-[var(--color-text)]">
          Пароль
        </label>
        <div className="relative">
          <input
            id="cabinet-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${inputCls} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 px-1 text-sm text-[var(--color-muted)]"
            aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
          >
            {showPassword ? "Скрыть" : "Показать"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[var(--color-cta)] text-base font-semibold text-[var(--color-on-cta)] transition-opacity disabled:opacity-50"
      >
        {loading ? (
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : (
          "Войти"
        )}
      </button>

      <p className="text-center text-xs text-[var(--color-muted)]">
        Забыли пароль? Напишите менеджеру в Max-боте.
      </p>
    </form>
  );
}
