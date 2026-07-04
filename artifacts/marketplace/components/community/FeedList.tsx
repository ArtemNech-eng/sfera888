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
 * Лента сообщества (City_Feed / Local_Feed) в portal-стиле: строки-разделители,
 * заголовок + превью, ссылка в обсуждение `/t/[id]`. Пустая лента — индикатор,
 * не ошибка (Requirements 1.3, 3.6). PRO-контент здесь не отображается (5.3, 8.3).
 */
export function FeedList({ items, emptyState, emptyText, showCategory }: Props) {
  if (emptyState || items.length === 0) {
    return <div className="portal-empty">{emptyText}</div>;
  }

  return (
    <div className="portal-list">
      {items.map((item) => (
        <Link key={item.id} href={`/t/${item.id}`} className="portal-row">
          <div className="portal-row-meta">
            {showCategory && item.category ? (
              <span className="portal-chip">{localFeedCategoryLabel(item.category) ?? item.category}</span>
            ) : null}
            <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
          </div>
          <div className="portal-row-title">{item.title}</div>
          {item.body ? <p className="portal-row-excerpt">{clip(item.body, 200)}</p> : null}
          <span className="portal-row-more">Открыть обсуждение →</span>
        </Link>
      ))}
    </div>
  );
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(d);
  } catch {
    return "";
  }
}
