import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { fetchDesign } from "../../../lib/api";
import { publicUrl } from "../../../lib/env";
import { DesignBoard } from "../../../components/dizajn/DesignBoard";
import { DesignBoardPending } from "../../../components/dizajn/DesignBoardPending";

/**
 * `/dizajn/[slug]` — страница AI-дизайн-проекта.
 *
 * Server-component с двумя ветками рендера:
 *   • status='completed' — полный design-board (server-rendered, SEO-rich).
 *     JSON-LD ImageObject + meta-tags + og-image для соцсетей.
 *   • status='generating' / 'failed' — client polling component с прогрессом.
 *
 * Это ключевая SEO-поверхность: каждый успешный дизайн = одна landing page
 * с index'ируемым контентом (h1, materials table, estimate, solutions).
 */

export const dynamic = "force-dynamic";

interface RouteParams {
  slug: string;
}

export async function generateMetadata(
  { params }: { params: Promise<RouteParams> },
): Promise<Metadata> {
  const { slug } = await params;
  const design = await fetchDesign(slug);
  if (!design) {
    return { robots: { index: false, follow: false } };
  }

  // Generating / failed — не индексируем (контент ещё неполный).
  if (design.status !== "completed") {
    return {
      title: { absolute: "Создаём дизайн-проект…" },
      robots: { index: false, follow: false },
    };
  }

  return {
    title: { absolute: design.seoTitle ?? `${design.h1} — Честные мастера` },
    description: design.seoDescription ?? `AI-дизайн-проект: ${design.h1}. С материалами, сметой и мастерами для реализации.`,
    alternates: { canonical: `${publicUrl()}/dizajn/${slug}` },
    openGraph: {
      title: design.h1 ?? "AI-дизайн-проект",
      description: design.seoDescription ?? undefined,
      type: "article",
      url: `${publicUrl()}/dizajn/${slug}`,
      images: design.resultImageUrl ? [{ url: design.resultImageUrl, width: 1024, height: 768, alt: design.h1 ?? "AI-дизайн" }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: design.h1 ?? "AI-дизайн-проект",
      description: design.seoDescription ?? undefined,
      images: design.resultImageUrl ? [design.resultImageUrl] : undefined,
    },
  };
}

export default async function DesignPage(
  { params }: { params: Promise<RouteParams> },
) {
  const { slug } = await params;
  const design = await fetchDesign(slug);
  if (!design) notFound();

  // JSON-LD только для completed проектов.
  const jsonLd = design.status === "completed" && design.resultImageUrl
    ? {
        "@context": "https://schema.org",
        "@type": "CreativeWork",
        "@id": `${publicUrl()}/dizajn/${slug}`,
        name: design.h1,
        description: design.description ?? design.seoDescription,
        image: {
          "@type": "ImageObject",
          url: design.resultImageUrl,
          width: 1024,
          height: 768,
        },
        url: `${publicUrl()}/dizajn/${slug}`,
        author: { "@type": "Organization", name: "Честные мастера" },
        datePublished: design.createdAt,
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
        <DesignBoard design={design} />
      ) : (
        <DesignBoardPending slug={slug} initialDesign={design} />
      )}
    </>
  );
}
