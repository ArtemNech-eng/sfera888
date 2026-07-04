import Link from "next/link";
import type { CommunityFeedItem } from "../../lib/types";
import { localFeedCategoryLabel } from "../../lib/types";

interface Props {
  items: CommunityFeedItem[];
  emptyState: boolean;
  emptyText: string;
  showCategory?: boolean;
}

/**
 * Лента сообщества (City_Feed / Local_Feed) в Zen-стиле: мягкие карточки-посты,
 * заголовок + превью, ссылка в обсуждение `/t/[id]`. Пустая лента — индикатор
 * (Requirements 1.3, 3.6). PRO-контент здесь не отображается (5.3, 8.3).
 */
export function FeedList({ items, emptyState, emptyText, showCategory }: Props) {
  if (emptyState || items.length === 0) {
    return <div className="zen-empty">{emptyText}</div>;
  }
  return (
    <div className="zen-feed">
      {items.map((item) => (
        <Link key={item.id} href={`/t/${item.id}`} className="zen-post">
          <div className="zen-post-meta">
            {showCategory && item.category ? (
              <span className="zen-chip">{localFeedCategoryLabel(item.category) ?? item.category}</span>
            ) : null}
            <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
          </div>
          <div className="zen-post-title">{item.title}</div>
          {item.body ? <p className="zen-post-excerpt">{clip(item.body, 220)}</p> : null}
          <div className="zen-post-foot">Открыть обсуждение →</div>
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
