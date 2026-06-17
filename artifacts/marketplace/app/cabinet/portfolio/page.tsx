import type { Metadata } from "next";
import { PortfolioListView } from "./PortfolioListView";

export const metadata: Metadata = { title: "Кейсы и портфолио" };
export const dynamic = "force-dynamic";

/**
 * `/cabinet/portfolio` — read-only list of the master's cases (plan §18.3 W2).
 *
 * Replaces the V1 placeholder with a working grid that mirrors what the
 * master sees on /master/[slug] — published cases plus drafts. Editing
 * (create / upload photos / AI assistant) still happens in master-pwa.
 */
export default function CabinetPortfolioPage() {
  return <PortfolioListView />;
}
