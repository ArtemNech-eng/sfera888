"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  next?: string;
  registered?: boolean;
}

/**
 * Posts to /api/cabinet/auth/login (proxy → master-pwa api-server).
 * On success the api-server sets connect.sid via the proxy Set-Cookie chain,
 * so the subsequent router.replace("/cabinet") lands on an authenticated SSR.
 */
export function LoginForm({ next, registered }: Props) {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!login.trim() || !password) {
      setError("Введите логин и пароль");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cabinet/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: login.trim(), password }),
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          (data as { error?: string; message?: string }).error ??
          (data as { message?: string }).message ??
          "Неверный логин или пароль",
        );
        return;
      }
      const target = next?.startsWith("/cabinet") ? next : "/cabinet";
      router.replace(target);
      router.refresh();
    } catch {
      setError("Нет связи с сервером. Проверьте интернет.");
    } finally {
      setLoading(false);
    }
  }

  const inputBase =
    "w-full h-12 rounded-2xl border border-white/20 bg-white/10 px-4 text-white placeholder:text-white/40 focus:border-white/50 focus:bg-white/15 focus:outline-none transition text-base backdrop-blur-sm";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {registered && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/20 px-4 py-3 text-sm font-medium text-emerald-200 backdrop-blur-sm">
          ✅ Аккаунт создан — войдите по номеру телефона
        </div>
      )}

      {/* Phone / login */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-white/80">
          Номер телефона или логин
        </label>
        <div className="relative">
          <PhoneIcon />
          <input
            type="text"
            autoComplete="username"
            value={login}
            onChange={(e) => { setLogin(e.target.value); setError(null); }}
            placeholder="+7 или логин"
            className={`${inputBase} pl-11`}
          />
        </div>
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-white/80">
          Пароль
        </label>
        <div className="relative">
          <LockIcon />
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            placeholder="••••••••"
            className={`${inputBase} pl-11 pr-20`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-white/60 hover:text-white transition"
          >
            {showPassword ? "Скрыть" : "Показать"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-400/30 bg-red-500/20 px-4 py-3 text-sm text-red-200 backdrop-blur-sm">
          <span className="mt-0.5 flex-shrink-0">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="relative w-full overflow-hidden rounded-2xl py-3.5 text-base font-bold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-60"
        style={{
          background: "linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)",
          boxShadow: "0 4px 20px rgba(13,148,136,0.4)",
        }}
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            Входим…
          </span>
        ) : (
          "Войти в кабинет"
        )}
      </button>

      <p className="text-center text-xs text-white/40">
        Забыли пароль? Напишите менеджеру в Max-боте.
      </p>
    </form>
  );
}

function PhoneIcon() {
  return (
    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.27 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.18 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16z"/>
      </svg>
    </span>
  );
}

function LockIcon() {
  return (
    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    </span>
  );
}
