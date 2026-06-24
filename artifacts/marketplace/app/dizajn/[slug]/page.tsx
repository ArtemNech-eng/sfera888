import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { fetchDesign, fetchRecentDesigns } from "../../../lib/api";
import { publicUrl } from "../../../lib/env";
import { DesignBoard } from "../../../components/dizajn/DesignBoard";
import { DesignBoardPending } from "../../../components/dizajn/DesignBoardPending";
import { DesignsAggregate } from "../../../components/dizajn/DesignsAggregate";

/**
 * `/dizajn/[slug]` — двойного назначения роут (Iter 1 + Iter 2):
 *
 * 1) **Full design slug** (`{room}-{style}-{nanoid8}`, e.g. `vannaya-modern-x7k9p2ab`)
 *    — рендер DesignBoard или DesignBoardPending в зависимости от status.
 *    Это L1 SEO-двигатель — каждый успешный дизайн = одна landing-страница.
 *
 * 2) **Aggregate combo** (`{room}-{style}`, `{room}` или `{style}`)
 *    — рендер DesignsAggregate с grid'ом дизайнов в этой категории.
 *    Pre-defined SEO-страницы для всех 36 комбинаций room×style + 12
 *    одиночных (6 rooms + 6 styles). Эти URL живут в sitemap.
 *
 * Disambiguation: full slug заканчивается на 8-символьный nanoid (lowercase
 * alphanumeric). Если последний segment не такой — значит это aggregate.
 */

export const dynamic = "force-dynamic";

interface RouteParams {
  slug: string;
}

const VALID_ROOMS = new Set([
  "bathroom",
  "kitchen",
  "living-room",
  "living_room",
  "bedroom",
  "hallway",
  "apartment",
]);
const VALID_STYLES = new Set([
  "modern",
  "scandinavian",
  "loft",
  "minimalism",
  "neoclassic",
  "japandi",
]);

interface ParsedRoute {
  kind: "design" | "aggregate";
  /** for design: full slug. */
  slug?: string;
  /** for aggregate: matched room/style enums, normalized (`living_room`). */
  room?: string;
  style?: string;
}

function parseRoute(combo: string): ParsedRoute | null {
  const segments = combo.split("-");
  const last = segments[segments.length - 1] ?? "";
  // Full design slug: ends with 6-8 char alphanumeric nanoid.
  if (segments.length >= 3 && /^[a-z0-9]{6,8}$/.test(last)) {
    return { kind: "design", slug: combo };
  }

  // Aggregate combo. Try to match room + style (both, or one).
  // Room may be single segment (`bathroom`) or two segments (`living-room`).
  // Style is always single segment.
  let matchedRoom: string | undefined;
  let matchedStyle: string | undefined;

  // Variant A: 2 segments — `{room}-{style}` or `{style1}-{style2}` (no second style possible, one is always room/style).
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

function normalizeRoom(room: string): string {
  return room.replace(/-/g, "_");
}

const ROOM_BREADCRUMB: Record<string, string> = {
  bathroom: "Ванная",
  kitchen: "Кухня",
  living_room: "Гостиная",
  bedroom: "Спальня",
  hallway: "Прихожая",
  apartment: "Квартира",
  nursery: "Детская",
};

// ── Metadata ────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<RouteParams> },
): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parseRoute(slug);
  if (!parsed) {
    return { robots: { index: false, follow: false } };
  }

  if (parsed.kind === "design" && parsed.slug) {
    const design = await fetchDesign(parsed.slug);
    if (!design) return { robots: { index: false, follow: false } };
    if (design.status !== "completed") {
      return {
        title: { absolute: "Создаём дизайн-проект…" },
        robots: { index: false, follow: false },
      };
    }
    return {
      title: { absolute: design.seoTitle ?? `${design.h1} — Честные мастера` },
      description: design.seoDescription ?? `AI-дизайн-проект: ${design.h1}.`,
      alternates: { canonical: `${publicUrl()}/dizajn/${slug}` },
      openGraph: {
        title: design.h1 ?? "AI-дизайн-проект",
        description: design.seoDescription ?? undefined,
        type: "article",
        url: `${publicUrl()}/dizajn/${slug}`,
        images: design.resultImageUrl
          ? [{ url: design.resultImageUrl, width: 1024, height: 768, alt: design.h1 ?? "AI-дизайн" }]
          : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title: design.h1 ?? "AI-дизайн-проект",
        description: design.seoDescription ?? undefined,
        images: design.resultImageUrl ? [design.resultImageUrl] : undefined,
      },
    };
  }

  // aggregate
  const aggregateMeta = buildAggregateMeta(parsed.room ?? null, parsed.style ?? null);
  return {
    title: { absolute: aggregateMeta.title },
    description: aggregateMeta.description,
    alternates: { canonical: `${publicUrl()}/dizajn/${slug}` },
    openGraph: {
      title: aggregateMeta.title,
      description: aggregateMeta.description,
      type: "website",
      url: `${publicUrl()}/dizajn/${slug}`,
    },
  };
}

