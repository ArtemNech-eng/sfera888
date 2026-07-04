import Link from "next/link";
import type { CommunityCityRef } from "../../lib/communityApi";

interface Props {
  /** Активный раздел для подсветки. */
  active: "sosedi" | "pro";
  /** Города для навигации (необязательно). */
  cities?: CommunityCityRef[];
  /** Активный slug города (на странице города). */
  activeCitySlug?: string;
}

/**
 * Левый навигационный рэйл раздела сообщества (Zen-стиль, как в фид-порталах).
 * Разделы «Соседи» / «Хочу также ПРО» + быстрый список городов. На узких
 * экранах скрыт (см. .zen-rail), навигация остаётся в общей шапке сайта.
 */
export function CommunityRail({ active, cities = [], activeCitySlug }: Props) {
  return (
    <aside className="zen-rail">
      <nav>
        <Link href="/soobshchestvo" className={`zen-rail-item${active === "sosedi" ? " is-active" : ""}`}>
          <span aria-hidden>🏠</span> Соседи
        </Link>
        <Link href="/pro" className={`zen-rail-item${active === "pro" ? " is-active" : ""}`}>
          <span aria-hidden>🛠</span> Хочу также ПРО
        </Link>
      </nav>

      {cities.length > 0 ? (
        <>
          <div className="zen-rail-title">Города</div>
          <nav>
            {cities.map((c) => (
              <Link
                key={c.slug}
                href={`/goroda/${c.slug}`}
                className={`zen-rail-item${activeCitySlug === c.slug ? " is-active" : ""}`}
              >
                <span aria-hidden>📍</span> {c.name}
              </Link>
            ))}
          </nav>
        </>
      ) : null}
    </aside>
  );
}
