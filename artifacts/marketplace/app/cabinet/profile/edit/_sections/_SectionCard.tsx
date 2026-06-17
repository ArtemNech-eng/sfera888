import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}

/**
 * Shared card wrapper for editor sections — header (title + description),
 * optional action slot (Save button) and content area below.
 */
export function SectionCard({ title, description, action, children }: Props) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-background)] px-5 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-[var(--color-text)] sm:text-base">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">{description}</p>
          ) : null}
        </div>
        {action ? <div className="flex-shrink-0">{action}</div> : null}
      </header>
      <div className="space-y-4 px-5 py-4 sm:px-6 sm:py-5">{children}</div>
    </section>
  );
}
