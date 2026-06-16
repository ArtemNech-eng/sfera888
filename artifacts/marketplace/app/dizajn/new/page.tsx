import type { Metadata } from "next";
import Link from "next/link";
import { publicUrl } from "../../../lib/env";
import { DesignWaitlistForm } from "./DesignWaitlistForm";

// Static — selects are local state, the actual lead POST goes through
// /api/leads via <LeadForm/>. No data-fetch at SSR time.
export const dynamic = "force-static";

export function generateMetadata(): Metadata {
  return {
    // `absolute` so the layout's "%s · Честные мастера" template doesn't
    // append a duplicate brand name.
    title: { absolute: "Запись в ранний доступ AI-дизайнера — Честные мастера" },
    description:
      "AI-дизайнер интерьера запускается. Оставьте телефон — позвоним, когда сможете сгенерировать первый дизайн бесплатно.",
    // Keep this page out of the index until AI generation is live and the
    // page becomes a real product surface.
    robots: { index: false, follow: false },
    alternates: { canonical: `${publicUrl()}/dizajn/new` },
  };
}

const sourcePageUrl = `${publicUrl()}/dizajn/new`;

export default function DesignerWaitlistPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <span className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
        Beta · ранний доступ
      </span>
      <h1 className="mt-4 text-3xl font-semibold text-[var(--color-text)] sm:text-4xl">
        Запишитесь в ранний доступ
      </h1>
      <p className="mt-3 text-base text-[var(--color-muted)] sm:text-lg">
        AI-дизайнер интерьера запускается. Оставьте телефон — позвоним, когда
        сможете сгенерировать первый дизайн бесплатно.
      </p>

      <div className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm sm:p-8">
        <DesignWaitlistForm sourcePageUrl={sourcePageUrl} />
      </div>

      <div className="mt-10 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <p className="text-base text-[var(--color-text)]">
          Не хочется ждать? Подберём мастера прямо сейчас.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/santehnika/krasnodar"
            className="inline-flex items-center justify-center rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--color-primary-hover)]"
          >
            Оставить заявку мастеру
          </Link>
          <Link
            href="/uslugi"
            className="inline-flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-2.5 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-primary)]"
          >
            Смотреть услуги
          </Link>
        </div>
      </div>
    </section>
  );
}
