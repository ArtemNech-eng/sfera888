import type { Metadata } from "next";
import { WalletView } from "./WalletView";

export const metadata: Metadata = { title: "Кошелёк" };
export const dynamic = "force-dynamic";

/**
 * `/cabinet/wallet` — token-style account balance for paid features
 * (plan §18.3 W2 polish). Distinct from `/cabinet/balance`, which tracks
 * commission debt; this one tracks the master's own funds spent on service
 * fees (token-based payment model).
 *
 * New route — there was no V1 placeholder. Linked from sidebar.
 */
export default function CabinetWalletPage() {
  return <WalletView />;
}
