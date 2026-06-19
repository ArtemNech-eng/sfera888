import Link from "next/link";
import type { City, Master, Service } from "../../lib/types";
import { LeadForm } from "../LeadForm";

interface CaseLeadBlockProps {
  fallbackCity: City | null;
  fallbackService: Service | null;
  sourcePageUrl: string;
  master: Master;
  masterName: string;
  serviceName: string | null;
  cityName: string | null;
  areaNum: number | null;
}

/**
 * Final lead-form block (plan §22, Requirement 10).
 *
 * Replaces the old sticky aside form. Now lives at the bottom of the page,
 * full-width, gets the user when they're already convinced. Keeps the
 * author-priority routing (`attachedMasterId={master.id}`) so the case author
 * still gets the lead first per plan §11.7.
 *
 * Anchor `#lead-form` is the scroll target for `<CasePrimaryCTA>` and the
 * mobile sticky CTA.
 */
export function CaseLeadBlock({
  fallbackCity,
  fallbackService,
  sourcePageUrl,
  master,
  masterName,
  serviceName,
  cityName,
  areaNum,
}: CaseLeadBlockProps) {
  return (
    <section
      id="lead-form"
      className="scroll-mt-20 bg-[var(--color-cream-deep)]"
    >
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
          {/* Left column: pitch */}
          <div>
            <p className="font-eyebrow">Заявка автору</p>
            <h2 className="font-editorial mt-3 text-3xl text-[var(--color-text)] sm:text-4xl">
              Хочу такой же.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--color-muted)]">
              Уйдёт автору работы первой. Если не возьмёт за 30 минут —
              передадим похожим мастерам в вашем городе.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-[var(--color-text)]">
              {serviceName ? (
                <li className="flex items-center gap-2">
                  <Check />
                  <span>Услуга: <span className="font-medium">{serviceName}</span></span>
                </li>
              ) : null}
              {cityName ? (
                <li className="flex items-center gap-2">
                  <Check />
                  <span>Город: <span className="font-medium">{cityName}</span></span>
                </li>
              ) : null}
              {areaNum != null ? (
                <li className="flex items-center gap-2">
                  <Check />
                  <span>Площадь референса: <span className="font-medium">{areaNum} м²</span></span>
                </li>
              ) : null}
              <li className="flex items-center gap-2">
                <Check />
                <span>Без авансов, оплата по этапам, договор</span>
              </li>
            </ul>
          </div>

          {/* Right column: form */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-cozy sm:p-7">
            {fallbackCity && fallbackService ? (
              <LeadForm
                citySlug={fallbackCity.slug}
                serviceSlug={fallbackService.slug}
                sourcePageUrl={sourcePageUrl}
                attachedMasterId={master.id}
                attachedMasterTitle={masterName}
              />
            ) : (
              <p className="text-sm text-[var(--color-muted)]">
                Заявка через эту страницу временно недоступна. Перейдите{" "}
                <Link
                  href={master.slug ? `/master/${master.slug}` : "/mastera"}
                  className="text-[var(--color-text)] underline underline-offset-2 hover:text-[var(--color-primary)]"
                >
                  на страницу мастера
                </Link>
                .
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Check() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0 text-[var(--color-primary)]"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
