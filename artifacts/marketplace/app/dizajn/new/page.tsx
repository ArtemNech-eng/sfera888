import type { Metadata } from "next";
import Link from "next/link";
import { publicUrl } from "../../../lib/env";
import { DesignerStubForm } from "./DesignerStubForm";

// Static — the entire form is local-only (no upload, no API call).
export const dynamic = "force-static";

export function generateMetadata(): Metadata {
  return {
    // `absolute` so the layout's "%s · Честные мастера" template doesn't
    // append a duplicate brand name.
    title: { absolute: "Создать дизайн комнаты — Честные мастера" },
    description:
      "Загрузите фото комнаты и выберите стиль для будущего AI-дизайна.",
    // Generation isn't wired up yet — keep this page out of the index until
    // the AI pipeline is live.
    robots: { index: false, follow: false },
    alternates: { canonical: `${publicUrl()}/dizajn/new` },
  };
}

export default function DesignerNewPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-semibold text-[var(--color-text)] sm:text-4xl">
        Создать дизайн комнаты
      </h1>
      <p className="mt-3 text-base text-[var(--color-muted)] sm:text-lg">
        Скоро здесь можно будет получить 3 бесплатных варианта дизайна по фото.
      </p>

      <div className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm sm:p-8">
        <DesignerStubForm />
      </div>

      <div className="mt-10 rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <p className="text-base text-[var(--color-text)]">
          Пока AI-дизайнер готовится, вы можете оставить заявку мастеру.
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
