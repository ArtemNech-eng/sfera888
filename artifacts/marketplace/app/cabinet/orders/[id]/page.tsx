import type { Metadata } from "next";
import { PlaceholderPage } from "../../_components/PlaceholderPage";

export const metadata: Metadata = { title: "Заказ" };

export default async function CabinetOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage
      title={`Заказ №${id}`}
      subtitle="Детали заказа и кнопки действий появятся здесь после переноса."
    />
  );
}
