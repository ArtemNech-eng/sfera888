import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Заявка принята",
  robots: { index: false, follow: false },
};

export default function ThankYouPage() {
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
      <div className="rounded-full bg-[var(--color-primary)]/10 p-4 text-4xl" aria-hidden>
        ✓
      </div>
      <h1 className="mt-6 text-3xl font-semibold text-[var(--color-text)] sm:text-4xl">
        Заявка принята
      </h1>
      <p className="mt-3 text-base text-[var(--color-muted)] sm:text-lg">
        Мы скоро свяжемся с вами. Если нужно срочно — напишите комментарий в новой заявке.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center rounded-xl bg-[var(--color-cta)] px-6 py-3 text-base font-medium text-[var(--color-on-cta)] transition hover:bg-[var(--color-cta-hover)]"
      >
        На главную
      </Link>
    </section>
  );
}
