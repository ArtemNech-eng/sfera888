import type { Metadata } from "next";
import { DashboardView } from "./DashboardView";

export const metadata: Metadata = { title: "Дашборд" };
export const dynamic = "force-dynamic";

/**
 * `/cabinet/dashboard` — master's overview after login (plan §18).
 *
 * Replaces the V1 placeholder with a working dashboard that pulls
 * `/api/cabinet/home` (proxy → master-pwa /home). Read-only by design in
 * this iteration: counts, recent cards, navigation shortcuts. Order
 * actions (accept / reject / complete) defer to /cabinet/orders proper
 * port.
 */
export default function CabinetDashboardPage() {
  return <DashboardView />;
}
