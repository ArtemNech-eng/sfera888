"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Presentational Owner_Mode bar (real-price 5.4). A floating pill pinned to the
 * bottom-center of the viewport, above page content, shown only when a client
 * owner-detector (`MasterOwnerBar` / `CaseOwnerBar`) has confirmed the visitor
 * owns the page. It deliberately floats (fixed, bottom) rather than pushing
 * layout, so it never shifts the public content or fights the sticky header.
 *
 * Hidden in print. Anonymous visitors never render this (the detectors return
 * null), so there is zero visual or SEO impact for the public.
 */
export interface OwnerAction {
  href: string;
  label: string;
  primary?: boolean;
}

export function OwnerBar({
  label,
  status,
  actions,
}: {
  label: string;
  status?: ReactNode;
  actions: OwnerAction[];
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 print:hidden">
      <div className="pointer-events-auto flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-3 py-2 shadow-cozy-md backdrop-blur">
        <span className="inline-flex items-center gap-1.5 px-1 text-sm font-medium text-[var(--color-text)]">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-[var(--color-primary)]" />
          {label}
        </span>
        {status ? (
          <span className="rounded-full bg-[var(--color-cream-deep)] px-2 py-0.5 text-xs font-medium text-[var(--color-muted)]">
            {status}
          </span>
        ) : null}
        {actions.map((a) => (
          <Link
            key={`${a.href}::${a.label}`}
            href={a.href}
            className={
              a.primary
                ? "inline-flex h-9 items-center rounded-full bg-[var(--color-cta)] px-4 text-sm font-semibold text-[var(--color-on-cta)] transition hover:bg-[var(--color-cta-hover)]"
                : "inline-flex h-9 items-center rounded-full border border-[var(--color-border)] px-4 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-primary)]"
            }
          >
            {a.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
