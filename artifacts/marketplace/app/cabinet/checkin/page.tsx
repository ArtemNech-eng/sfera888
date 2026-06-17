import type { Metadata } from "next";
import { PlaceholderPage } from "../_components/PlaceholderPage";

export const metadata: Metadata = { title: "Чек-ин" };

export default function CabinetCheckinPage() {
  return (
    <PlaceholderPage
      title="Чек-ин"
      subtitle="Подтвердите готовность к работе на сегодня."
    />
  );
}
