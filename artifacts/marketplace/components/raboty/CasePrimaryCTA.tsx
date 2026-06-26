"use client";

import { ShareButton } from "./ShareButton";
import { SaveButton } from "./SaveButton";

interface CasePrimaryCTAProps {
  slug: string;
  shareUrl: string;
  shareTitle: string;
  initialSaved: boolean;
  saveCount: number;
}

/**
 * Primary call-to-action block (plan §22, Req 4 + 9.1).
 *
 * Renders directly under the chips. Big "Хочу такой же" button anchored to
 * the lead form at the bottom of the page (`#lead-form`); save + share
 * affordances next to it.
 *
 * `<a href="#lead-form">` so anchor scroll works even with JS off; we
 * intercept the click for smooth-scroll behavior when JS is on.
 *
 * Iter 4: SaveButton replaces the placeholder, ShareButton stays as-is.
 */
export function CasePrimaryCTA({
  slug,
  shareUrl,
  shareTitle,
  initialSaved,
  saveCount,
}: CasePrimaryCTAProps) {
  function onCTAClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    const target = document.getElementById("lead-form");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      try {
        history.replaceState(null, "", "#lead-form");
      } catch {
        // Some sandboxes restrict replaceState — ignore.
      }
    }
  }

  return (
    <section
      className="bg-[var(--color-background)]"
      data-cta-anchor
    >
      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-8">
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <a
            href="#lead-form"
            onClick={onCTAClick}
            className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-cta)] px-6 text-base font-bold text-[var(--color-on-cta)] shadow-cozy transition hover:bg-[var(--color-cta-hover)] hover:shadow-cozy-md sm:h-16 sm:text-lg"
          >
            Хочу такой же
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </a>

          <div className="flex items-center gap-3 sm:gap-2">
            <SaveButton
              slug={slug}
              initialSaved={initialSaved}
              initialCount={saveCount}
            />
            <ShareButton url={shareUrl} title={shareTitle} />
          </div>
        </div>
        <p className="mt-3 text-sm text-[var(--color-muted)]">
          Подберём мастеров, которые сделают похожий ремонт в вашем городе.
          Без авансов, оплата по этапам, договор.
        </p>
      </div>
    </section>
  );
}
