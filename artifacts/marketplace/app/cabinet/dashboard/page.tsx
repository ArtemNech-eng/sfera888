import type { Metadata } from "next";
import { PlaceholderPage } from "../_components/PlaceholderPage";

export const metadata: Metadata = { title: "Метрики" };

export default function CabinetDashboardPage() {
  return (
    <PlaceholderPage
      title="Метрики"
      subtitle="Просмотры профиля, лиды, конверсия, заполненность профиля."
    />
  );
}
