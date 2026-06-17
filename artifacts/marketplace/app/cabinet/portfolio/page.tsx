import type { Metadata } from "next";
import { PlaceholderPage } from "../_components/PlaceholderPage";

export const metadata: Metadata = { title: "Кейсы и портфолио" };

export default function CabinetPortfolioPage() {
  return (
    <PlaceholderPage
      title="Кейсы и портфолио"
      subtitle="Реальные работы, которые попадают в раздел Работы и каталог Идей."
    />
  );
}
