import type { Metadata } from "next";
import { getCurrentMaster } from "@/lib/cabinetAuth";
import { redirect } from "next/navigation";
import { PortfolioEditor } from "../_PortfolioEditor";

export const metadata: Metadata = { title: "Новый кейс" };
export const dynamic = "force-dynamic";

/**
 * `/cabinet/portfolio/new` — create-mode editor (plan §18.3 W2).
 *
 * Renders the shared `<PortfolioEditor>` with no existing item. The first
 * photo upload silently calls POST /portfolio to create a draft and rewrites
 * the URL to `/cabinet/portfolio/{id}/edit` so a refresh keeps the draft.
 */
export default async function CabinetPortfolioNewPage() {
  const master = await getCurrentMaster();
  if (!master) redirect("/login?next=/cabinet/portfolio/new");
  return <PortfolioEditor existingItem={null} masterCity={master.city} />;
}
