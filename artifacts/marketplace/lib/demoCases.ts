/**
 * Demo / placeholder visual content used until our masters publish enough
 * real work (plan §20.4 photo policy).
 *
 * **Visual placeholders only.** Each demo card renders without a price tag
 * and without a master attribution — a "Пример" / "Стилевые референсы" badge
 * makes it explicit that these are stylistic references, not real cases on
 * the platform. As soon as we have ≥6 real published cases, demos disappear
 * from the rail.
 *
 * Photos are from Unsplash (CC0 license, free for commercial use without
 * attribution). We still add a discreet credit line in the Footer for
 * transparency. URLs include the Unsplash CDN size hint so we don't ship
 * 5 MB originals.
 */
export interface DemoCase {
  id: string;
  imageUrl: string;
  alt: string;
  category: string;
  title: string;
}

const UNSPLASH_PARAMS = "w=900&q=80&auto=format&fit=crop&crop=entropy";

/** Used by HomeHero collage and HomeRecentCases bootstrap fallback. */
export const DEMO_CASES: DemoCase[] = [
  {
    id: "demo-kitchen-modern",
    imageUrl: `https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?${UNSPLASH_PARAMS}`,
    alt: "Современная кухня в светлых тонах со встроенной техникой",
    category: "Кухня",
    title: "Современная кухня в светлых тонах",
  },
  {
    id: "demo-livingroom-scandi",
    imageUrl: `https://images.unsplash.com/photo-1600585154340-be6161a56a0c?${UNSPLASH_PARAMS}`,
    alt: "Гостиная в скандинавском стиле с диваном и журнальным столиком",
    category: "Гостиная",
    title: "Скандинавский стиль для гостиной",
  },
  {
    id: "demo-bedroom-minimal",
    imageUrl: `https://images.unsplash.com/photo-1616594039964-ae9021a400a0?${UNSPLASH_PARAMS}`,
    alt: "Минималистичная спальня с большой кроватью и натуральными материалами",
    category: "Спальня",
    title: "Минималистичная спальня",
  },
  {
    id: "demo-bathroom-loft",
    imageUrl: `https://images.unsplash.com/photo-1620626011761-996317b8d101?${UNSPLASH_PARAMS}`,
    alt: "Современная ванная комната с душевой и тёмной плиткой",
    category: "Ванная",
    title: "Лофт-санузел с душевой",
  },
  {
    id: "demo-kitchen-japandi",
    imageUrl: `https://images.unsplash.com/photo-1565183997392-2f6f122e5912?${UNSPLASH_PARAMS}`,
    alt: "Кухня-гостиная в стиле японди с деревянными фасадами",
    category: "Кухня‑гостиная",
    title: "Кухня-гостиная в стиле японди",
  },
  {
    id: "demo-livingroom-loft",
    imageUrl: `https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?${UNSPLASH_PARAMS}`,
    alt: "Лофт-гостиная с кирпичной стеной и большими окнами",
    category: "Гостиная",
    title: "Лофт-гостиная с кирпичной стеной",
  },
];

// ── Room categories for the home "Идеи по комнатам" rail ─────────────────────

/**
 * Top-level room categories shown on the homepage as a visual nav. Each
 * category gets its own dedicated photo so the rail looks distinct from the
 * Hero collage and the recent-cases grid below. When `/idei/{slug}` ships
 * (plan §11.11) the `href` becomes `/idei/{slug}`. Until then we point at
 * the catalog with the room as a query hint.
 */
export interface RoomCategory {
  slug: string;
  label: string;
  imageUrl: string;
  alt: string;
  /** Aspirational CTA copy below the label. */
  blurb: string;
}

export const ROOM_CATEGORIES: RoomCategory[] = [
  {
    slug: "kuhnya",
    label: "Кухня",
    imageUrl: `https://images.unsplash.com/photo-1556910103-1c02745aae4d?${UNSPLASH_PARAMS}`,
    alt: "Светлая кухня с островом и встроенной техникой",
    blurb: "Гарнитуры, острова, кухни-гостиные",
  },
  {
    slug: "vannaya",
    label: "Ванная",
    imageUrl: `https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?${UNSPLASH_PARAMS}`,
    alt: "Светлая ванная с большой ванной и мраморной плиткой",
    blurb: "Душевые, санузлы, обустройство",
  },
  {
    slug: "spalnya",
    label: "Спальня",
    imageUrl: `https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?${UNSPLASH_PARAMS}`,
    alt: "Спальня с мягким изголовьем и нейтральными тонами",
    blurb: "Уют, текстиль, освещение",
  },
  {
    slug: "gostinaya",
    label: "Гостиная",
    imageUrl: `https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?${UNSPLASH_PARAMS}`,
    alt: "Современная гостиная с диваном и большими окнами",
    blurb: "Зоны отдыха, мебель, декор",
  },
  {
    slug: "prihozhaya",
    label: "Прихожая",
    imageUrl: `https://images.unsplash.com/photo-1505691938895-1758d7feb511?${UNSPLASH_PARAMS}`,
    alt: "Прихожая с зеркалом и встроенным шкафом",
    blurb: "Хранение, зеркала, отделка",
  },
  {
    slug: "kabinet",
    label: "Кабинет",
    imageUrl: `https://images.unsplash.com/photo-1497366216548-37526070297c?${UNSPLASH_PARAMS}`,
    alt: "Домашний кабинет с письменным столом и книжной полкой",
    blurb: "Рабочее место, акустика, хранение",
  },
];
