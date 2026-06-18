"use client";

import { ShareButton } from "./ShareButton";

interface CasePrimaryCTAProps {
  shareUrl: string;
  shareTitle: string;
  // Iter 4: реальная save-кнопка. Пока — визуальный placeholder.
  initialSaved?: boolean;
  saveCount?: number;
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
 */
export function CasePrimaryCTA({ shareUrl, shareTitle }: CasePrimaryCTAProps) {
  function onCTAClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    const target = document.getElementById("lead-form");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      // Update history so back-button restores scroll position naturally.
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
            className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-6 text-base font-bold text-white shadow-cozy transition hover:bg-[var(--color-primary-hover)] hover:shadow-cozy-md sm:h-16 sm:text-lg"
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
            {/* Save — placeholder в Iter 1, рабочая кнопка в Iter 4 */}
            <button
              type="button"
              disabled
              aria-label="Сохранить (скоро)"
              title="Скоро"
              className="inline-flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-faint)] opacity-60"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </button>

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
