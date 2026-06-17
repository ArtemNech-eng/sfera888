/**
 * Demo / placeholder cases for the home `Идеи` rail until our masters
 * publish enough real work (plan §20.4 photo policy).
 *
 * **Visual placeholders only.** Each demo card renders without a price tag
 * and without a master attribution — the badge "Пример" makes it explicit
 * that these are stylistic references, not real cases on the platform. As
 * soon as we have ≥6 real published cases, demos disappear from the rail.
 *
 * Photos are Unsplash (CC0 license, free for commercial use without
 * attribution). We still add a discreet "Изображения‑референсы — Unsplash"
 * line in the Footer for transparency.
 *
 * Image URLs include the Unsplash CDN size hint (`w=900&q=80&auto=format
 * &fit=crop&crop=entropy`) so we don't ship a 5 MB original.
 */
export interface DemoCase {
  id: string;
  imageUrl: string;
  alt: string;
  category: string;
  title: string;
}

const UNSPLASH_PARAMS = "w=900&q=80&auto=format&fit=crop&crop=entropy";

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
