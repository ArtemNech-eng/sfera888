import type { Metadata } from "next";
import { PlaceholderPage } from "../_components/PlaceholderPage";

export const metadata: Metadata = { title: "Расписание" };

export default function CabinetSchedulePage() {
  return (
    <PlaceholderPage
      title="Расписание"
      subtitle="Дни и слоты, когда вы готовы брать заказы."
    />
  );
}
