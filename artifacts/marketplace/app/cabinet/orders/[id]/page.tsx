import type { Metadata } from "next";
import { OrderDetailView } from "./OrderDetailView";

export const metadata: Metadata = { title: "Заказ" };
export const dynamic = "force-dynamic";

/**
 * `/cabinet/orders/[id]` — full order detail with action handlers
 * (plan §18.3 W2). Replaces the V1 placeholder.
 *
 * Closes the loop on the cabinet shell: list → detail → actions stay inside
 * chestnye-mastera.ru, no more deep-links to master-pwa for order workflow.
 */
export default async function CabinetOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = parseInt(id, 10);
  return <OrderDetailView id={Number.isFinite(numericId) ? numericId : null} />;
}
