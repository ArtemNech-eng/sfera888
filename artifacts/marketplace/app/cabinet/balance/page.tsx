import type { Metadata } from "next";
import { BalanceView } from "./BalanceView";

export const metadata: Metadata = { title: "Баланс" };
export const dynamic = "force-dynamic";

/**
 * `/cabinet/balance` — master's commission ledger and payment-proof flow.
 *
 * Replaces the V1 "Coming soon" placeholder. This is the first cabinet
 * route ported from master-pwa as part of plan §18.3 Week 2.
 *
 * The page is a server component but defers the entire render to the
 * client `BalanceView` because:
 *   • the data is per-master (cookie-scoped) and changes on every payment,
 *   • the photo-upload UX needs file inputs and a transient pending state,
 *   • toast notifications need the `sonner` provider mounted in the layout.
 */
export default function CabinetBalancePage() {
  return <BalanceView />;
}
