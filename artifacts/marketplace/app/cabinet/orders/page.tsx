import type { Metadata } from "next";
import { PlaceholderPage } from "../_components/PlaceholderPage";

export const metadata: Metadata = { title: "Заказы" };

export default function CabinetOrdersPage() {
  return (
    <PlaceholderPage
      title="Заказы"
      subtitle="Доступные и принятые заказы в одном месте."
    />
  );
}
