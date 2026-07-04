import Link from "next/link";
import type { CommunityFeedItem } from "../../lib/types";
import { localFeedCategoryLabel } from "../../lib/types";

interface Props {
  items: CommunityFeedItem[];
  emptyState: boolean;
  /** Текст пустого состояния (Requirements 1.3, 3.6). */
  emptyText: string;
  /** Показывать ли бейдж категории (актуально для Local_Feed). */
  showCategory?: boolean;
}

/**
 * Рендер ленты сообщества (City_Feed / Local_Feed) — чистый портал жителей
 * (Requirement 5.1). Пустая лента показывает индикатор пустого состояния, а не
 * ошибку (Requirements 1.3, 3.6). Никакого PRO-контента здесь не отображается
 * (Requirement 5.3, 8.3) — компонент рендерит только переданные темы Sosedi_Zone.
 */
export function FeedList({ items, emptyState, emptyText, showCategory }: Props) {
  if (emptyState || items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
        <p className="text-base text-[var(--color-muted)]">{emptyText}</p>
      </div>
    );
  }

  return (
    <ul className="grid gap-4">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/t/${item.id}`}
            className="block rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-cozy transition hover:border-[var(--color-primary)] hover:shadow-cozy-md sm:p-6"
          >
            <div className="flex flex-wrap items-center gap-2">
              {showCategory && item.category ? (
                <span className="rounded-full bg-[var(--color-cream-deep)] px-3 py-1 text-xs font-medium text-[var(--color-text)]">
                  {localFeedCategoryLabel(item.category) ?? item.category}
                </span>
              ) : null}
              <time
                dateTime={item.createdAt}
                className="text-xs text-[var(--color-faint)]"
              >
                {formatDate(item.createdAt)}
              </time>
            </div>
            <h3 className="font-display mt-3 text-xl text-[var(--color-text)]">
              {item.title}
            </h3>
            {item.body ? (
              <p className="mt-2 line-clamp-4 text-base leading-relaxed text-[var(--color-muted)]">
                {item.body}
              </p>
            ) : null}
            <span className="mt-3 inline-block text-sm font-medium text-[var(--color-primary)]">
              Открыть обсуждение →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Дата темы «дд месяц гггг» на русском; при сбое парсинга — пустая строка. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return "";
  }
}
