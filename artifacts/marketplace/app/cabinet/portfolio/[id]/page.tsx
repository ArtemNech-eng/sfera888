import type { Metadata } from "next";
import { PortfolioDetailView } from "./PortfolioDetailView";

export const metadata: Metadata = { title: "Кейс" };
export const dynamic = "force-dynamic";

/**
 * `/cabinet/portfolio/[id]` — read-only case detail (plan §18.3 W2).
 *
 * Replaces the V1 placeholder. Editor (upload, AI helpers, delete) still
 * lives in master-pwa and is reached via deep-link.
 */
export default async function CabinetPortfolioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = parseInt(id, 10);
  return <PortfolioDetailView id={Number.isFinite(numericId) ? numericId : null} />;
}
