import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentMaster } from "@/lib/cabinetAuth";
import { PortfolioEditLoader } from "./PortfolioEditLoader";

export const metadata: Metadata = { title: "Редактировать кейс" };
export const dynamic = "force-dynamic";

/**
 * `/cabinet/portfolio/[id]/edit` — edit-mode portfolio case (plan §18.3 W2).
 *
 * The api-server has no `GET /portfolio/:id`, so we fetch the full list
 * client-side via `<PortfolioEditLoader>` and render `<PortfolioEditor>`
 * once the matching record arrives. Keeps a single fetch path consistent
 * with the read-only detail view.
 */
export default async function CabinetPortfolioEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const master = await getCurrentMaster();
  const { id } = await params;
  if (!master) redirect(`/login?next=/cabinet/portfolio/${id}/edit`);
  const numericId = parseInt(id, 10);
  return (
    <PortfolioEditLoader
      id={Number.isFinite(numericId) ? numericId : null}
      masterCity={master.city}
    />
  );
}
