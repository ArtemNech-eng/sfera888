import type { Metadata } from "next";
import { PlaceholderPage } from "../_components/PlaceholderPage";

export const metadata: Metadata = { title: "Профиль" };

export default function CabinetProfilePage() {
  return (
    <PlaceholderPage
      title="Профиль"
      subtitle="Контакты, специальности, документы, аватар."
    />
  );
}