function buildAggregateMeta(room: string | null, style: string | null): { title: string; description: string } {
  const ROOM: Record<string, string> = {
    bathroom: "ванной",
    kitchen: "кухни",
    living_room: "гостиной",
    bedroom: "спальни",
    hallway: "прихожей",
    apartment: "квартиры",
  };
  const STYLE: Record<string, string> = {
    modern: "Современный",
    scandinavian: "Скандинавский",
    loft: "Лофт",
    minimalism: "Минимализм",
    neoclassic: "Неоклассика",
    japandi: "Японди",
  };
  const STYLE_GEN: Record<string, string> = {
    modern: "современной",
    scandinavian: "скандинавской",
    loft: "в стиле лофт",
    minimalism: "минималистичной",
    neoclassic: "неоклассической",
    japandi: "в стиле японди",
  };
  if (room && style) {
    const t = `Дизайн ${STYLE_GEN[style] ?? style} ${ROOM[room] ?? room} — AI-проекты`;
    return {
      title: t.slice(0, 70),
      description: `AI-дизайн-проекты ${ROOM[room] ?? room} в ${STYLE[style] ?? style} стиле — 4 ракурса, материалы, смета, мастера для реализации.`.slice(0, 200),
    };
  }
  if (room) {
    return {
      title: `Идеи дизайна ${ROOM[room] ?? room} — AI-проекты`.slice(0, 70),
      description: `Все стили ${ROOM[room] ?? room}: современный, скандинавский, лофт, минимализм. AI-дизайн-проекты с материалами и сметой.`.slice(0, 200),
    };
  }
  if (style) {
    return {
      title: `${STYLE[style]} стиль — AI-дизайны интерьеров`.slice(0, 70),
      description: `AI-проекты в ${STYLE[style]?.toLowerCase()} стиле для разных помещений — ванные, кухни, гостиные, спальни. С материалами и сметой.`.slice(0, 200),
    };
  }
  return { title: "AI-дизайны интерьеров", description: "AI-дизайн-проекты с материалами, сметой и мастерами." };
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function DesignSlugPage(
  { params }: { params: Promise<RouteParams> },
) {
  const { slug } = await params;
  const parsed = parseRoute(slug);
  if (!parsed) notFound();

  if (parsed.kind === "design" && parsed.slug) {
    const cookieStore = await cookies();
    const anonId = cookieStore.get("kiro_anon_id")?.value ?? null;
    const design = await fetchDesign(parsed.slug, anonId);
    if (!design) notFound();

    // Smart-similar buckets — параллельно (3 запроса).
    let similar: {
      sameRoomStyle: typeof design extends never ? never : Awaited<ReturnType<typeof fetchRecentDesigns>>;
      sameStyle: Awaited<ReturnType<typeof fetchRecentDesigns>>;
      similarBudget: Awaited<ReturnType<typeof fetchRecentDesigns>>;
    } | undefined = undefined;

    if (design.status === "completed") {
      const [sameRoomStyle, sameStyle, similarBudget] = await Promise.all([
        fetchRecentDesigns({ limit: 4, room: design.roomType, style: design.style }),
        fetchRecentDesigns({ limit: 4, style: design.style }),
        fetchRecentDesigns({ limit: 6 }),
      ]);
      // Исключаем сам этот проект из выдачи.
      const exclude = (items: typeof sameRoomStyle) => items.filter((it) => it.slug !== design.slug);
      similar = {
        sameRoomStyle: exclude(sameRoomStyle).slice(0, 3),
        sameStyle: exclude(sameStyle).slice(0, 3),
        similarBudget: exclude(similarBudget).slice(0, 3),
      };
    }

    const baseUrl = publicUrl();
    const pageUrl = `${baseUrl}/dizajn/${slug}`;
    const aggregateRoomStyleUrl = `${baseUrl}/dizajn/${design.roomType.replace(/_/g, "-")}-${design.style}`;

    const jsonLd = design.status === "completed" && design.resultImageUrl
      ? {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Article",
              "@id": `${pageUrl}#article`,
              mainEntityOfPage: pageUrl,
              headline: design.h1,
              description: design.description ?? design.seoDescription,
              image: [
                design.resultImageUrl,
                ...(design.views ?? []).map((v) => v.url),
              ],
              author: { "@type": "Organization", name: "Честные мастера", url: baseUrl },
              publisher: {
                "@type": "Organization",
                name: "Честные мастера",
                url: baseUrl,
              },
              datePublished: design.createdAt,
              dateModified: design.createdAt,
              about: {
                "@type": "Thing",
                name: design.h1,
              },
              keywords: [design.h1, design.style, design.roomType, design.cityName].filter(Boolean).join(", "),
            },
            {
              "@type": "BreadcrumbList",
              "@id": `${pageUrl}#breadcrumb`,
              itemListElement: [
                {
                  "@type": "ListItem",
                  position: 1,
                  name: "Главная",
                  item: baseUrl,
                },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: "AI-дизайн",
                  item: `${baseUrl}/dizajn`,
                },
                {
                  "@type": "ListItem",
                  position: 3,
                  name: ROOM_BREADCRUMB[design.roomType] ?? "Категория",
                  item: aggregateRoomStyleUrl,
                },
                {
                  "@type": "ListItem",
                  position: 4,
                  name: design.h1 ?? `Проект №${design.id}`,
                  item: pageUrl,
                },
              ],
            },
            ...(design.budget
              ? [
                  {
                    "@type": "Service",
                    "@id": `${pageUrl}#service`,
                    name: `Реализация дизайн-проекта: ${design.h1}`,
                    serviceType: "Ремонт и отделка",
                    areaServed: design.cityName ?? undefined,
                    provider: {
                      "@type": "Organization",
                      name: "Честные мастера",
                      url: baseUrl,
                    },
                    offers: {
                      "@type": "Offer",
                      priceCurrency: "RUB",
                      price: design.budget,
                      availability: "https://schema.org/InStock",
                      url: pageUrl,
                    },
                  },
                ]
              : []),
            ...(design.views ?? []).map((v, i) => ({
              "@type": "ImageObject",
              "@id": `${pageUrl}#image-${i + 1}`,
              contentUrl: v.url,
              caption: v.label,
              width: 1024,
              height: 768,
            })),
          ],
        }
      : null;

    return (
      <>
        {jsonLd ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        ) : null}
        {design.status === "completed" ? (
          <DesignBoard
            design={design}
            similar={similar}
            baseUrl={baseUrl}
            topDownPlanUrl={design.topDownPlanUrl}
            pickedFurniture={design.pickedFurniture}
            currentStep={design.currentStep}
            designAnonId={design.designAnonId}
          />
        ) : (
          <DesignBoardPending slug={slug} initialDesign={design} />
        )}
      </>
    );
  }

  // aggregate
  const designs = await fetchRecentDesigns({
    limit: 24,
    room: parsed.room,
    style: parsed.style,
  });

  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${publicUrl()}/dizajn/${slug}`,
    url: `${publicUrl()}/dizajn/${slug}`,
    name: buildAggregateMeta(parsed.room ?? null, parsed.style ?? null).title,
    description: buildAggregateMeta(parsed.room ?? null, parsed.style ?? null).description,
    isPartOf: { "@type": "WebSite", url: publicUrl() },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }}
      />
      <DesignsAggregate
        designs={designs}
        room={parsed.room ?? null}
        style={parsed.style ?? null}
      />
    </>
  );
}
