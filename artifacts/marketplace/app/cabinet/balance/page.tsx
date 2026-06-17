import type { Metadata } from "next";
import { PlaceholderPage } from "../_components/PlaceholderPage";

export const metadata: Metadata = { title: "Баланс" };

export default function CabinetBalancePage() {
  return (
    <PlaceholderPage
      title="Баланс"
      subtitle="Депозит, комиссии, история транзакций."
    />
  );
}
