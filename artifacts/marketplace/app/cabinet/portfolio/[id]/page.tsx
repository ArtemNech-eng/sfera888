import type { Metadata } from "next";
import { PlaceholderPage } from "../../_components/PlaceholderPage";

export const metadata: Metadata = { title: "Редактирование кейса" };

export default async function CabinetPortfolioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PlaceholderPage
      title={`Кейс №${id}`}
      subtitle="Редактор кейса с тегами, фото до/после, описанием."
    />
  );
}
