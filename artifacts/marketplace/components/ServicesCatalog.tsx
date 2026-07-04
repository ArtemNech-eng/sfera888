"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Service } from "../lib/types";

interface Props {
  services: Service[];
  /** Город по умолчанию для ссылок service→city. */
  fallbackCity: string | null;
}

const POPULAR_COUNT = 12;

function formatNumber(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}
function firstLetter(name: string): string {
  const ch = name.trim().charAt(0).toUpperCase();
  return /[A-ZА-ЯЁ0-9]/.test(ch) ? ch : "#";
}
function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").trim();
}

/**
 * Каталог услуг, масштабируемый на сотни позиций (Zen-стиль):
 * мгновенный поиск, блок «Популярное», группировка по алфавиту с якорным
 * указателем А–Я и компактные колонки. Клиентский компонент — фильтрация без
 * перезагрузки.
 */
export function ServicesCatalog({ services, fallbackCity }: Props) {
  const [query, setQuery] = useState("");
  const q = norm(query);

  const hrefFor = (s: Service) => (fallbackCity ? `/${s.slug}/${fallbackCity}` : "/uslugi");

  const filtered = useMemo(
    () => (q.length === 0 ? services : services.filter((s) => norm(s.name).includes(q))),
    [services, q],
  );

  const popular = useMemo(() => (q.length === 0 ? services.slice(0, POPULAR_COUNT) : []), [services, q]);

  const groups = useMemo(() => {
    const map = new Map<string, Service[]>();
    for (const s of filtered) {
      const l = firstLetter(s.name);
      const arr = map.get(l);
      if (arr) arr.push(s);
      else map.set(l, [s]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "ru"));
  }, [filtered]);

  const letters = groups.map(([l]) => l);

  return (
    <div className="zen">
      {/* Поиск */}
      <div className="zen-search" style={{ maxWidth: 520 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти услугу: плитка, электрик, натяжной потолок…"
          className="zen-input"
          aria-label="Поиск услуги"
        />
      </div>

      {/* Популярное (только без запроса) */}
      {popular.length > 0 ? (
        <>
          <h2 className="zen-section-title" style={{ marginTop: 22 }}>Популярное</h2>
          <div className="zen-popular">
            {popular.map((s) => (
              <Link key={s.id} href={hrefFor(s)} className="zen-pill">{s.name}</Link>
            ))}
          </div>
        </>
      ) : null}

      {/* Указатель А–Я (только без запроса) */}
      {q.length === 0 && letters.length > 1 ? (
        <nav className="zen-azbar" aria-label="Указатель по алфавиту">
          {letters.map((l) => (
            <a key={l} href={`#svc-${encodeURIComponent(l)}`}>{l}</a>
          ))}
        </nav>
      ) : null}

      {/* Результат / группы */}
      {q.length > 0 ? (
        <>
          <p className="zen-count" style={{ marginTop: 16 }}>
            Найдено: {filtered.length}
          </p>
          {filtered.length > 0 ? (
            <div className="zen-svc-grid" style={{ marginTop: 8 }}>
              {filtered.map((s) => (
                <ServiceItem key={s.id} s={s} href={hrefFor(s)} />
              ))}
            </div>
          ) : (
            <div className="zen-empty" style={{ marginTop: 12 }}>По запросу ничего не нашлось. Попробуйте другое слово.</div>
          )}
        </>
      ) : (
        <div style={{ marginTop: 8 }}>
          {groups.map(([letter, list]) => (
            <section key={letter}>
              <h3 id={`svc-${encodeURIComponent(letter)}`} className="zen-letter">{letter}</h3>
              <div className="zen-svc-grid">
                {list.map((s) => (
                  <ServiceItem key={s.id} s={s} href={hrefFor(s)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceItem({ s, href }: { s: Service; href: string }) {
  return (
    <Link href={href} className="zen-svc">
      <span className="zen-svc-name">{s.name}</span>
      {s.priceFrom != null && s.priceFrom > 0 ? (
        <span className="zen-svc-price">от {formatNumber(s.priceFrom)} ₽</span>
      ) : null}
    </Link>
  );
}
