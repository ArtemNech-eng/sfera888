import type { Metadata } from "next";
import { PlaceholderPage } from "../_components/PlaceholderPage";

export const metadata: Metadata = { title: "Чат с диспетчером" };

export default function CabinetChatPage() {
  return (
    <PlaceholderPage
      title="Чат с диспетчером"
      subtitle="Уточняйте заказы, отправляйте чеки и фото."
    />
  );
}
