import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { fetchDesign, fetchRecentDesigns } from "../../../lib/api";
import { publicUrl, dizajnRevalidateSeconds } from "../../../lib/env";
import { DesignBoard } from "../../../components/dizajn/DesignBoard";
import { DesignBoardPending } from "../../../components/dizajn/DesignBoardPending";
import { DesignsAggregate } from "../../../components/dizajn/DesignsAggregate";
import { parseRoute } from "./parseRoute";
import { buildDesignJsonLd } from "./buildDesignJsonLd";
import { isIndexableDesignStatus, NOINDEX_ROBOTS } from "../../../lib/dizajnIndexing";

/**
 * `/dizajn/[slug]` — двойного назначения роут (Iter 1 + Iter 2):
 *
 * 1) **Full design slug** (`{room}-{style}-{nanoid8}`, e.g. `vannaya-modern-x7k9p2ab`)
 *    — рендер DesignBoard или DesignBoardPending в зависимости от status.
 *    Это L1 SEO-двигатель — каждый успешный дизайн = одна landing-страница.
 *
 * 2) **Aggregate combo** (`{room}-{style}`, `{room}` или `{style}`)
 *    — рендер DesignsAggregate с grid'ом дизайнов в этой категории.
 *    Pre-defined SEO-страницы для всех 49 комбинаций room×style (7×7) + 14
 *    одиночных (7 rooms + 7 styles). Эти URL живут в sitemap.
 *
 * Disambiguation: full slug заканчивается на 8-символьный nanoid (lowercase
 * alphanumeric). Если последний segment не такой — значит это aggregate.
 *
 * Кэширование (ISR): страница статически кэшируется на `revalidate` секунд.
 * Интервал ревалидации конфигурируется через env `DIZAJN_ISR_REVALIDATE_SECONDS`
 * (по умолчанию 3600). Значение `0` ⇒ страница становится полностью статической
 * после первой генерации (`revalidate = false`, кэш бессрочный), а обновление
 * приходит только через on-demand `revalidatePath` из воркера (Req 9.4/9.5).
 * Персональные данные (save-state, owner-бейдж) НЕ рендерятся на сервере —
 * они догидрируются на клиенте (DesignBoard читает cookie для owner-бейджа,
 * SaveButton дотягивает saved-state по /api/dizajn/[slug]). Завершение
 * генерации мгновенно сбрасывает кэш через revalidatePath из воркера
 * (lib/designWorker.ts), поэтому "generating" не залипает.
 */

// Route-segment ISR config. Next.js requires this export to be a STATICALLY
// analyzable literal — a ternary or env-derived value fails the build with
// "Unsupported node type ConditionalExpression at revalidate". We therefore fix
// the background ISR window to a literal default (1 час). Freshness on
// generation-completion is driven by on-demand `revalidatePath()` from the
// worker (lib/designWorker.ts), not by this interval, so a "generating" page
// never залипает независимо от значения здесь.
export const revalidate = 3600;

// TTL кэша data-fetch'а дизайна (runtime-значение, не segment config — Next
// допускает здесь вычисляемое значение). Конфигурируется env
// `DIZAJN_ISR_REVALIDATE_SECONDS`: `0` ⇒ практически бессрочный кэш (1 год),
// чтобы fetch не переводил статический роут в динамический; обновление
// приходит через `revalidatePath` из воркера.
const CONFIGURED_REVALIDATE_SECONDS = dizajnRevalidateSeconds();
const DESIGN_REVALIDATE_SECONDS =
  CONFIGURED_REVALIDATE_SECONDS === 0 ? 31_536_000 : CONFIGURED_REVALIDATE_SECONDS;

interface RouteParams {
  slug: string;
}

// ── Metadata ────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<RouteParams> },
): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parseRoute(slug);
  if (!parsed) {
    return { robots: NOINDEX_ROBOTS };
  }

  if (parsed.kind === "design" && parsed.slug) {
    const design = await fetchDesign(parsed.slug, null, { revalidate: DESIGN_REVALIDATE_SECONDS });
    if (!design) return { robots: NOINDEX_ROBOTS };
    if (!isIndexableDesignStatus(design.status)) {
      return {
        title: { absolute: "Создаём дизайн-проект…" },
        robots: NOINDEX_ROBOTS,
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
    nursery: "детской",
    apartment: "квартиры",
  };
  const STYLE: Record<string, string> = {
    modern: "Современный",
    scandinavian: "Скандинавский",
    loft: "Лофт",
    minimalism: "Минимализм",
    neoclassic: "Неоклассика",
    japandi: "Японди",
    classic: "Классика",
  };
  const STYLE_GEN: Record<string, string> = {
    modern: "современной",
    scandinavian: "скандинавской",
    loft: "в стиле лофт",
    minimalism: "минималистичной",
    neoclassic: "неоклассической",
    japandi: "в стиле японди",
    classic: "классической",
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
    // Без anonId — ответ кэшируемый (ISR). Персональные данные (save/owner)
    // догидрируются на клиенте.
    const design = await fetchDesign(parsed.slug, null, { revalidate: DESIGN_REVALIDATE_SECONDS });
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

    const jsonLd = buildDesignJsonLd(design, baseUrl, slug);

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
