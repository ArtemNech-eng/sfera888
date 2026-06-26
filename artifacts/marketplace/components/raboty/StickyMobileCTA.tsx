"use client";

import { useEffect, useState } from "react";

/**
 * Sticky CTA that follows the user past the primary button (plan §22, Req 4.4).
 *
 * Behavior:
 *   • Hidden by default — server renders the markup but with opacity-0.
 *   • Becomes visible when the primary CTA (`[data-cta-anchor]`) has scrolled
 *     out of view AND the lead form (`#lead-form`) is not yet in view.
 *   • Hidden when an input/textarea inside `#lead-form` is focused (so it
 *     doesn't cover the soft keyboard / scrolled form on mobile).
 *
 * Implementation: two IntersectionObservers + one focus listener. State only
 * changes `data-visible` to drive Tailwind classes — keeps animation budget
 * minimal.
 */
export function StickyMobileCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const cta = document.querySelector<HTMLElement>("[data-cta-anchor]");
    const lead = document.getElementById("lead-form");
    if (!cta || !lead) return;

    let ctaInView = true; // initial guess — first paint is at top of page
    let leadInView = false;
    let formFocused = false;

    function update() {
      setVisible(!ctaInView && !leadInView && !formFocused);
    }

    const ctaObs = new IntersectionObserver(
      ([entry]) => {
        ctaInView = entry?.isIntersecting ?? false;
        update();
      },
      { threshold: 0.1 },
    );
    const leadObs = new IntersectionObserver(
      ([entry]) => {
        leadInView = entry?.isIntersecting ?? false;
        update();
      },
      { threshold: 0.05 },
    );

    ctaObs.observe(cta);
    leadObs.observe(lead);

    function onFocusIn(e: FocusEvent) {
      const t = e.target;
      if (t instanceof HTMLElement && lead && lead.contains(t)) {
        formFocused = true;
        update();
      }
    }
    function onFocusOut(e: FocusEvent) {
      const t = e.target;
      if (t instanceof HTMLElement && lead && lead.contains(t)) {
        formFocused = false;
        update();
      }
    }
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);

    return () => {
      ctaObs.disconnect();
      leadObs.disconnect();
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    document.getElementById("lead-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      {/* Mobile: bottom bar */}
      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 px-4 py-3 backdrop-blur transition-all duration-200 sm:hidden ${
          visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
        }`}
      >
        <a
          href="#lead-form"
          onClick={onClick}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--color-cta)] text-base font-bold text-[var(--color-on-cta)] shadow-cozy transition hover:bg-[var(--color-cta-hover)]"
        >
          Хочу такой же
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </a>
      </div>

      {/* Desktop: top-right pill */}
      <div
        className={`pointer-events-none fixed right-6 top-20 z-30 hidden transition-all duration-200 sm:block ${
          visible ? "pointer-events-auto translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        <a
          href="#lead-form"
          onClick={onClick}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-cta)] px-5 py-3 text-sm font-bold text-[var(--color-on-cta)] shadow-cozy-md transition hover:bg-[var(--color-cta-hover)]"
        >
          Хочу такой же
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </a>
      </div>
    </>
  );
}
