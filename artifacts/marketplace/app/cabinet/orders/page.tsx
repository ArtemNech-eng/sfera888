import type { Metadata } from "next";
import { OrdersView } from "./OrdersView";

export const metadata: Metadata = { title: "Заказы" };
export const dynamic = "force-dynamic";

/**
 * `/cabinet/orders` — read-only list with three tabs (plan §18.3 W2).
 *
 * Replaces the V1 placeholder with a working list that the master uses to
 * scan available, active and completed orders. Order actions deep-link to
 * the master-pwa app while we port them route by route.
 */
export default function CabinetOrdersPage() {
  return <OrdersView />;
}
