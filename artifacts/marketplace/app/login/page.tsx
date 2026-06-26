import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentMaster } from "@/lib/cabinetAuth";
import { LoginForm } from "./_LoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Вход в кабинет мастера",
  description: "Личный кабинет мастера сервиса Честные мастера.",
  robots: { index: false, follow: false },
};

interface SearchParams {
  next?: string;
  registered?: string;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  // If already authenticated, send straight to cabinet (or the intended target).
  const master = await getCurrentMaster();
  if (master && master.status !== "suspended") {
    const target = params.next && params.next.startsWith("/cabinet") ? params.next : "/cabinet";
    redirect(target);
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--color-background,#f8fafc)] px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-cta)] text-[var(--color-on-cta)]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Кабинет мастера</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Вход для мастеров. Заказы, баланс, чат с диспетчером.
          </p>
        </div>

        <LoginForm next={params.next} registered={params.registered === "1"} />

        <p className="text-center text-xs text-[var(--color-muted)]">
          Нет аккаунта? Свяжитесь с менеджером —{" "}
          <a href="https://sfera-master.ru/masteram" className="font-medium text-[var(--color-primary)] hover:underline">
            подать заявку на работу
          </a>
        </p>
      </div>
    </div>
  );
}
