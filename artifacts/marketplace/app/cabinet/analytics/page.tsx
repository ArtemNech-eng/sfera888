import type { Metadata } from "next";
import { AnalyticsView } from "./AnalyticsView";

export const metadata: Metadata = { title: "Моя аналитика" };
export const dynamic = "force-dynamic";

/**
 * `/cabinet/analytics` — master conversion analytics (plan §18.3 W2 polish).
 *
 * New route (no V1 placeholder existed). Surfaces the same data the master
 * sees in master-pwa profile's "Моя аналитика" accordion, but as a full
 * page with breathing room — most masters check it weekly so deserves
 * proper layout.
 */
export default function CabinetAnalyticsPage() {
  return <AnalyticsView />;
}
