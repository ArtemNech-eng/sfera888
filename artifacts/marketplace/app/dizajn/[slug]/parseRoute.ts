/**
 * Pure route-classification for `/dizajn/[slug]` (extracted from `page.tsx`).
 *
 * This module is intentionally **pure** and free of server-only imports
 * (no `next/navigation`, no `lib/api`, no React components) so that it can be
 * imported and exercised deterministically by the route-parsing property test
 * (ai-design-flagship, Property 15) without dragging in the Next.js request
 * machinery.
 *
 * `parseRoute(segment)` classifies a single `/dizajn/{segment}` URL segment:
 *
 * 1) **Full design slug** (`{room}-{style}-{nanoid}`, e.g.
 *    `vannaya-modern-x7k9p2ab`) → `{ kind: "design", slug }` → full route
 *    (`Public_Page` / `Pending_Page`).
 *
 * 2) **Aggregate combination** (`{room}-{style}`, `{room}` or `{style}` using the
 *    known room/style enums) → `{ kind: "aggregate", room?, style? }` →
 *    `Aggregate_Page`.
 *
 * 3) **Anything else** → `null`, which drives a `404` + `noindex` upstream.
 *
 * Disambiguation: a full design slug ends with a 6–8 char lowercase-alphanumeric
 * nanoid. If the trailing segment is not such a nanoid, the segment is treated
 * as an aggregate combination.
 *
 * The classification contract is unchanged from the original inline
 * implementation — this is a structural extraction only (Requirements 9.6, 10.4).
 */

/** Known room enums accepted on aggregate routes (both `-` and `_` spellings). */
export const VALID_ROOMS = new Set([
  "bathroom",
  "kitchen",
  "living-room",
  "living_room",
  "bedroom",
  "hallway",
  "nursery",
  "apartment",
]);

/** Known design-style enums accepted on aggregate routes. */
export const VALID_STYLES = new Set([
  "modern",
  "scandinavian",
  "loft",
  "minimalism",
  "neoclassic",
  "japandi",
  "classic",
]);

/** Result of classifying a `/dizajn/{segment}` URL segment. */
export interface ParsedRoute {
  kind: "design" | "aggregate";
  /** for design: full slug. */
  slug?: string;
  /** for aggregate: matched room/style enums, normalized (`living_room`). */
  room?: string;
  style?: string;
}

/** Normalize a room enum to its canonical underscore spelling (`living_room`). */
export function normalizeRoom(room: string): string {
  return room.replace(/-/g, "_");
}

/**
 * Classify a single `/dizajn/{segment}` URL segment into a full-design route,
 * an aggregate route, or `null` (→ 404 + noindex).
 *
 * Pure & deterministic: the result depends only on `segment`.
 */
export function parseRoute(segment: string): ParsedRoute | null {
  const segments = segment.split("-");
  const last = segments[segments.length - 1] ?? "";
  // Full design slug: ends with 6-8 char alphanumeric nanoid.
  if (segments.length >= 3 && /^[a-z0-9]{6,8}$/.test(last)) {
    return { kind: "design", slug: segment };
  }

  // Aggregate combo. Try to match room + style (both, or one).
  // Room may be single segment (`bathroom`) or two segments (`living-room`).
  // Style is always single segment.
  let matchedRoom: string | undefined;
  let matchedStyle: string | undefined;

  // Variant A: 2 segments — `{room}-{style}` or `{style}-{room}`.
  // Variant B: 3 segments — `{room2-segments}-{style}` (e.g. living-room-modern).
  // Variant C: 1 segment — only room or only style.

  if (segments.length === 1) {
    const s = segments[0]!;
    if (VALID_ROOMS.has(s)) matchedRoom = normalizeRoom(s);
    else if (VALID_STYLES.has(s)) matchedStyle = s;
  } else if (segments.length === 2) {
    const [a, b] = segments;
    if (VALID_ROOMS.has(a!) && VALID_STYLES.has(b!)) {
      matchedRoom = normalizeRoom(a!);
      matchedStyle = b!;
    } else if (VALID_STYLES.has(a!) && VALID_ROOMS.has(b!)) {
      matchedRoom = normalizeRoom(b!);
      matchedStyle = a!;
    } else if (VALID_ROOMS.has(`${a}-${b}`)) {
      matchedRoom = normalizeRoom(`${a}-${b}`);
    }
  } else if (segments.length === 3) {
    // living-room-modern
    const room2 = `${segments[0]}-${segments[1]}`;
    const stylePart = segments[2]!;
    if (VALID_ROOMS.has(room2) && VALID_STYLES.has(stylePart)) {
      matchedRoom = normalizeRoom(room2);
      matchedStyle = stylePart;
    }
  }

  if (matchedRoom || matchedStyle) {
    return { kind: "aggregate", room: matchedRoom, style: matchedStyle };
  }
  return null;
}
