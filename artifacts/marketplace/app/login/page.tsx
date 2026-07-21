import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentMaster } from "@/lib/cabinetAuth";
import { LoginForm } from "./_LoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Вход — Кабинет мастера",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; registered?: string }>;
}) {
  const params = await searchParams;
  const master = await getCurrentMaster();
  if (master && master.status !== "suspended") {
    const target = params.next?.startsWith("/cabinet") ? params.next : "/cabinet";
    redirect(target);
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      {/* Gradient background */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(160deg, #0d9488 0%, #0f766e 30%, #1e1b4b 100%)",
        }}
      />
      {/* Subtle pattern */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(white 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      {/* Glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: "rgba(20,184,166,0.35)" }}
      />

      <div className="w-full max-w-sm space-y-6">
        {/* Brand header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl shadow-xl"
            style={{
              background: "linear-gradient(135deg, #14b8a6 0%, #0d9488 50%, #0f766e 100%)",
              boxShadow: "0 8px 32px rgba(13,148,136,0.5)",
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
              <path d="M16 3H8L6 7h12l-2-4z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              SFERA Мастер
            </h1>
            <p className="mt-1 text-sm text-white/70">
              Заказы · Баланс · Чат с диспетчером
            </p>
          </div>
        </div>

        {/* Form card */}
        <LoginForm next={params.next} registered={params.registered === "1"} />

        {/* Footer */}
        <p className="text-center text-xs text-white/50">
          Нет аккаунта?{" "}
          <a
            href="https://sfera-master.ru/masteram"
            className="font-semibold text-white/80 underline-offset-2 hover:underline"
          >
            Подать заявку на работу
          </a>
        </p>
      </div>
    </div>
  );
}
